"""
ML Detection Pipeline.

Uses Isolation Forest (scikit-learn) — fully compatible with Python 3.14 on Windows.
The model is trained lazily on the first batch of telemetry data, then persisted with joblib.
No TensorFlow/Keras/GPU required.
"""
import os
import numpy as np
import joblib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# Sensor features used for detection
FEATURE_SENSORS = ["LIT101", "FIT101", "AIT201", "AIT202", "AIT203",
                   "FIT201", "MV101", "P101", "P102"]

NORMAL_RANGES = {
    "LIT101": (250.0, 800.0),
    "FIT101": (0.8, 2.5),
    "AIT201": (1.5, 4.5),
    "AIT202": (200.0, 400.0),
    "AIT203": (50.0, 300.0),
    "FIT201": (0.5, 2.0),
    "MV101": (0.0, 1.0),
    "P101": (0.0, 1.0),
    "P102": (0.0, 1.0),
}

# Binary/discrete sensors where mid-point deviation is NOT anomalous
BINARY_SENSORS = {"MV101", "P101", "P102"}


class AnomalyDetector:
    """Isolation Forest-based anomaly detector for SCADA telemetry."""

    MODEL_VERSION = "1.0.0"
    ALGORITHM = "IsolationForest"

    def __init__(self, model_path: str, threshold: float = 0.5):
        self.model_path = model_path
        self.threshold = threshold
        self.model: Optional[IsolationForest] = None
        self.scaler: Optional[StandardScaler] = None
        self.is_trained = False
        self.trained_at: Optional[datetime] = None
        self.training_samples: int = 0
        self._training_buffer: List[Dict[str, float]] = []
        self.MIN_TRAINING_SAMPLES = 100

    def _extract_features(self, sensor_reading: Dict[str, Any]) -> np.ndarray:
        """Extract a feature vector from a sensor reading dict."""
        sensor = sensor_reading.get("sensor", "")
        value = float(sensor_reading.get("value", 0.0))
        lo, hi = NORMAL_RANGES.get(sensor, (0.0, 1000.0))
        # Normalized value
        norm = (value - lo) / max(hi - lo, 1.0)
        # Deviation from midpoint
        mid = (lo + hi) / 2.0
        dev = abs(value - mid) / max(hi - lo, 1.0)
        # Rate of change placeholder (0 for single readings)
        return np.array([value, norm, dev], dtype=np.float32)

    def _build_feature_matrix(self, readings: List[Dict[str, Any]]) -> np.ndarray:
        return np.array([self._extract_features(r) for r in readings])

    def train(self, readings: List[Dict[str, Any]]) -> bool:
        """Train or retrain the model on a batch of readings."""
        if len(readings) < self.MIN_TRAINING_SAMPLES:
            return False
        X = self._build_feature_matrix(readings)
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        self.model = IsolationForest(
            n_estimators=150,
            contamination=0.05,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_scaled)
        self.is_trained = True
        self.trained_at = datetime.now(timezone.utc)
        self.training_samples = len(readings)
        # Record the offset used to normalise scores: score at the decision boundary
        # IsolationForest.offset_ is the threshold such that score_samples < offset_ => anomaly
        self._score_offset = float(self.model.offset_)
        self._training_buffer.clear()  # free memory after training
        self._save()
        return True

    def _save(self):
        os.makedirs(os.path.dirname(self.model_path) or ".", exist_ok=True)
        joblib.dump({
            "model": self.model,
            "scaler": self.scaler,
            "score_offset": getattr(self, "_score_offset", None),
        }, self.model_path)

    def load(self) -> bool:
        """Load persisted model from disk."""
        if not os.path.exists(self.model_path):
            return False
        try:
            data = joblib.load(self.model_path)
            self.model = data["model"]
            self.scaler = data.get("scaler")
            self._score_offset = data.get("score_offset", getattr(self.model, "offset_", -0.1))
            self.is_trained = True
            # Restore training metadata if saved
            self.training_samples = getattr(self.model, "n_estimators", 0)
            return True
        except Exception:
            return False

    def predict(self, reading: Dict[str, Any]) -> Tuple[float, bool]:
        """
        Returns (anomaly_score 0-1, is_anomaly bool).
        Score > threshold → anomaly.

        Score semantics:
          0.0 = definitely normal
          0.5 = borderline (default threshold)
          1.0 = highly anomalous
        """
        sensor = reading.get("sensor", "")
        value = float(reading.get("value", 0.0))

        # ── Hard rule: values far outside physical range are always anomalous
        if sensor in NORMAL_RANGES:
            lo, hi = NORMAL_RANGES[sensor]
            if sensor not in BINARY_SENSORS:
                if value < lo * 0.5 or value > hi * 1.8:
                    return (0.95, True)

        if not self.is_trained or self.model is None:
            # Accumulate readings for lazy training
            self._training_buffer.append(reading)
            if len(self._training_buffer) >= self.MIN_TRAINING_SAMPLES:
                self.train(self._training_buffer)
                # If training just succeeded, fall through to ML path
                if self.is_trained:
                    return self.predict(reading)

            # ── Statistical fallback while model is untrained
            if sensor in BINARY_SENSORS:
                # Binary sensors: only flag completely impossible values
                if value < -0.1 or value > 1.1:
                    return (0.8, True)
                return (0.05, False)

            if sensor in NORMAL_RANGES:
                lo, hi = NORMAL_RANGES[sensor]
                mid = (lo + hi) / 2.0
                half_span = (hi - lo) / 2.0
                # Linear score: 0 at midpoint, 1 at range edge, >1 outside
                deviation_ratio = abs(value - mid) / max(half_span, 1e-9)
                score = min(1.0, deviation_ratio)
                return (round(score, 4), score > self.threshold)
            return (0.05, False)

        # ── Isolation Forest prediction
        features = self._extract_features(reading).reshape(1, -1)
        if self.scaler:
            features = self.scaler.transform(features)

        raw_score = self.model.score_samples(features)[0]
        # score_samples output: higher (less negative) = more normal
        # offset_ is the decision boundary; below it → anomaly
        # Map to [0, 1]: 0=normal, 1=very anomalous
        #   At boundary: raw=offset_ → normalized ≈ 0.5
        offset = getattr(self, "_score_offset", getattr(self.model, "offset_", -0.1))
        # Scale relative to offset with ±0.3 spread
        normalized = float(np.clip(0.5 + (offset - raw_score) / 0.6, 0.0, 1.0))
        is_anomaly = normalized > self.threshold
        return (round(normalized, 4), is_anomaly)

    def get_severity(self, score: float) -> str:
        if score >= 0.85:
            return "CRITICAL"
        elif score >= 0.7:
            return "HIGH"
        elif score >= 0.5:
            return "MEDIUM"
        else:
            return "LOW"

    def get_status(self) -> Dict[str, Any]:
        return {
            "name": "SCADA Anomaly Detector",
            "algorithm": self.ALGORITHM,
            "version": self.MODEL_VERSION,
            "status": "loaded" if self.is_trained else "untrained",
            "feature_count": 3,
            "threshold": self.threshold,
            "trained_at": self.trained_at.isoformat() if self.trained_at else None,
            "training_samples": self.training_samples,
            "model_path": self.model_path,
        }


# Singleton detector instance
_detector: Optional[AnomalyDetector] = None


def get_detector() -> AnomalyDetector:
    global _detector
    if _detector is None:
        from app.config import settings
        _detector = AnomalyDetector(
            model_path=settings.MODEL_PATH,
            threshold=settings.ANOMALY_THRESHOLD,
        )
        _detector.load()  # try to load saved model
    return _detector
