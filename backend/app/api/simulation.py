"""Simulation control routes."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from app.database.models import get_db, SimulationEvent
from app.services.auth import get_current_active_user, require_role
from app.database.models import User
from app.simulator.simulator import get_simulator, ATTACK_TYPES
from app.services.ws_manager import get_ws_manager

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SimulationStartRequest(BaseModel):
    scenario: str = "normal"
    speed: float = 1.0


class SimulationResponse(BaseModel):
    running: bool
    scenario: str
    speed: float
    tick: int
    attack_type: str


@router.post("/start")
async def start_simulation(
    req: SimulationStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst")),
):
    sim = get_simulator()
    if sim.running:
        await sim.stop()

    # Inject ws_manager
    sim.set_ws_manager(get_ws_manager())
    sim.start(scenario=req.scenario, speed=req.speed)

    # Log event
    event = SimulationEvent(
        event_type="START",
        scenario=req.scenario,
        user=current_user.username,
        details={"speed": req.speed},
    )
    db.add(event)
    db.commit()

    return {"message": f"Simulation started: {req.scenario}", "status": sim.get_status()}


@router.post("/stop")
async def stop_simulation(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst")),
):
    sim = get_simulator()
    if not sim.running:
        return {"message": "Simulation not running", "status": sim.get_status()}

    scenario = sim.scenario
    await sim.stop()

    event = SimulationEvent(
        event_type="STOP",
        scenario=scenario,
        user=current_user.username,
    )
    db.add(event)
    db.commit()
    return {"message": "Simulation stopped", "status": sim.get_status()}


@router.get("/status", response_model=SimulationResponse)
async def get_simulation_status():
    sim = get_simulator()
    return sim.get_status()


@router.get("/scenarios")
async def list_scenarios():
    return {
        "scenarios": [
            {"id": k, "name": v}
            for k, v in ATTACK_TYPES.items()
        ]
    }
