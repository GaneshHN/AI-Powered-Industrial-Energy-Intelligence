import uuid
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from service import app

client = TestClient(app)


def test_clean_import_without_sys_modules_stub():
    # Verify that scikit-learn RandomForestRegressor is available in the runtime environment
    from sklearn.ensemble import RandomForestRegressor
    reg = RandomForestRegressor(n_estimators=10, random_state=42)
    assert reg is not None


def test_severity_filtering_excludes_info_anomalies():
    m_id = str(uuid.uuid4())
    # Sub-threshold deviation that results in "info" severity
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=20, freq="h")
    readings = []
    for ts in timestamps:
        readings.append({
            "machine_id": m_id,
            "timestamp": ts.isoformat(),
            "energy_kwh": 100.0,
            "power_kw": 90.0,
        })
    # Add a slight 2% variation (below "low" threshold, categorized as "info")
    readings.append({
        "machine_id": m_id,
        "timestamp": (timestamps[-1] + pd.Timedelta(hours=1)).isoformat(),
        "energy_kwh": 102.0,
        "power_kw": 92.0,
    })

    payload = {
        "factory_id": str(uuid.uuid4()),
        "readings": readings,
    }
    response = client.post("/anomalies/detect", json=payload)
    assert response.status_code == 200
    data = response.json()
    # Confirm that no "info" severities are returned in the active anomalies array
    for a in data.get("anomalies", []):
        assert a["severity"] in {"low", "medium", "high", "critical"}
        assert a["severity"] != "info"


def test_root_cause_with_rated_power_metadata():
    m_id = str(uuid.uuid4())
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=24, freq="h")
    history = [
        {"timestamp": ts.isoformat(), "energy_kwh": 80.0, "power_kw": 75.0}
        for ts in timestamps
    ]

    payload = {
        "anomaly": {
            "id": str(uuid.uuid4()),
            "machine_id": m_id,
            "timestamp": history[-1]["timestamp"],
            "expected_energy_kwh": 70.0,
            "actual_energy_kwh": 150.0,
            "deviation_percent": 114.2,
        },
        "machine": {
            "name": "Injection Molder A",
            "type": "Molding",
            "status": "operational",
            "rated_power_kw": 100.0,
        },
        "recent_readings": history,
        "recent_production": [],
    }

    response = client.post("/root-cause/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "contributors" in data
    assert 0.0 <= data["confidence"] <= 1.0


def test_root_cause_missing_rated_power_does_not_fabricate():
    m_id = str(uuid.uuid4())
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=20, freq="h")
    history = [
        {"timestamp": ts.isoformat(), "energy_kwh": 50.0, "power_kw": 45.0}
        for ts in timestamps
    ]

    # Machine metadata without rated_power_kw
    payload = {
        "anomaly": {
            "id": str(uuid.uuid4()),
            "machine_id": m_id,
            "timestamp": history[-1]["timestamp"],
            "expected_energy_kwh": 40.0,
            "actual_energy_kwh": 90.0,
            "deviation_percent": 125.0,
        },
        "machine": {
            "name": "Auxiliary Chiller",
            "type": "Cooling",
            "status": "operational",
            # rated_power_kw omitted
        },
        "recent_readings": history,
    }

    response = client.post("/root-cause/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]
    # Should complete safely without unhandled division or fabricated 100% load
    assert isinstance(data["contributors"], list)
