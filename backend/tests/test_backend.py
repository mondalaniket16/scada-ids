"""
Backend test suite for SCADA IDS.

Run from E:\\ids\\backend:
    .venv\\Scripts\\python.exe -m pytest tests/ -v
"""
import pytest
import sys
import os

# Ensure app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ──────────────────────────────────────────────────────────────
# Unit tests: AnomalyDetector
# ──────────────────────────────────────────────────────────────

class TestAnomalyDetector:
    """Tests for the Isolation Forest anomaly detector."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        from app.ml.detector import AnomalyDetector
        model_path = str(tmp_path / "test_model.joblib")
        self.detector = AnomalyDetector(model_path=model_path, threshold=0.5)

    def _train_with_normal_data(self):
        """Train detector on 200 normal readings."""
        import math, random
        SENSORS = {
            "LIT101": (400.0, 600.0), "FIT101": (1.2, 2.0),
            "AIT201": (2.5, 3.5), "AIT202": (250.0, 350.0),
            "AIT203": (100.0, 200.0), "FIT201": (0.8, 1.5),
            "MV101": (0.0, 1.0), "P101": (0.0, 1.0), "P102": (0.0, 1.0),
        }
        BINARY = {"MV101", "P101", "P102"}
        readings = []
        for tick in range(300):
            for sensor, (lo, hi) in SENSORS.items():
                if sensor in BINARY:
                    value = random.choice([0.0, 1.0])
                else:
                    mid = (lo + hi) / 2.0
                    noise = (hi - lo) * 0.03 * random.gauss(0, 1)
                    value = mid + noise
                readings.append({"sensor": sensor, "value": round(value, 4)})
        return self.detector.train(readings)

    def test_untrained_state(self):
        status = self.detector.get_status()
        assert status["status"] == "untrained"
        assert not self.detector.is_trained

    def test_train_succeeds(self):
        success = self._train_with_normal_data()
        assert success
        assert self.detector.is_trained
        assert self.detector.training_samples >= 100

    def test_train_fails_with_insufficient_data(self):
        readings = [{"sensor": "LIT101", "value": 500.0}] * 10
        result = self.detector.train(readings)
        assert result is False

    def test_normal_readings_not_flagged_after_training(self):
        self._train_with_normal_data()
        normal_cases = [
            {"sensor": "LIT101", "value": 500.0},
            {"sensor": "FIT101", "value": 1.6},
            {"sensor": "AIT201", "value": 3.0},
            {"sensor": "AIT202", "value": 300.0},
            {"sensor": "MV101", "value": 1.0},
            {"sensor": "P101", "value": 0.0},
        ]
        for reading in normal_cases:
            score, is_anomaly = self.detector.predict(reading)
            assert score >= 0.0 and score <= 1.0, f"Score out of range for {reading}"
            assert not is_anomaly, (
                f"False positive: {reading['sensor']}={reading['value']} "
                f"flagged with score={score:.4f}"
            )

    def test_extreme_readings_flagged_after_training(self):
        self._train_with_normal_data()
        anomaly_cases = [
            {"sensor": "LIT101", "value": 50.0},    # way below min 250
            {"sensor": "FIT101", "value": 15.0},    # way above max 2.5
            {"sensor": "AIT202", "value": 9000.0},  # extreme outlier
        ]
        for reading in anomaly_cases:
            score, is_anomaly = self.detector.predict(reading)
            assert is_anomaly, (
                f"False negative: {reading['sensor']}={reading['value']} "
                f"not flagged (score={score:.4f})"
            )

    def test_binary_sensors_not_flagged_for_state_values(self):
        """Binary state sensors (0 or 1) should never be false-positives."""
        self._train_with_normal_data()
        for sensor in ("MV101", "P101", "P102"):
            for val in (0.0, 1.0):
                score, is_anomaly = self.detector.predict({"sensor": sensor, "value": val})
                assert not is_anomaly, (
                    f"Binary sensor {sensor}={val} wrongly flagged (score={score:.4f})"
                )

    def test_score_range(self):
        self._train_with_normal_data()
        readings = [
            {"sensor": "LIT101", "value": 500.0},
            {"sensor": "LIT101", "value": 10.0},
        ]
        for r in readings:
            score, _ = self.detector.predict(r)
            assert 0.0 <= score <= 1.0, f"Score {score} out of [0, 1] for {r}"

    def test_save_and_load(self, tmp_path):
        from app.ml.detector import AnomalyDetector
        self._train_with_normal_data()
        # Load into a fresh instance
        model2 = AnomalyDetector(model_path=self.detector.model_path, threshold=0.5)
        loaded = model2.load()
        assert loaded
        assert model2.is_trained

    def test_severity_thresholds(self):
        assert self.detector.get_severity(0.9) == "CRITICAL"
        assert self.detector.get_severity(0.75) == "HIGH"
        assert self.detector.get_severity(0.6) == "MEDIUM"
        assert self.detector.get_severity(0.3) == "LOW"

    def test_fallback_statistical_check_normal(self):
        """Before training, normal readings near midpoint should score low."""
        # LIT101 range (250-800), mid=525
        score, is_anomaly = self.detector.predict({"sensor": "LIT101", "value": 525.0})
        assert score < self.detector.threshold, (
            f"Midpoint value flagged with score={score:.4f} (threshold={self.detector.threshold})"
        )
        assert not is_anomaly

    def test_fallback_binary_sensor_no_false_positive(self):
        """Before training, binary sensors should not be flagged for 0 or 1."""
        for sensor in ("MV101", "P101", "P102"):
            for val in (0.0, 1.0):
                score, is_anomaly = self.detector.predict({"sensor": sensor, "value": val})
                assert not is_anomaly, (
                    f"Untrained binary {sensor}={val} wrongly flagged (score={score})"
                )

    def test_get_status_fields(self):
        status = self.detector.get_status()
        required_keys = ["name", "algorithm", "version", "status", "threshold",
                         "feature_count", "trained_at", "training_samples"]
        for key in required_keys:
            assert key in status, f"Missing key: {key}"


# ──────────────────────────────────────────────────────────────
# Unit tests: Simulator
# ──────────────────────────────────────────────────────────────

class TestSimulator:
    def setup_method(self):
        # Reset the simulator singleton for each test
        import app.simulator.simulator as sim_module
        sim_module._simulator = None
        from app.simulator.simulator import get_simulator
        self.sim = get_simulator()

    def teardown_method(self):
        # Ensure simulator is stopped
        if self.sim.running:
            import asyncio
            asyncio.get_event_loop().run_until_complete(self.sim.stop())

    def test_initial_state(self):
        assert not self.sim.running
        assert self.sim.scenario == "normal"

    def test_generate_normal_values_in_range(self):
        from app.simulator.simulator import SENSORS
        self.sim.scenario = "normal"
        for sensor_name in SENSORS:
            lo, hi = SENSORS[sensor_name]["normal"]
            # Normal values should be within a generous range of the normal bounds
            values = [self.sim._generate_reading(sensor_name) for _ in range(20)]
            for v in values:
                assert lo * 0.5 <= v <= hi * 2.5, (
                    f"{sensor_name} normal value {v} is wildly out of range"
                )

    def test_scenarios_exist(self):
        from app.simulator.simulator import ATTACK_TYPES
        expected = {"normal", "sensor_spike", "sensor_drift", "stuck_sensor",
                    "sensor_spoofing", "false_data", "interruption", "replay"}
        assert expected.issubset(set(ATTACK_TYPES.keys()))

    def test_get_status(self):
        status = self.sim.get_status()
        assert "running" in status
        assert "scenario" in status
        assert "speed" in status
        assert "tick" in status


# ──────────────────────────────────────────────────────────────
# Integration tests: FastAPI endpoints
# ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Create a test client with an in-memory database."""
    import os
    # Override database to in-memory SQLite for tests
    os.environ["DATABASE_URL"] = "sqlite:///./test_scada.db"

    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c

    # Cleanup — ignore Windows file-lock errors
    try:
        if os.path.exists("test_scada.db"):
            os.remove("test_scada.db")
    except OSError:
        pass  # File still locked on Windows; will be cleaned up on next run


