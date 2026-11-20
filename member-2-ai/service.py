"""
EnerPilot AI/ML Microservice
Exposes Member 2's five ML algorithms via FastAPI HTTP endpoints:
- POST /forecast
- POST /anomalies/detect
- POST /root-cause/analyze
- POST /recommendations
- POST /copilot
- GET /health
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

# Ensure member-2-ai directory is in sys.path
SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd

from ml.anomaly.detect import detect_anomalies, severity_for_deviation
from ml.copilot.service import CopilotService
from ml.forecasting.predict import forecast_energy
from ml.recommendations.engine import generate_recommendation
from ml.root_cause.analysis import analyze_root_cause


app = FastAPI(
    title="EnerPilot AI/ML Microservice",
    description="Machine Learning service for energy forecasting, anomaly detection, root cause analysis, recommendations, and copilot.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request and Response Schemas
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "enerpilot-ml"
    version: str = "0.1.0"


class ForecastHistoryItem(BaseModel):
    timestamp: str
    energy_kwh: float
    power_kw: float | None = None


class MachineHistoryGroup(BaseModel):
    machine_id: str
    history: list[ForecastHistoryItem] = Field(default_factory=list)


class ForecastRequest(BaseModel):
    machine_id: str | None = None
    factory_id: str | None = None
    horizon_hours: int = Field(default=24, ge=1, le=168)
    start_time: str | None = None
    machines: list[MachineHistoryGroup] = Field(default_factory=list)


class ForecastItemResponse(BaseModel):
    machine_id: str | None = None
    forecast_timestamp: str
    predicted_energy_kwh: float = Field(ge=0)
    lower_bound: float | None = None
    upper_bound: float | None = None
    model_version: str | None = None


class ForecastResponse(BaseModel):
    forecasts: list[ForecastItemResponse]


class AnomalyReadingItem(BaseModel):
    machine_id: str
    timestamp: str
    energy_kwh: float
    power_kw: float | None = None


class AnomalyDetectRequest(BaseModel):
    factory_id: str
    readings: list[AnomalyReadingItem] = Field(default_factory=list)


class AnomalyItemResponse(BaseModel):
    machine_id: str
    timestamp: str
    expected_energy_kwh: float = Field(ge=0)
    actual_energy_kwh: float = Field(ge=0)
    deviation_percent: float
    anomaly_score: float = Field(ge=0, le=1)
    severity: Literal["low", "medium", "high", "critical"]


class AnomalyDetectResponse(BaseModel):
    anomalies: list[AnomalyItemResponse]


class RootCauseAnomalyData(BaseModel):
    id: str | None = None
    machine_id: str
    timestamp: str
    expected_energy_kwh: float | None = None
    actual_energy_kwh: float | None = None
    deviation_percent: float | None = None


class RootCauseReadingItem(BaseModel):
    timestamp: str
    energy_kwh: float
    power_kw: float | None = None


class RootCauseProductionItem(BaseModel):
    timestamp: str | None = None
    production_units: float | None = None


class RootCauseMaintenanceItem(BaseModel):
    maintenance_type: str | None = None
    start_time: str | None = None
    end_time: str | None = None


class RootCauseRequest(BaseModel):
    anomaly: RootCauseAnomalyData
    machine: dict[str, Any] | None = None
    recent_readings: list[RootCauseReadingItem] = Field(default_factory=list)
    recent_maintenance: list[RootCauseMaintenanceItem] = Field(default_factory=list)
    recent_production: list[RootCauseProductionItem] = Field(default_factory=list)


class RootCauseResponse(BaseModel):
    summary: str
    confidence: float = Field(ge=0, le=1)
    contributors: list[dict[str, Any]] = Field(default_factory=list)


class RecommendationMachineItem(BaseModel):
    id: str
    name: str | None = None
    status: str | None = None


class RecommendationReadingItem(BaseModel):
    machine_id: str
    timestamp: str
    energy_kwh: float
    power_kw: float | None = None


class RecommendationAnomalyItem(BaseModel):
    machine_id: str
    severity: str | None = None
    status: str | None = None
    timestamp: str | None = None
    expected_energy_kwh: float | None = None
    actual_energy_kwh: float | None = None


class RecommendationRequest(BaseModel):
    factory_id: str
    machines: list[RecommendationMachineItem] = Field(default_factory=list)
    recent_energy_readings: list[RecommendationReadingItem] = Field(default_factory=list)
    recent_anomalies: list[RecommendationAnomalyItem] = Field(default_factory=list)


class RecommendationItemResponse(BaseModel):
    machine_id: str | None = None
    title: str
    description: str
    priority: Literal["low", "medium", "high", "critical"]
    recommendation_type: str


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationItemResponse]


class CopilotRequest(BaseModel):
    question: str
    context: dict[str, Any] = Field(default_factory=dict)
    allowed_tools: list[str] = Field(default_factory=list)


class CopilotResponse(BaseModel):
    answer: str
    citations: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check() -> HealthResponse:
    return HealthResponse()


@app.post("/forecast", response_model=ForecastResponse, tags=["Forecasting"])
def run_forecast(payload: ForecastRequest) -> ForecastResponse:
    target_machine_id = payload.machine_id
    horizon_hours = payload.horizon_hours
    forecast_results: list[ForecastItemResponse] = []

    # Prepare machine groups to forecast
    machines_to_forecast = []
    if payload.machines:
        for m in payload.machines:
            if target_machine_id is None or m.machine_id == target_machine_id:
                machines_to_forecast.append(m)
    elif target_machine_id:
        machines_to_forecast.append(MachineHistoryGroup(machine_id=target_machine_id, history=[]))

    for m_group in machines_to_forecast:
        mid = m_group.machine_id
        if not m_group.history:
            continue

        rows = []
        for h in m_group.history:
            rows.append({
                "timestamp": h.timestamp,
                "machine_id": mid,
                "energy_kwh": h.energy_kwh,
                "power_kw": h.power_kw if h.power_kw is not None else h.energy_kwh * 0.9,
            })

        frame = pd.DataFrame(rows)
        # Member 2's forecast requires at least 24 hours of historical data
        if len(frame) < 24:
            continue

        res = forecast_energy(frame, machine_id=mid, horizon_hours=horizon_hours, start_time=None)
        if res.get("success") and "forecast" in res:
            model_ver = res.get("model_version", "forecast-v1")
            for item in res["forecast"]:
                forecast_results.append(
                    ForecastItemResponse(
                        machine_id=mid,
                        forecast_timestamp=item["timestamp"],
                        predicted_energy_kwh=max(0.0, float(item["predicted_energy_kwh"])),
                        lower_bound=None,
                        upper_bound=None,
                        model_version=model_ver,
                    )
                )

    # Backend enforces len(forecasts) <= 500
    if len(forecast_results) > 500:
        forecast_results = forecast_results[:500]

    return ForecastResponse(forecasts=forecast_results)


@app.post("/anomalies/detect", response_model=AnomalyDetectResponse, tags=["Anomaly Detection"])
def run_anomaly_detection(payload: AnomalyDetectRequest) -> AnomalyDetectResponse:
    if not payload.readings:
        return AnomalyDetectResponse(anomalies=[])

    rows = []
    for r in payload.readings:
        rows.append({
            "machine_id": r.machine_id,
            "timestamp": r.timestamp,
            "energy_kwh": r.energy_kwh,
            "power_kw": r.power_kw if r.power_kw is not None else r.energy_kwh * 0.9,
        })

    frame = pd.DataFrame(rows)
    all_anomalies: list[AnomalyItemResponse] = []

    # Run anomaly detection per machine so rolling windows do not cross machines
    for mid, group in frame.groupby("machine_id"):
        res = detect_anomalies(group, machine_id=str(mid))
        if res.get("success") and "anomalies" in res:
            for a in res["anomalies"]:
                raw_sev = a.get("severity", "medium").lower()

                # Filter sub-threshold informational observations from active alarm creation
                if raw_sev == "info":
                    continue

                sev: Literal["low", "medium", "high", "critical"] = "medium"
                if raw_sev in {"low", "medium", "high", "critical"}:
                    sev = raw_sev

                score = float(a.get("anomaly_score", 0.0))
                score = max(0.0, min(1.0, score))

                all_anomalies.append(
                    AnomalyItemResponse(
                        machine_id=str(a["machine_id"]),
                        timestamp=str(a["timestamp"]),
                        expected_energy_kwh=max(0.0, float(a.get("expected_energy", 0.0))),
                        actual_energy_kwh=max(0.0, float(a.get("actual_energy", 0.0))),
                        deviation_percent=float(a.get("deviation_percent", 0.0)),
                        anomaly_score=score,
                        severity=sev,
                    )
                )

    # Backend enforces len(anomalies) <= 1000
    if len(all_anomalies) > 1000:
        all_anomalies = all_anomalies[:1000]

    return AnomalyDetectResponse(anomalies=all_anomalies)


@app.post("/root-cause/analyze", response_model=RootCauseResponse, tags=["Root Cause Analysis"])
def run_root_cause(payload: RootCauseRequest) -> RootCauseResponse:
    anomaly_dict = {
        "machine_id": payload.anomaly.machine_id,
        "timestamp": payload.anomaly.timestamp,
        "anomaly_id": payload.anomaly.id,
        "expected_energy_kwh": payload.anomaly.expected_energy_kwh,
        "actual_energy_kwh": payload.anomaly.actual_energy_kwh,
        "deviation_percent": payload.anomaly.deviation_percent,
    }

    if not payload.recent_readings:
        res = analyze_root_cause(pd.DataFrame(), anomaly_dict)
        return RootCauseResponse(
            summary=res.get("summary", "Insufficient data to determine root cause."),
            confidence=max(0.0, min(1.0, float(res.get("confidence", 0.0)))),
            contributors=res.get("contributors", []),
        )

    # Retrieve rated nominal power from machine metadata if available
    rated_kw = None
    if payload.machine and payload.machine.get("rated_power_kw") is not None:
        try:
            val = float(payload.machine["rated_power_kw"])
            if val > 0:
                rated_kw = val
        except (ValueError, TypeError):
            rated_kw = None

    # Map production units if provided
    prod_units = None
    if payload.recent_production:
        valid_units = [p.production_units for p in payload.recent_production if p.production_units is not None]
        if valid_units:
            prod_units = sum(valid_units) / len(valid_units)

    # Standby power threshold (10% of rated capacity or 1.0 kW)
    standby_threshold = (0.10 * rated_kw) if rated_kw is not None else 1.0

    rows = []
    for r in payload.recent_readings:
        p_kw = r.power_kw if r.power_kw is not None else r.energy_kwh * 0.9

        row_dict: dict[str, Any] = {
            "machine_id": payload.anomaly.machine_id,
            "timestamp": r.timestamp,
            "energy_kwh": r.energy_kwh,
            "power_kw": p_kw,
        }

        # Operational variable: Estimated Electrical Load Factor (only if rated_kw exists)
        if rated_kw is not None:
            load_factor_pct = min(100.0, max(0.0, (p_kw / rated_kw) * 100.0))
            row_dict["machine_load"] = load_factor_pct
            # Hourly idle duration estimation
            row_dict["idle_time"] = 1.0 if p_kw <= standby_threshold else 0.0

        if prod_units is not None and prod_units > 0:
            row_dict["production_units"] = prod_units

        rows.append(row_dict)

    frame = pd.DataFrame(rows)
    res = analyze_root_cause(frame, anomaly_dict)

    # Refine contributor descriptions to distinguish estimated electrical values from physical sensor measurements
    contributors = []
    for c in res.get("contributors", []):
        c_copy = dict(c)
        if c_copy.get("factor") == "machine_load" and rated_kw is not None:
            c_copy["evidence"] = (
                f"Estimated electrical load factor averaged {c_copy.get('evidence', '')} "
                f"(derived from active power against {rated_kw:.1f} kW rated capacity; not a measured mechanical sensor)."
            )
        elif c_copy.get("factor") == "idle_time":
            c_copy["evidence"] = (
                f"Estimated standby idle duration (active power <= {standby_threshold:.1f} kW): {c_copy.get('evidence', '')}"
            )
        contributors.append(c_copy)

    confidence = float(res.get("confidence", 0.0))
    confidence = max(0.0, min(1.0, confidence))

    return RootCauseResponse(
        summary=res.get("summary", "Root-cause analysis completed."),
        confidence=confidence,
        contributors=contributors,
    )


@app.post("/recommendations", response_model=RecommendationResponse, tags=["Recommendations"])
def run_recommendations(payload: RecommendationRequest) -> RecommendationResponse:
    recs: list[RecommendationItemResponse] = []
    machine_id_set = {m.id for m in payload.machines}

    # Prepare readings dataframe
    readings_by_machine: dict[str, list[dict[str, Any]]] = {}
    for r in payload.recent_energy_readings:
        readings_by_machine.setdefault(r.machine_id, []).append({
            "timestamp": r.timestamp,
            "machine_id": r.machine_id,
            "energy_kwh": r.energy_kwh,
            "power_kw": r.power_kw if r.power_kw is not None else r.energy_kwh * 0.9,
        })

    # If anomalies are provided, generate recommendations for them
    target_anomalies = list(payload.recent_anomalies)

    # If no anomalies provided, attempt detection on recent readings
    if not target_anomalies and payload.recent_energy_readings:
        for mid, m_readings in readings_by_machine.items():
            m_df = pd.DataFrame(m_readings)
            det = detect_anomalies(m_df, machine_id=mid)
            if det.get("success") and det.get("anomalies"):
                for a in det["anomalies"]:
                    if a.get("severity", "medium").lower() == "info":
                        continue
                    target_anomalies.append(
                        RecommendationAnomalyItem(
                            machine_id=a["machine_id"],
                            severity=a.get("severity", "medium"),
                            status="open",
                            timestamp=a.get("timestamp"),
                            expected_energy_kwh=a.get("expected_energy"),
                            actual_energy_kwh=a.get("actual_energy"),
                        )
                    )

    for anom in target_anomalies:
        mid = anom.machine_id
        m_history = readings_by_machine.get(mid, [])
        m_df = pd.DataFrame(m_history) if m_history else pd.DataFrame()

        anomaly_dict = {
            "machine_id": mid,
            "timestamp": anom.timestamp,
            "severity": anom.severity or "medium",
        }

        root_cause = analyze_root_cause(m_df, anomaly_dict)
        rec_data = generate_recommendation(anomaly_dict, root_cause)

        raw_priority = rec_data.get("priority", "medium").lower()
        priority: Literal["low", "medium", "high", "critical"] = "medium"
        if raw_priority in {"low", "medium", "high", "critical"}:
            priority = raw_priority

        out_machine_id = mid if (not machine_id_set or mid in machine_id_set) else None

        reason = rec_data.get("reason", "Operational optimization opportunity detected.")
        impact = rec_data.get("expected_impact", "")
        description = f"{reason} {impact}".strip()

        recs.append(
            RecommendationItemResponse(
                machine_id=out_machine_id,
                title=rec_data.get("title", f"Optimize {mid} operations"),
                description=description or "Review operating conditions to improve efficiency.",
                priority=priority,
                recommendation_type=rec_data.get("action_type", "investigation"),
            )
        )

    # Backend enforces len(recommendations) <= 500
    if len(recs) > 500:
        recs = recs[:500]

    return RecommendationResponse(recommendations=recs)


@app.post("/copilot", response_model=CopilotResponse, tags=["Copilot"])
def run_copilot(payload: CopilotRequest) -> CopilotResponse:
    ctx = payload.context or {}
    question = payload.question

    # Build representative frame from context
    rows = []
    machines = ctx.get("machines", [])
    total_kwh = float(ctx.get("energy_readings_total_kwh", 0.0) or 0.0)
    total_prod = float(ctx.get("production_records_total_units", 0.0) or 0.0)

    if machines:
        n = max(1, len(machines))
        share_kwh = total_kwh / n
        share_prod = total_prod / n
        for idx, m in enumerate(machines):
            mid = m.get("id") or f"M-{idx+1}"
            rows.append({
                "timestamp": pd.Timestamp.now().isoformat(),
                "machine_id": mid,
                "energy_kwh": share_kwh,
                "power_kw": share_kwh * 0.9,
                "production_units": share_prod,
                "machine_load": 75.0,
                "idle_time": 0.2,
            })
    elif total_kwh > 0:
        rows.append({
            "timestamp": pd.Timestamp.now().isoformat(),
            "machine_id": "Plant-Total",
            "energy_kwh": total_kwh,
            "power_kw": total_kwh * 0.9,
            "production_units": total_prod,
            "machine_load": 75.0,
            "idle_time": 0.2,
        })

    frame = pd.DataFrame(rows)
    service = CopilotService(frame)
    result = service.answer_question(question, context=ctx)

    answer = result.get("answer") or "I don't have enough data to determine this reliably."
    citations = result.get("evidence", []) or []

    return CopilotResponse(
        answer=answer,
        citations=citations,
    )
