"""
End-to-end smoke test: verifies the full workflow programmatically.
Run from E:\\ids\\backend:
    .venv\\Scripts\\python.exe e2e_smoke_test.py [--port 8000|8001]
"""
import sys
import time
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error

BASE = "http://127.0.0.1:8000"

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"


def check(label, condition, detail=""):
    if condition:
        print(f"  [{PASS}] {label}")
    else:
        print(f"  [{FAIL}] {label}{': ' + detail if detail else ''}")
    return condition


def http(method, path, data=None, token=None, content_type=None):
    url = BASE + path
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if data is not None:
        if content_type == "form":
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}
    except urllib.error.URLError as e:
        return -1, {"error": str(e.reason)}
    except Exception as e:
        return -1, {"error": str(e)}


def detect_base_url(custom_base=None, custom_port=None):
    if custom_base:
        return custom_base.rstrip("/")
    if custom_port:
        return f"http://127.0.0.1:{custom_port}"

    # Try 8000 first (default uvicorn port)
    for port in (8000, 8001):
        url = f"http://127.0.0.1:{port}/api/health"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return f"http://127.0.0.1:{port}"
        except Exception:
            pass

    return "http://127.0.0.1:8000"


def main():
    global BASE
    parser = argparse.ArgumentParser(
        description="SCADA IDS — End-to-End Smoke Test",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--base", default=None, help="Backend base URL")
    parser.add_argument("--port", type=int, default=None, help="Backend port")
    args = parser.parse_args()

    BASE = detect_base_url(custom_base=args.base, custom_port=args.port)

    results = []

    print("=" * 55)
    print("SCADA IDS — End-to-End Smoke Test")
    print(f"Target backend: {BASE}")
    print("=" * 55)
    print()

    # Pre-flight health check probe
    code, health_data = http("GET", "/api/health")
    if code != 200:
        err = health_data.get("error", f"HTTP {code}")
        print(f"CRITICAL: Backend server is not responding at {BASE} ({err}).")
        print("Please start the backend before running the smoke test:")
        print("    cd E:\\ids\\backend")
        print("    .venv\\Scripts\\Activate.ps1")
        print("    python -m uvicorn app.main:app --reload")
        print()

    # ── 1. Health check
    print("1. Health check")
    ok = check("GET /api/health returns 200", code == 200, str(health_data.get("error", "")))
    ok2 = check("status=ok", health_data.get("status") == "ok")
    results += [ok, ok2]
    print()

    # ── 2. Auth
    print("2. Authentication")
    code, data = http("POST", "/api/auth/login",
                      {"username": "admin", "password": "Admin@123"}, content_type="form")
    ok = check("Admin login returns 200", code == 200)
    token = data.get("access_token", "")
    ok2 = check("Received access_token", bool(token))
    results += [ok, ok2]

    # Viewer login
    code2, data2 = http("POST", "/api/auth/login",
                        {"username": "viewer", "password": "Viewer@123"}, content_type="form")
    viewer_token = data2.get("access_token", "")
    ok3 = check("Viewer login returns 200", code2 == 200)
    results.append(ok3)

    # Wrong password
    code3, _ = http("POST", "/api/auth/login",
                    {"username": "admin", "password": "wrong"}, content_type="form")
    ok4 = check("Wrong password returns 401", code3 == 401)
    results.append(ok4)
    print()

    # ── 3. Protected route
    print("3. Route protection")
    code, _ = http("GET", "/api/telemetry")
    ok = check("Unauthenticated request returns 401", code == 401)
    results.append(ok)

    # Viewer cannot start simulation
    code, _ = http("POST", "/api/simulation/start",
                   {"scenario": "normal", "speed": 1.0}, token=viewer_token)
    ok2 = check("Viewer cannot start simulation (403)", code == 403)
    results.append(ok2)
    print()

    # ── 4. Model status
    print("4. Model status")
    code, data = http("GET", "/api/model/status", token=token)
    ok = check("GET /api/model/status returns 200", code == 200)
    trained = data.get("status") in ("loaded", "trained")
    ok2 = check(f"Model is trained/loaded (status={data.get('status')})", trained)
    ok3 = check("Algorithm is IsolationForest",
                data.get("algorithm") == "IsolationForest")
    threshold = data.get("threshold", 0)
    ok4 = check(f"Threshold >= 0.4 (got {threshold})", threshold >= 0.4)
    results += [ok, ok2, ok3, ok4]
    print()

    # ── 5. Start simulation
    print("5. Simulation control")
    code, data = http("POST", "/api/simulation/start",
                      {"scenario": "normal", "speed": 2.0}, token=token)
    ok = check("Start simulation returns 200", code == 200)
    ok2 = check("Simulation is running", data.get("status", {}).get("running", False))
    results += [ok, ok2]

    # Wait for some data to accumulate
    print("  Waiting 5s for telemetry data...")
    time.sleep(5)

    # ── 6. Check telemetry was recorded
    print("6. Telemetry persistence")
    code, data = http("GET", "/api/telemetry?limit=50", token=token)
    total = data.get("total", 0)
    ok = check(f"Telemetry records saved (got {total})", total > 0)
    results.append(ok)

    code, data = http("GET", "/api/detections?limit=50", token=token)
    det_total = data.get("total", 0)
    ok2 = check(f"Detection records saved (got {det_total})", det_total > 0)
    results.append(ok2)

    # Check anomaly rate is reasonable for normal scenario
    if det_total > 0:
        records = data.get("records", [])
        anomaly_count = sum(1 for r in records if r.get("is_anomaly"))
        anomaly_rate = anomaly_count / len(records) * 100
        ok3 = check(
            f"Normal scenario anomaly rate <= 15% (got {anomaly_rate:.1f}%)",
            anomaly_rate <= 15.0,
            f"Rate {anomaly_rate:.1f}% is too high — check threshold"
        )
        results.append(ok3)
    else:
        ok3 = check("Normal scenario anomaly rate <= 15%", False, "No detection records accumulated")
        results.append(ok3)
    print()

    # ── 7. Switch to attack scenario
    print("7. Attack scenario detection")
    code, _ = http("POST", "/api/simulation/start",
                   {"scenario": "false_data", "speed": 2.0}, token=token)
    ok = check("Switch to false_data scenario", code == 200)
    results.append(ok)

    print("  Waiting 5s for attack data...")
    time.sleep(5)

    code, data = http("GET", "/api/alerts?limit=100", token=token)
    alert_total = data.get("total", 0)
    ok2 = check(f"Alerts generated during attack ({alert_total})", alert_total > 0)
    results.append(ok2)
    print()

    # ── 8. Stop simulation
    print("8. Stop simulation")
    code, data = http("POST", "/api/simulation/stop", token=token)
    ok = check("Stop simulation returns 200", code == 200)
    ok2 = check("Simulation stopped", not data.get("status", {}).get("running", True))
    results += [ok, ok2]
    print()

    # ── 9. Dashboard stats
    print("9. Dashboard stats")
    code, data = http("GET", "/api/dashboard/stats", token=token)
    ok = check("Dashboard stats returns 200", code == 200)
    ok2 = check("Has total_telemetry", "total_telemetry" in data)
    ok3 = check("Has total_anomalies", "total_anomalies" in data)
    ok4 = check("Has model info", "model" in data)
    ok5 = check("Has simulation info", "simulation" in data)
    results += [ok, ok2, ok3, ok4, ok5]
    print()

    # ── 10. History persists (refetch)
    print("10. History persistence")
    code, data = http("GET", "/api/detections?limit=10", token=token)
    ok = check("History survives after simulation stop", data.get("total", 0) > 0)
    results.append(ok)
    print()

    # ── Summary
    passed = sum(1 for r in results if r)
    total = len(results)
    print("=" * 55)
    print(f"RESULTS: {passed}/{total} checks passed")
    if passed == total:
        print("ALL CHECKS PASSED — system is working correctly.")
    else:
        failed = total - passed
        print(f"WARNING: {failed} check(s) failed — review output above.")
    print("=" * 55)

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
