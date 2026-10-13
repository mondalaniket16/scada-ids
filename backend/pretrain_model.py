"""
Pre-train the Isolation Forest model on synthetic normal SCADA telemetry.
Run once from E:\\ids\\backend directory:
    .venv\\Scripts\\python.exe pretrain_model.py

This ensures the system starts with a trained model at launch.
"""
import sys
import os
import math
import random

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.ml.detector import get_detector

SENSORS_LOCAL = {
    "LIT101": (400.0, 600.0),
    "FIT101": (1.2,   2.0),
    "AIT201": (2.5,   3.5),
    "AIT202": (250.0, 350.0),
    "AIT203": (100.0, 200.0),
    "FIT201": (0.8,   1.5),
    "MV101":  (0.0,   1.0),
    "P101":   (0.0,   1.0),
    "P102":   (0.0,   1.0),
}

BINARY = {"MV101", "P101", "P102"}


def generate_normal_readings(n_ticks=400):
    readings = []
    for tick in range(n_ticks):
        for sensor, (lo, hi) in SENSORS_LOCAL.items():
            if sensor in BINARY:
                value = round(random.choice([0.0, 1.0]))
            else:
                mid = (lo + hi) / 2.0
                amplitude = (hi - lo) * 0.15
                noise = random.gauss(0, (hi - lo) * 0.03)
                t = tick * 0.1
                value = mid + amplitude * math.sin(t) + noise
            readings.append({"sensor": sensor, "value": round(value, 4)})
    return readings


def main():
    print("=" * 50)
    print("SCADA IDS - Pre-training Isolation Forest model")
    print("=" * 50)

    detector = get_detector()

    if detector.is_trained:
        print(f"Model already trained. Re-training with fresh data...")

    readings = generate_normal_readings(n_ticks=400)
    print(f"Generated {len(readings)} synthetic normal readings")

    success = detector.train(readings)
    if success:
        status = detector.get_status()
        print("\nModel trained successfully!")
        print(f"  Algorithm   : {status['algorithm']}")
        print(f"  Samples     : {status['training_samples']}")
        print(f"  Threshold   : {status['threshold']}")
        print(f"  Model path  : {status['model_path']}")

        # Quick smoke test
        print("\n--- Smoke test: normal readings (should NOT be anomalous) ---")
        normal_test = [
            {"sensor": "LIT101", "value": 500.0},
            {"sensor": "FIT101", "value": 1.6},
            {"sensor": "AIT201", "value": 3.0},
            {"sensor": "MV101", "value": 1.0},
            {"sensor": "P101", "value": 0.0},
        ]
        all_ok = True
        for r in normal_test:
            score, is_anomaly = detector.predict(r)
            tag = "ANOMALY (FALSE POSITIVE!)" if is_anomaly else "normal"
            if is_anomaly:
                all_ok = False
            print(f"  {r['sensor']:8s}  value={r['value']:8.3f}  score={score:.4f}  => {tag}")

        print("\n--- Smoke test: anomalous readings (SHOULD be flagged) ---")
        anomaly_test = [
            {"sensor": "LIT101", "value": 50.0},
            {"sensor": "FIT101", "value": 15.0},
            {"sensor": "AIT202", "value": 2000.0},
        ]
        for r in anomaly_test:
            score, is_anomaly = detector.predict(r)
            tag = "ANOMALY (correct)" if is_anomaly else "missed (bug!)"
            print(f"  {r['sensor']:8s}  value={r['value']:8.3f}  score={score:.4f}  => {tag}")

        if all_ok:
            print("\nAll normal readings correctly classified as normal.")
        else:
            print("\nWARNING: Some normal readings flagged as anomalies - check threshold!")
    else:
        print("Training failed - not enough readings")
        sys.exit(1)


if __name__ == "__main__":
    main()
