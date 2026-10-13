# SCADA IDS — AI-Based Intrusion Detection System

An AI-powered Intrusion Detection System for SCADA/Industrial Control Systems built with FastAPI, React, and Isolation Forest anomaly detection.

---

## Quick Start

### Prerequisites
- Python 3.10+ (tested on 3.14)  
- Node.js 18+ / npm  
- Windows (tested) or Linux/macOS  

### 1. Backend setup

```powershell
cd E:\ids\backend

# Create venv (first time only)
python -m venv .venv

# Activate and install
.venv\Scripts\activate
pip install -r requirements.txt

# Train the Isolation Forest model (REQUIRED on first run)
python pretrain_model.py

# Start the backend
python -m uvicorn app.main:app --reload
```

Backend starts at **http://127.0.0.1:8000**  
API docs: **http://127.0.0.1:8000/docs**

### 2. Frontend setup (separate terminal)

```powershell
cd E:\ids\frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:5173**

---

## Demo Login Credentials

| Role     | Username  | Password     | Capabilities                         |
|----------|-----------|--------------|--------------------------------------|
| Admin    | `admin`   | `Admin@123`  | Full access, model training, settings |
| Analyst  | `analyst` | `Analyst@123`| Start/stop simulations, view alerts   |
| Viewer   | `viewer`  | `Viewer@123` | Read-only: dashboard, history, alerts |

---

## Application Pages

| Page            | URL path      | Description                                        |
|-----------------|---------------|----------------------------------------------------|
| Login           | `/login`      | JWT-based login with role selection                |
| Dashboard       | `/`           | Live stats, threat level, recent alerts            |
| Live Telemetry  | `/telemetry`  | Real-time multi-sensor chart via WebSocket         |
| Simulation      | `/simulation` | Start/stop attack scenarios                        |
| Analytics       | `/analytics`  | Anomaly trends, severity breakdown, scenario dist  |
| History         | `/history`    | Paginated detection history (survives refresh)     |
| Alerts          | `/alerts`     | Alert management with acknowledge/resolve          |
| Dataset         | `/dataset`    | Upload CSV for batch anomaly detection             |
| Settings        | `/settings`   | Threshold, model info                              |

---

## Demo Walkthrough

### Step 1 — Login
- Open `http://localhost:5173`
- Login as `admin` / `Admin@123`

### Step 2 — Start Normal Simulation
- Navigate to **Simulation** page
- Select **Normal Operation**, speed **1x**, click **Start**
- Open **Live Telemetry** — observe 9 sensors streaming with low anomaly scores

### Step 3 — Switch to Attack Scenario
- Go back to **Simulation**
- Select **Sensor Spike** or **False Data Injection**, click **Start**
- Watch **Live Telemetry** — anomaly scores rise; red badges appear on affected sensors
- Check **Dashboard** for updated threat level and open alerts

### Step 4 — View Alerts
- Navigate to **Alerts** — shows all generated alerts with severity
- Click an alert to acknowledge it (analyst/admin only)

### Step 5 — Analytics
- Navigate to **Analytics** — shows scenario distribution, severity breakdown, detection trend

### Step 6 — History
- Navigate to **History** — persisted detection records survive page refresh

### Step 7 — Stop Simulation
- Return to **Simulation**, click **Stop**

---

## Architecture

```
E:\ids\
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry, lifespan, WebSocket endpoint
│   │   ├── config.py         # Settings (pydantic-settings, reads .env)
│   │   ├── api/
│   │   │   ├── auth.py       # JWT login, /me
│   │   │   ├── simulation.py # Start/stop/status
│   │   │   ├── telemetry.py  # GET telemetry, detections, alerts, dashboard/stats
│   │   │   └── analytics.py  # Analytics, model management, CSV upload
│   │   ├── database/
│   │   │   └── models.py     # SQLAlchemy models (SQLite)
│   │   ├── ml/
│   │   │   └── detector.py   # IsolationForest anomaly detector
│   │   ├── services/
│   │   │   ├── auth.py       # JWT, Argon2 hashing, RBAC
│   │   │   └── ws_manager.py # WebSocket broadcast, DB persistence
│   │   └── simulator/
│   │       └── simulator.py  # Async SCADA telemetry generator
│   ├── models/               # Persisted .joblib model files
│   ├── tests/
│   │   └── test_backend.py   # 32 tests (unit + integration)
│   ├── pretrain_model.py     # One-shot model training script
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/            # 9 React pages
    │   ├── hooks/
    │   │   └── useWebSocket.ts  # Auto-reconnecting WS hook
    │   ├── contexts/
    │   │   └── AuthContext.tsx   # JWT auth context
    │   └── components/
    └── package.json
```

---

## ML Pipeline

### Algorithm: Isolation Forest
- **Library**: scikit-learn `IsolationForest`
- **Training**: 3,600 synthetic normal-operation readings across 9 sensors
- **Features** per reading: `[raw_value, normalized_value, deviation_from_midpoint]`
- **Contamination**: 5% (expected anomaly fraction in training data)
- **Threshold**: 0.5 (anomaly score > 0.5 → flagged)

### Score Semantics
| Score range | Interpretation       |
|-------------|----------------------|
| 0.0 – 0.49  | Normal               |
| 0.50 – 0.69 | MEDIUM severity      |
| 0.70 – 0.84 | HIGH severity        |
| 0.85+       | CRITICAL severity    |

