"""
WebSocket connection manager.
Handles real-time telemetry streaming to frontend clients.
"""
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Set, Dict, Any, List
from fastapi import WebSocket
from app.ml.detector import get_detector

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WS connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WS disconnected. Total: {len(self.active_connections)}")

    async def send_personal(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            self.disconnect(websocket)

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        dead: Set[WebSocket] = set()
        payload = json.dumps(message)
        for ws in list(self.active_connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active_connections.discard(ws)

    async def broadcast_telemetry(self, readings: List[Dict[str, Any]], scenario: str):
        """Process readings through detector and broadcast results."""
        from app.database.models import SessionLocal, TelemetryRecord, DetectionResult, Alert
        from datetime import datetime, timezone

        detector = get_detector()
        db = SessionLocal()
        now = datetime.now(timezone.utc)

        try:
            for reading in readings:
                sensor = reading["sensor"]
                value = reading["value"]
                unit = reading.get("unit", "")

                # Run detection
                score, is_anomaly = detector.predict(reading)
                severity = detector.get_severity(score) if is_anomaly else "LOW"
                status = "ANOMALY" if is_anomaly else "NORMAL"

                # Persist telemetry
                tel_rec = TelemetryRecord(
                    timestamp=now,
                    sensor=sensor,
                    value=value,
                    unit=unit,
                    scenario=scenario,
                )
                db.add(tel_rec)

                # Persist detection
                det_rec = DetectionResult(
                    timestamp=now,
                    sensor=sensor,
                    value=value,
                    anomaly_score=score,
                    is_anomaly=is_anomaly,
                    status=status,
                    scenario=scenario,
                )
                db.add(det_rec)

                # Create alert if anomaly
                alert_payload = None
                if is_anomaly:
                    attack_map = {
                        "sensor_spike": "Sensor Spike",
                        "sensor_drift": "Sensor Drift",
                        "stuck_sensor": "Stuck Sensor Value",
                        "sensor_spoofing": "Sensor Spoofing",
                        "false_data": "False Data Injection",
                        "interruption": "Telemetry Interruption",
                        "replay": "Replay Attack",
                        "normal": "Statistical Anomaly",
                    }
                    attack_type = attack_map.get(scenario, "Unknown Anomaly")
                    alert = Alert(
                        timestamp=now,
                        sensor=sensor,
                        value=value,
                        anomaly_score=score,
                        severity=severity,
                        attack_type=attack_type,
                        status="OPEN",
                        description=f"Anomaly detected on {sensor}: value={value:.4f}, score={score:.3f}",
                    )
                    db.add(alert)
                    alert_payload = {
                        "type": "alert",
                        "timestamp": now.isoformat(),
                        "sensor": sensor,
                        "value": value,
                        "anomaly_score": round(score, 4),
                        "severity": severity,
                        "attack_type": attack_type,
                        "status": "OPEN",
                    }

                # Build WS message
                msg = {
                    "type": "telemetry",
                    "timestamp": now.isoformat(),
                    "sensor": sensor,
                    "value": value,
                    "unit": unit,
                    "anomaly_score": round(score, 4),
                    "status": status,
                    "is_anomaly": is_anomaly,
                    "severity": severity,
                    "scenario": scenario,
                }
                await self.broadcast(msg)

                if alert_payload:
                    await self.broadcast(alert_payload)

            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error in broadcast_telemetry: {e}")
        finally:
            db.close()


# Singleton
_manager: ConnectionManager = None


def get_ws_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager
