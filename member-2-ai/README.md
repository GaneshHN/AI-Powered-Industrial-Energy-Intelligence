# EnerPilot AI/ML Microservice (Member 2)

This microservice wraps Member 2's industrial machine learning algorithms into a high-performance FastAPI service designed to integrate directly with Member 3's FastAPI backend (`app/integrations/ml_service.py`).

## Features

- **Energy Forecasting (`POST /forecast`)**: Multi-horizon energy demand forecasting utilizing Random Forest regression with cyclical and lag-based time-series features.
- **Anomaly Detection (`POST /anomalies/detect`)**: Rolling window baseline statistics and dynamic deviation thresholds for industrial energy consumption.
- **Root-Cause Analysis (`POST /root-cause/analyze`)**: Multi-factor correlation and attribution over derived machine load, idle time, and production volume.
- **Prescriptive Recommendations (`POST /recommendations`)**: Rule- and evidence-based recommendation generation mapped from anomalies and root causes.
- **AI Copilot (`POST /copilot`)**: Domain-specific query resolution citing evidence and operational metrics.
- **Service Health (`GET /health`)**: Lightweight health check endpoint for monitoring and orchestration.

## Installation & Environment Setup

```bash
cd member-2-ai
pip install -r requirements.txt
```

## Running the Service

Start the microservice on port 8001:

```bash
uvicorn service:app --host 0.0.0.0 --port 8001
```

Or for development with auto-reload:

```bash
uvicorn service:app --host 0.0.0.0 --port 8001 --reload
```

Interactive OpenAPI documentation is available at `http://localhost:8001/docs`.

## Integration Contract PARITY

The service strictly honors Member 3's backend schemas:
- `MLForecastItem` -> `{"forecasts": [{"machine_id", "forecast_timestamp", "predicted_energy_kwh", "lower_bound", "upper_bound", "model_version"}]}`
- `MLAnomalyItem` -> `{"anomalies": [{"machine_id", "timestamp", "expected_energy_kwh", "actual_energy_kwh", "deviation_percent", "anomaly_score", "severity"}]}`
- `MLRootCauseResponse` -> `{"summary", "confidence", "contributors"}`
- `MLRecommendationItem` -> `{"recommendations": [{"machine_id", "title", "description", "priority", "recommendation_type"}]}`
- `CopilotAnswer` -> `{"answer", "citations"}`

## Testing

Run all unit and integration tests:

```bash
pytest
```