### Sensors monitored
| Sensor | Description        | Normal Range      | Unit   |
|--------|--------------------|-------------------|--------|
| LIT101 | Water level        | 400–600           | mm     |
| FIT101 | Flow rate (in)     | 1.2–2.0           | m³/h   |
| AIT201 | Conductivity       | 2.5–3.5           | mS/cm  |
| AIT202 | Chlorine level     | 250–350           | mg/L   |
| AIT203 | Turbidity          | 100–200           | NTU    |
| FIT201 | Flow rate (out)    | 0.8–1.5           | m³/h   |
| MV101  | Motor valve state  | 0 or 1 (binary)   | state  |
| P101   | Pump 1 state       | 0 or 1 (binary)   | state  |
| P102   | Pump 2 state       | 0 or 1 (binary)   | state  |

### Attack Scenarios Simulated
| Scenario           | Description                                          |
|--------------------|------------------------------------------------------|
| Normal Operation   | Sinusoidal baseline + Gaussian noise                 |
| Sensor Spike       | 10% chance of extreme value (1.5–3× range)           |
| Sensor Drift       | Slow accumulating offset (+0.5% of range per tick)   |
| Stuck Sensor       | Constant value (frozen reading)                      |
| Sensor Spoofing    | Suspiciously perfect values at midpoint              |
| False Data Injection | 30% readings injected far outside normal range     |
| Telemetry Interruption | 40% readings replaced with 0                   |
| Replay Attack      | Repeated sinusoidal pattern every 20 ticks           |

---

## Test Results

Run tests with:
```powershell
cd E:\ids\backend
.venv\Scripts\python.exe -m pytest tests/ -v
```

**Results: 32 passed, 0 failed** (Python 3.14, pytest 9.1.1)

| Test Class            | Tests | Description                         |
|-----------------------|-------|-------------------------------------|
| TestAnomalyDetector   | 12    | ML model unit tests                 |
| TestSimulator         | 4     | Simulator unit tests                |
| TestAuthEndpoints     | 6     | Login, JWT, protected routes        |
| TestTelemetryEndpoints| 4     | Telemetry, detections, alerts       |
| TestSimulationEndpoints| 3    | Scenarios, RBAC enforcement         |
| TestAnalyticsEndpoints| 3     | Analytics, model status, RBAC       |

---

## API Reference

| Method | Endpoint                    | Auth Required | Description                     |
|--------|-----------------------------|---------------|---------------------------------|
| POST   | `/api/auth/login`           | No            | Get JWT token                   |
| GET    | `/api/auth/me`              | Yes           | Current user info               |
| GET    | `/api/health`               | No            | Health check                    |
| GET    | `/api/telemetry`            | Yes           | Paginated telemetry records     |
| GET    | `/api/detections`           | Yes           | Detection results               |
| GET    | `/api/alerts`               | Yes           | Alert list (filterable)         |
| PATCH  | `/api/alerts/{id}`          | Analyst+      | Acknowledge/resolve alert       |
| GET    | `/api/dashboard/stats`      | Yes           | Dashboard statistics            |
| POST   | `/api/simulation/start`     | Analyst+      | Start simulation                |
| POST   | `/api/simulation/stop`      | Analyst+      | Stop simulation                 |
| GET    | `/api/simulation/status`    | Yes           | Simulation status               |
| GET    | `/api/simulation/scenarios` | Yes           | Available scenarios             |
| GET    | `/api/analytics`            | Yes           | Analytics summary               |
| GET    | `/api/model/status`         | Yes           | Detector status                 |
| POST   | `/api/model/train`          | Admin         | Retrain model on stored data    |
| PATCH  | `/api/model/threshold`      | Admin         | Update anomaly threshold        |
| POST   | `/api/dataset/upload`       | Analyst+      | Upload CSV for batch detection  |
| WS     | `/ws/telemetry`             | No            | Real-time telemetry stream      |

---

## Known Limitations

1. **No ground-truth labels** — Precision, recall, and F1 cannot be computed for synthetic data. The metrics shown are counts only.
2. **SQLite** — Suitable for development/demo. For production, replace with PostgreSQL.
3. **IsolationForest is retrained lazily** — After server restart, the first 100 live readings trigger automatic retraining (or use `pretrain_model.py` once). A pre-trained `.joblib` file is loaded on startup if present.
4. **WebSocket auth** — The WebSocket endpoint `/ws/telemetry` does not currently require a JWT token (frontend connects before user interaction ends). In production, add token-based WS auth.
5. **Single-process** — WebSocket broadcasting and simulation run in the same asyncio event loop as FastAPI. For high throughput, move simulation to a separate process or use a message broker.
6. **No real SCADA data** — This is a fully synthetic simulator. The system is not tested against real SWaT/WADI/BATADAL datasets (those are licensed separately).

---

## Environment Configuration

Copy `.env.example` to `.env` in `backend/`:

```env
MODEL_PATH=./models/isolation_forest.joblib  # must match IsolationForest, not LSTM
ANOMALY_THRESHOLD=0.5                         # 0.0–1.0; lower = more sensitive
ACCESS_TOKEN_EXPIRE_MINUTES=60
SECRET_KEY=<generate a secure random string for production>
```

---

## Git & GitHub Safety

The following are excluded from git commits via `.gitignore`:
- `.env` (secrets)
- `*.db` (runtime database)
- `*.joblib` (trained model binary)
- `.venv/` (Python virtualenv)
- `__pycache__/`

Safe to commit: `.env.example`, `pretrain_model.py`, source code, `requirements.txt`.
