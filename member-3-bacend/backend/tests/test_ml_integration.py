import os
import uuid
from datetime import datetime, timezone
import pandas as pd
import pytest

from app.integrations import ml_service
from app.schemas import (
    CopilotAnswer,
    MLAnomalyItem,
    MLForecastItem,
    MLRecommendationItem,
    MLRootCauseResponse,
)


@pytest.mark.anyio
async def test_live_ml_forecast_communication(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ml_service_url", "http://127.0.0.1:8001")

    m_id = str(uuid.uuid4())
    # 36 valid sequential hourly timestamps
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=36, freq="h")
    history = [
        {
            "timestamp": ts.isoformat(),
            "energy_kwh": 100.0 + (i % 5) * 2.0,
            "power_kw": 90.0,
        }
        for i, ts in enumerate(timestamps)
    ]

    payload = {
        "machine_id": m_id,
        "factory_id": str(uuid.uuid4()),
        "horizon_hours": 6,
        "start_time": timestamps[-1].isoformat(),
        "machines": [{"machine_id": m_id, "history": history}],
    }

    results = await ml_service.forecast(payload)
    assert isinstance(results, list)
    assert len(results) == 6
    for item in results:
        assert isinstance(item, MLForecastItem)
        assert item.predicted_energy_kwh >= 0
        assert item.machine_id == uuid.UUID(m_id)


@pytest.mark.anyio
async def test_live_ml_anomaly_detection_communication(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ml_service_url", "http://127.0.0.1:8001")

    m_id = str(uuid.uuid4())
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=25, freq="h")
    readings = [
        {
            "machine_id": m_id,
            "timestamp": ts.isoformat(),
            "energy_kwh": 50.0,
            "power_kw": 45.0,
        }
        for ts in timestamps
    ]
    # Add a massive spike
    readings.append({
        "machine_id": m_id,
        "timestamp": (timestamps[-1] + pd.Timedelta(hours=1)).isoformat(),
        "energy_kwh": 250.0,
        "power_kw": 220.0,
    })

    payload = {
        "factory_id": str(uuid.uuid4()),
        "readings": readings,
    }

    results = await ml_service.detect_anomalies(payload)
    assert isinstance(results, list)
    assert len(results) >= 1
    for a in results:
        assert isinstance(a, MLAnomalyItem)
        assert a.severity in {"low", "medium", "high", "critical"}


@pytest.mark.anyio
async def test_live_ml_root_cause_communication(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ml_service_url", "http://127.0.0.1:8001")

    m_id = str(uuid.uuid4())
    timestamps = pd.date_range("2026-10-01 00:00:00", periods=24, freq="h")
    history = [
        {"timestamp": ts.isoformat(), "energy_kwh": 50.0, "power_kw": 45.0}
        for ts in timestamps
    ]

    payload = {
        "anomaly": {
            "id": str(uuid.uuid4()),
            "machine_id": m_id,
            "timestamp": timestamps[-1].isoformat(),
            "expected_energy_kwh": 50.0,
            "actual_energy_kwh": 120.0,
            "deviation_percent": 140.0,
        },
        "machine": {"name": "CNC-01", "type": "CNC", "status": "operational", "rated_power_kw": 100.0},
        "recent_readings": history,
        "recent_maintenance": [],
        "recent_production": [],
    }

    result = await ml_service.analyze_root_cause(payload)
    assert isinstance(result, MLRootCauseResponse)
    assert len(result.summary) > 0
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.anyio
async def test_live_ml_recommendations_communication(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ml_service_url", "http://127.0.0.1:8001")

    m_id = str(uuid.uuid4())
    payload = {
        "factory_id": str(uuid.uuid4()),
        "machines": [{"id": m_id, "name": "CNC-01", "status": "operational"}],
        "recent_energy_readings": [
            {"machine_id": m_id, "timestamp": "2026-10-01T00:00:00Z", "energy_kwh": 100.0, "power_kw": 90.0}
        ],
        "recent_anomalies": [
            {"machine_id": m_id, "severity": "high", "status": "open"}
        ],
    }

    results = await ml_service.generate_recommendations(payload)
    assert isinstance(results, list)
    assert len(results) >= 1
    for r in results:
        assert isinstance(r, MLRecommendationItem)
        assert r.title
        assert r.description
        assert r.priority in {"low", "medium", "high", "critical"}


@pytest.mark.anyio
async def test_live_ml_copilot_communication(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "ml_service_url", "http://127.0.0.1:8001")

    payload = {
        "question": "Which machine is consuming the most energy?",
        "context": {
            "factory_id": str(uuid.uuid4()),
            "energy_readings_total_kwh": 3000.0,
            "production_records_total_units": 1000.0,
            "machines": [{"id": str(uuid.uuid4()), "name": "Compressor-01", "status": "operational"}],
            "recent_anomalies": [],
            "recommendations": [],
            "alerts": [],
        },
        "allowed_tools": ["get_energy_consumption", "get_machine_status"],
    }

    result = await ml_service.copilot(payload)
    assert isinstance(result, CopilotAnswer)
    assert len(result.answer) > 0
    assert isinstance(result.citations, list)
