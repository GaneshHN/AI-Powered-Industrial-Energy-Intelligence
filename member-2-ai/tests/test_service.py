from datetime import datetime, timezone
import uuid
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from service import app

client = TestClient(app)


def _generate_synthetic_history(machine_id: str = "CNC-03", count: int = 48) -> list[dict]:
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=count, freq="h")
    history = []
    for i, ts in enumerate(timestamps):
        base = 300 + (i % 24) * 6
        energy = base + (10 if i % 20 == 0 else 0)
        history.append({
            "timestamp": ts.isoformat(),
            "energy_kwh": float(energy),
            "power_kw": float(energy * 0.9),
        })
    return history


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "enerpilot-ml"
    assert "version" in data


def test_forecast_endpoint_with_valid_history():
    m_id = str(uuid.uuid4())
    history = _generate_synthetic_history(machine_id=m_id, count=48)
    payload = {
        "machine_id": m_id,
        "factory_id": str(uuid.uuid4()),
        "horizon_hours": 12,
        "machines": [
            {"machine_id": m_id, "history": history}
        ]
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "forecasts" in data
    forecasts = data["forecasts"]
    assert len(forecasts) == 12
    for item in forecasts:
        assert item["machine_id"] == m_id
        assert "forecast_timestamp" in item
        assert item["predicted_energy_kwh"] >= 0
        assert item["model_version"] is not None


def test_forecast_endpoint_empty_history():
    payload = {
        "machine_id": str(uuid.uuid4()),
        "horizon_hours": 24,
        "machines": []
    }
    response = client.post("/forecast", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["forecasts"] == []


def test_anomaly_detection_endpoint():
    m_id = str(uuid.uuid4())
    history = _generate_synthetic_history(machine_id=m_id, count=40)
    # Inject a clear spike
    spike_ts = (pd.Timestamp(history[-1]["timestamp"]) + pd.Timedelta(hours=1)).isoformat()
    history.append({
        "timestamp": spike_ts,
        "energy_kwh": 750.0,
        "power_kw": 680.0,
    })

    readings = [{"machine_id": m_id, **h} for h in history]
    payload = {
        "factory_id": str(uuid.uuid4()),
        "readings": readings
    }
    response = client.post("/anomalies/detect", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "anomalies" in data
    anomalies = data["anomalies"]
    assert len(anomalies) >= 1

    item = anomalies[0]
    assert item["machine_id"] == m_id
    assert item["expected_energy_kwh"] >= 0
    assert item["actual_energy_kwh"] >= 0
    assert 0 <= item["anomaly_score"] <= 1.0
    assert item["severity"] in {"low", "medium", "high", "critical"}


def test_root_cause_analysis_endpoint():
    m_id = str(uuid.uuid4())
    history = _generate_synthetic_history(machine_id=m_id, count=30)
    anomaly_ts = history[-1]["timestamp"]

    payload = {
        "anomaly": {
            "id": str(uuid.uuid4()),
            "machine_id": m_id,
            "timestamp": anomaly_ts,
            "expected_energy_kwh": 320.0,
            "actual_energy_kwh": 650.0,
            "deviation_percent": 103.1,
        },
        "machine": {"name": "CNC Machine 3", "type": "CNC", "status": "operational"},
        "recent_readings": history,
        "recent_production": [{"timestamp": anomaly_ts, "production_units": 150.0}],
    }
    response = client.post("/root-cause/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert len(data["summary"]) > 0
    assert 0.0 <= data["confidence"] <= 1.0
    assert isinstance(data["contributors"], list)


def test_recommendations_endpoint():
    m_id = str(uuid.uuid4())
    history = _generate_synthetic_history(machine_id=m_id, count=30)
    readings = [{"machine_id": m_id, **h} for h in history]

    payload = {
        "factory_id": str(uuid.uuid4()),
        "machines": [{"id": m_id, "name": "CNC Machine 3", "status": "operational"}],
        "recent_energy_readings": readings,
        "recent_anomalies": [
            {
                "machine_id": m_id,
                "severity": "high",
                "status": "open",
                "timestamp": history[-1]["timestamp"],
            }
        ]
    }
    response = client.post("/recommendations", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "recommendations" in data
    recs = data["recommendations"]
    assert len(recs) >= 1
    r = recs[0]
    assert r["machine_id"] == m_id
    assert r["title"]
    assert r["description"]
    assert r["priority"] in {"low", "medium", "high", "critical"}
    assert r["recommendation_type"]


def test_copilot_endpoint():
    m_id = str(uuid.uuid4())
    payload = {
        "question": "Which machine is consuming the most energy?",
        "context": {
            "factory_id": str(uuid.uuid4()),
            "energy_readings_total_kwh": 4500.0,
            "production_records_total_units": 1200.0,
            "machines": [
                {"id": m_id, "name": "CNC-03", "status": "operational"}
            ],
            "recent_anomalies": [],
            "recommendations": [],
            "alerts": []
        },
        "allowed_tools": ["get_energy_consumption", "get_machine_status"]
    }
    response = client.post("/copilot", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert len(data["answer"]) > 0
    assert isinstance(data["citations"], list)
