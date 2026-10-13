"""
SCADA Telemetry Simulator.

Generates synthetic industrial sensor readings for various attack/anomaly scenarios.
Runs as an async background task. Sends data via WebSocket manager.
"""
import asyncio
import random
import math
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import logging

logger = logging.getLogger(__name__)

# Sensor definitions with realistic SCADA tag names
SENSORS = {
    "LIT101": {"unit": "mm",  "normal": (400.0, 600.0)},
    "FIT101": {"unit": "m3/h","normal": (1.2,   2.0)},
    "AIT201": {"unit": "mS/cm","normal": (2.5,   3.5)},
    "AIT202": {"unit": "mg/L","normal": (250.0, 350.0)},
    "AIT203": {"unit": "NTU", "normal": (100.0, 200.0)},
    "FIT201": {"unit": "m3/h","normal": (0.8,   1.5)},
    "MV101":  {"unit": "state","normal": (0.0,   1.0)},
    "P101":   {"unit": "state","normal": (0.0,   1.0)},
    "P102":   {"unit": "state","normal": (0.0,   1.0)},
}

ATTACK_TYPES = {
    "normal":          "Normal Operation",
    "sensor_spike":    "Sensor Spike",
    "sensor_drift":    "Sensor Drift",
    "stuck_sensor":    "Stuck Sensor",
    "sensor_spoofing": "Sensor Spoofing",
    "false_data":      "False Data Injection",
    "interruption":    "Telemetry Interruption",
    "replay":          "Replay Attack",
}


class SCADASimulator:
    """Generates synthetic SCADA telemetry for various scenarios."""

    def __init__(self):
        self.running = False
        self.scenario = "normal"
        self.speed = 1.0
        self._task: Optional[asyncio.Task] = None
        self._tick = 0
        self._stuck_values: Dict[str, float] = {}
        self._drift_offsets: Dict[str, float] = {s: 0.0 for s in SENSORS}
        self._replay_buffer: List[Dict[str, Any]] = []
        self._replay_idx = 0
        self.ws_manager = None  # injected at startup

    def set_ws_manager(self, manager):
        self.ws_manager = manager

    def _normal_value(self, sensor: str) -> float:
        lo, hi = SENSORS[sensor]["normal"]
        mid = (lo + hi) / 2.0
        amplitude = (hi - lo) * 0.15
        noise = random.gauss(0, (hi - lo) * 0.03)
        t = self._tick * 0.1
        return mid + amplitude * math.sin(t) + noise

    def _generate_reading(self, sensor: str) -> float:
        lo, hi = SENSORS[sensor]["normal"]
        scenario = self.scenario

        if scenario == "normal":
            return self._normal_value(sensor)

        elif scenario == "sensor_spike":
            base = self._normal_value(sensor)
            if random.random() < 0.1:  # 10% chance of spike
                spike_dir = random.choice([-1, 1])
                return base + spike_dir * (hi - lo) * random.uniform(1.5, 3.0)
            return base

        elif scenario == "sensor_drift":
            self._drift_offsets[sensor] = self._drift_offsets.get(sensor, 0.0) + (hi - lo) * 0.005
            return self._normal_value(sensor) + self._drift_offsets[sensor]

        elif scenario == "stuck_sensor":
            if sensor not in self._stuck_values:
                self._stuck_values[sensor] = self._normal_value(sensor)
            return self._stuck_values[sensor] + random.gauss(0, 0.0001)

        elif scenario == "sensor_spoofing":
            # Report suspiciously perfect values
            mid = (lo + hi) / 2.0
            return mid + random.gauss(0, 0.001)

        elif scenario == "false_data":
            # Inject readings outside normal range
            if random.random() < 0.3:
                return random.choice([
                    lo * random.uniform(0.1, 0.4),
                    hi * random.uniform(1.5, 2.5),
                ])
            return self._normal_value(sensor)

        elif scenario == "interruption":
            # Missing data simulated as 0
            if random.random() < 0.4:
                return 0.0
            return self._normal_value(sensor)

        elif scenario == "replay":
            # Cycle through stored replay buffer or generate repeated sequence
            base = self._normal_value(sensor)
            # Repeat exact same pattern every 20 ticks
            phase = self._tick % 20
            return base + (hi - lo) * 0.2 * math.sin(phase * math.pi / 10)

        return self._normal_value(sensor)

    async def _run_loop(self):
        """Main simulation loop."""
        interval = max(0.5, 2.0 / max(self.speed, 0.1))
        while self.running:
            self._tick += 1
            readings = []
            for sensor_name in SENSORS:
                value = self._generate_reading(sensor_name)
                unit = SENSORS[sensor_name]["unit"]
                readings.append({
                    "sensor": sensor_name,
                    "value": round(value, 4),
                    "unit": unit,
                })

            if self.ws_manager:
                await self.ws_manager.broadcast_telemetry(readings, self.scenario)

            await asyncio.sleep(interval)

    def start(self, scenario: str = "normal", speed: float = 1.0):
        self.scenario = scenario
        self.speed = speed
        self.running = True
        self._tick = 0
        self._stuck_values.clear()
        self._drift_offsets = {s: 0.0 for s in SENSORS}
        self._task = asyncio.ensure_future(self._run_loop())
        logger.info(f"Simulator started: scenario={scenario}, speed={speed}")

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Simulator stopped")

    def get_status(self) -> Dict[str, Any]:
        return {
            "running": self.running,
            "scenario": self.scenario,
            "speed": self.speed,
            "tick": self._tick,
            "attack_type": ATTACK_TYPES.get(self.scenario, "Unknown"),
        }


# Singleton
_simulator: Optional[SCADASimulator] = None


def get_simulator() -> SCADASimulator:
    global _simulator
    if _simulator is None:
        _simulator = SCADASimulator()
    return _simulator
