"""
Main FastAPI application entry point.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.models import init_db, SessionLocal, User, ModelMetadata
from app.services.auth import get_password_hash
from app.services.ws_manager import get_ws_manager
from app.simulator.simulator import get_simulator
from app.ml.detector import get_detector
from app.api import auth, simulation, telemetry, analytics
from datetime import datetime, timezone
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _seed_demo_users(db):
    """Create demo accounts if they don't exist."""
    demo_users = [
        {"username": "admin", "email": "admin@scada-ids.local", "password": "Admin@123", "role": "admin"},
        {"username": "analyst", "email": "analyst@scada-ids.local", "password": "Analyst@123", "role": "analyst"},
        {"username": "viewer", "email": "viewer@scada-ids.local", "password": "Viewer@123", "role": "viewer"},
    ]
    for u in demo_users:
        exists = db.query(User).filter(User.username == u["username"]).first()
        if not exists:
            user = User(
                username=u["username"],
                email=u["email"],
                hashed_password=get_password_hash(u["password"]),
                role=u["role"],
            )
            db.add(user)
            logger.info(f"Created demo user: {u['username']} ({u['role']})")
    db.commit()


def _seed_model_metadata(db):
    """Record model metadata."""
    exists = db.query(ModelMetadata).filter(ModelMetadata.is_active == True).first()
    if not exists:
        meta = ModelMetadata(
            name="SCADA Anomaly Detector",
            algorithm="IsolationForest",
            version="1.0.0",
            status="untrained",
            feature_count=3,
            threshold=settings.ANOMALY_THRESHOLD,
            metadata_json={"description": "Isolation Forest for SCADA telemetry anomaly detection"},
        )
        db.add(meta)
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("=== SCADA IDS Starting ===")

    # Initialize database
    init_db()

    # Seed demo data
    db = SessionLocal()
    try:
        _seed_demo_users(db)
        _seed_model_metadata(db)
    finally:
        db.close()

    # Load ML model
    detector = get_detector()
    logger.info(f"Detector status: {detector.get_status()}")

    # Wire up simulator
    sim = get_simulator()
    sim.set_ws_manager(get_ws_manager())

    logger.info("=== SCADA IDS Ready ===")
    yield

    # Shutdown
    sim = get_simulator()
    if sim.running:
        await sim.stop()
    logger.info("=== SCADA IDS Stopped ===")


app = FastAPI(
    title="SCADA IDS API",
    description="AI-Based Intrusion Detection System for SCADA/Industrial Control Systems",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(simulation.router)
app.include_router(telemetry.router)
app.include_router(analytics.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    manager = get_ws_manager()
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; server pushes data
            data = await websocket.receive_text()
            # Handle ping/pong
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
