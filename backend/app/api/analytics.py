"""Analytics and model management routes."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
import io
import csv
from app.database.models import get_db, TelemetryRecord, DetectionResult, Alert, SimulationEvent, User
from app.services.auth import get_current_active_user, require_role
from app.ml.detector import get_detector, NORMAL_RANGES
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/analytics")
async def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    detector = get_detector()

    total_samples = db.query(DetectionResult).count()
    total_anomalies = db.query(DetectionResult).filter(DetectionResult.is_anomaly == True).count()
    total_normal = total_samples - total_anomalies

    # Alert severity breakdown
    alert_by_severity = {}
    for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        alert_by_severity[sev] = db.query(Alert).filter(Alert.severity == sev).count()

    # Scenario distribution
    scenario_counts = (
        db.query(DetectionResult.scenario, func.count(DetectionResult.id))
        .group_by(DetectionResult.scenario)
        .all()
    )
    scenario_dist = {s: c for s, c in scenario_counts}

    # Detection trend: last 20 detections
    recent = db.query(DetectionResult).order_by(desc(DetectionResult.timestamp)).limit(20).all()
    trend = [
        {
            "timestamp": r.timestamp.isoformat(),
            "sensor": r.sensor,
            "anomaly_score": r.anomaly_score,
            "is_anomaly": r.is_anomaly,
        }
        for r in reversed(recent)
    ]

    # Alert type distribution
    attack_counts = (
        db.query(Alert.attack_type, func.count(Alert.id))
        .group_by(Alert.attack_type)
        .all()
    )
    attack_dist = {a: c for a, c in attack_counts}

    return {
        "total_samples": total_samples,
        "total_anomalies": total_anomalies,
        "total_normal": total_normal,
        "anomaly_rate": round(total_anomalies / max(total_samples, 1) * 100, 2),
        "alert_by_severity": alert_by_severity,
        "scenario_distribution": scenario_dist,
        "attack_type_distribution": attack_dist,
        "detection_trend": trend,
        "model_info": detector.get_status(),
        "note": "Precision/recall/F1 require ground-truth labels. Metrics shown are counts only.",
    }


@router.get("/model/status")
async def get_model_status(
    current_user: User = Depends(get_current_active_user),
):
    detector = get_detector()
    return detector.get_status()


@router.post("/model/train")
async def train_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Train (or retrain) the model on all available telemetry."""
    detector = get_detector()
    records = db.query(TelemetryRecord).order_by(TelemetryRecord.timestamp).all()
    if len(records) < detector.MIN_TRAINING_SAMPLES:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data. Need {detector.MIN_TRAINING_SAMPLES}, have {len(records)}"
        )
    readings = [{"sensor": r.sensor, "value": r.value} for r in records]
    success = detector.train(readings)
    if not success:
        raise HTTPException(status_code=500, detail="Training failed")
    return {"message": "Model trained successfully", "status": detector.get_status()}


class ThresholdUpdate(BaseModel):
    threshold: float


@router.patch("/model/threshold")
async def update_threshold(
    update: ThresholdUpdate,
    current_user: User = Depends(require_role("admin")),
):
    detector = get_detector()
    if not 0.0 < update.threshold < 1.0:
        raise HTTPException(status_code=400, detail="Threshold must be between 0 and 1")
    detector.threshold = update.threshold
    return {"message": f"Threshold updated to {update.threshold}", "threshold": update.threshold}


@router.post("/dataset/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin", "analyst")),
    db: Session = Depends(get_db),
):
    """Upload a CSV telemetry dataset for batch detection."""
    MAX_SIZE_MB = 50
    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_SIZE_MB}MB)")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted")

    try:
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    columns = list(rows[0].keys())
    row_count = len(rows)

    # Identify numeric columns
    numeric_cols = []
    for col in columns:
        try:
            float(rows[0][col])
            numeric_cols.append(col)
        except (ValueError, TypeError):
            pass

    # Missing value report
    missing = {col: sum(1 for r in rows if not r.get(col, "").strip()) for col in columns}

    # Run detection on first 500 rows
    detector = get_detector()
    detections = []
    for row in rows[:500]:
        for col in numeric_cols:
            try:
                val = float(row.get(col, 0))
            except (ValueError, TypeError):
                val = 0.0
            reading = {"sensor": col, "value": val}
            score, is_anomaly = detector.predict(reading)
            if is_anomaly:
                detections.append({
                    "column": col,
                    "value": val,
                    "anomaly_score": round(score, 4),
                    "severity": detector.get_severity(score),
                })

    # Preview
    preview = rows[:5]

    return {
        "filename": file.filename,
        "row_count": row_count,
        "columns": columns,
        "numeric_columns": numeric_cols,
        "missing_values": missing,
        "preview": preview,
        "detections_found": len(detections),
        "sample_detections": detections[:20],
        "note": "Synthetic sample data analysis only. Not SWaT/WADI benchmark data.",
    }