@pytest.fixture(scope="module")
def auth_token(client):
    """Get a valid JWT token for admin user."""
    resp = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "Admin@123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


class TestAuthEndpoints:
    def test_health_check(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_login_success(self, client):
        resp = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "Admin@123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        resp = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrong"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401

    def test_login_unknown_user(self, client):
        resp = client.post(
            "/api/auth/login",
            data={"username": "nobody", "password": "x"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401

    def test_me_endpoint(self, client, auth_token):
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "admin"

    def test_protected_route_without_token(self, client):
        resp = client.get("/api/telemetry")
        assert resp.status_code == 401


class TestTelemetryEndpoints:
    def test_get_telemetry_empty(self, client, auth_token):
        resp = client.get(
            "/api/telemetry",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "records" in data
        assert "total" in data

    def test_get_detections(self, client, auth_token):
        resp = client.get(
            "/api/detections",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "records" in data

    def test_get_alerts(self, client, auth_token):
        resp = client.get(
            "/api/alerts",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "records" in data

    def test_dashboard_stats(self, client, auth_token):
        resp = client.get(
            "/api/dashboard/stats",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_telemetry" in data
        assert "total_anomalies" in data
        assert "open_alerts" in data
        assert "model" in data
        assert "simulation" in data


class TestSimulationEndpoints:
    def test_get_scenarios(self, client, auth_token):
        resp = client.get(
            "/api/simulation/scenarios",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "scenarios" in data
        assert len(data["scenarios"]) > 0

    def test_get_simulation_status(self, client, auth_token):
        resp = client.get(
            "/api/simulation/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "running" in data

    def test_viewer_cannot_start_simulation(self, client):
        # Login as viewer
        login = client.post(
            "/api/auth/login",
            data={"username": "viewer", "password": "Viewer@123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        viewer_token = login.json()["access_token"]
        resp = client.post(
            "/api/simulation/start",
            json={"scenario": "normal", "speed": 1.0},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert resp.status_code == 403


class TestAnalyticsEndpoints:
    def test_get_analytics(self, client, auth_token):
        resp = client.get(
            "/api/analytics",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_samples" in data
        assert "anomaly_rate" in data
        assert "model_info" in data

    def test_get_model_status(self, client, auth_token):
        resp = client.get(
            "/api/model/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "algorithm" in data
        assert "status" in data
        assert data["algorithm"] == "IsolationForest"

    def test_train_requires_admin(self, client):
        login = client.post(
            "/api/auth/login",
            data={"username": "viewer", "password": "Viewer@123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        viewer_token = login.json()["access_token"]
        resp = client.post(
            "/api/model/train",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert resp.status_code == 403
