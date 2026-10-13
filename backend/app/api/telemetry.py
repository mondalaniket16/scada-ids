"""Telemetry, detection results, alerts, and history routes."""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from datetime import datetime
from app.database.models import (
    get_db, TelemetryRecord, DetectionResult, Alert, User
)
from app.services.auth import get_current_active_user, require_role
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["telemetry"])


class AlertUpdate(BaseModel):
    status: str  # ACKNOWLEDGED, RESOLVED
    acknowledged_by: Optional[str] = None


@router.get("/telemetry")
async def get_telemetry(
    sensor: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    q = db.query(TelemetryRecord).order_by(desc(TelemetryRecord.timestamp))
    if sensor:
        q = q.filter(TelemetryRecord.sensor == sensor)
    total = q.count()
    records = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "records": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "sensor": r.sensor,
                "value": r.value,
                "unit": r.unit,
                "scenario": r.scenario,
            }
            for r in records
        ]
    }


@router.get("/detections")
async def get_detections(
    sensor: Optional[str] = None,
    anomaly_only: bool = False,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    q = db.query(DetectionResult).order_by(desc(DetectionResult.timestamp))
    if sensor:
        q = q.filter(DetectionResult.sensor == sensor)
    if anomaly_only:
        q = q.filter(DetectionResult.is_anomaly == True)
    total = q.count()
    records = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "records": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "sensor": r.sensor,
                "value": r.value,
                "anomaly_score": r.anomaly_score,
                "is_anomaly": r.is_anomaly,
                "status": r.status,
                "scenario": r.scenario,
                "model_used": r.model_used,
            }
            for r in records
        ]
    }


@router.get("/alerts")
async def get_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    sensor: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    q = db.query(Alert).order_by(desc(Alert.timestamp))
    if severity:
        q = q.filter(Alert.severity == severity.upper())
    if status:
        q = q.filter(Alert.status == status.upper())
    if sensor:
        q = q.filter(Alert.sensor == sensor)
    total = q.count()
    records = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "records": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "sensor": r.sensor,
                "value": r.value,
                "anomaly_score": r.anomaly_score,
                "severity": r.severity,
                "attack_type": r.attack_type,
                "status": r.status,
                "description": r.description,
                "acknowledged_by": r.acknowledged_by,
                "acknowledged_at": r.acknowledged_at.isoformat() if r.acknowledged_at else None,
            }
            for r in records
        ]
    }


@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: int,
    update: AlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst")),
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = update.status.upper()
    if update.status.upper() in ("ACKNOWLEDGED",):
        alert.acknowledged_by = current_user.username
        alert.acknowledged_at = datetime.utcnow()
    db.commit()
    return {"message": f"Alert {alert_id} updated to {update.status}"}


@router.get("/dashboard/stats")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.simulator.simulator import get_simulator
    from app.ml.detector import get_detector

    total_telemetry = db.query(TelemetryRecord).count()
    total_anomalies = db.query(DetectionResult).filter(DetectionResult.is_anomaly == True).count()
    open_alerts = db.query(Alert).filter(Alert.status == "OPEN").count()
    critical_alerts = db.query(Alert).filter(
        Alert.severity == "CRITICAL", Alert.status == "OPEN"
    ).count()
    high_alerts = db.query(Alert).filter(
        Alert.severity == "HIGH", Alert.status == "OPEN"
    ).count()

    sim = get_simulator()
    detector = get_detector()

    # Threat level
    if critical_alerts > 0:
        threat_level = "CRITICAL"
    elif high_alerts > 2:
        threat_level = "HIGH"
    elif open_alerts > 5:
        threat_level = "MEDIUM"
    else:
        threat_level = "LOW"

    # Recent alerts
    recent_alerts = db.query(Alert).order_by(desc(Alert.timestamp)).limit(5).all()

    # Recent detections
    recent_detections = db.query(DetectionResult).order_by(
        desc(DetectionResult.timestamp)
    ).limit(10).all()

    return {
        "total_telemetry": total_telemetry,
        "total_anomalies": total_anomalies,
        "open_alerts": open_alerts,
        "threat_level": threat_level,
        "simulation": sim.get_status(),
        "model": detector.get_status(),
        "recent_alerts": [
            {
                "id": a.id,
                "timestamp": a.timestamp.isoformat(),
                "sensor": a.sensor,
                "severity": a.severity,
                "attack_type": a.attack_type,
                "status": a.status,
            }
            for a in recent_alerts
        ],
        "recent_detections": [
            {
                "timestamp": d.timestamp.isoformat(),
                "sensor": d.sensor,
                "value": d.value,
                "anomaly_score": d.anomaly_score,
                "is_anomaly": d.is_anomaly,
                "status": d.status,
            }
            for d in recent_detections
        ],
        "alert_counts": {
            "CRITICAL": db.query(Alert).filter(Alert.severity == "CRITICAL").count(),
            "HIGH": db.query(Alert).filter(Alert.severity == "HIGH").count(),
            "MEDIUM": db.query(Alert).filter(Alert.severity == "MEDIUM").count(),
            "LOW": db.query(Alert).filter(Alert.severity == "LOW").count(),
        }
    }
