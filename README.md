1. Overview

Project: EnerPilot — AI-Powered Industrial Energy Intelligence & Optimization Platform

Hackathon: Yuva Yodha Energy Tech Hackathon 2026

Challenge: Smart Manufacturing — Industrial Energy & Process Efficiency

Role: Frontend Developer / UI-UX Engineer

Primary Ownership: frontend/

EnerPilot is an industrial energy intelligence platform that helps manufacturing facilities monitor energy consumption, forecast demand, detect anomalies, investigate root causes, simulate operational scenarios, and optimize production schedules.

Member 1 is responsible for building the complete frontend application and integrating it with the backend and AI/ML services.

2. Technology Stack

Technology              Purpose
  Next.js                Frontend framework
  React.js                UI development
  TypeScript              Type safety
  Tailwind CSS            Styling
  Recharts                Data visualization
  Lucide React            Icons
  Axios / Fetch API        backend communication 

Use the technologies already configured in the project. Do not replace the existing stack without team approval.

3. Main Responsibilities

Member 1 owns the complete frontend development lifecycle:
Design and implement the application interface.
Build reusable React components.
Develop responsive dashboard layouts.
Integrate backend REST APIs.
Display AI/ML predictions and analysis.
Implement charts, tables, filters, and interactive controls.
Handle loading, error, empty, and success states.
Maintain consistent design and accessibility.
Test frontend functionality before integration.
Important: Member 1 owns the frontend. Backend business logic, ML models, database schemas, and optimization algorithms belong to their respective team members.

4. Frontend Modules to Develop
   
4.1 Overview Dashboard
Display the overall industrial energy performance.

Required elements:
Total energy consumption (kWh).
Energy consumption per production unit.
Peak power demand.
Total production.
Energy cost.
Estimated CO₂ emissions.
Energy consumption trend.
Production versus energy comparison.
Machine-wise energy distribution.
Machine operational status.
Recent alerts and recommendations.

4.2 Energy Intelligence

Provide detailed energy analytics.
Features:
Energy consumption trends.
Daily, weekly, and monthly analysis.
Energy consumption by machine.
Energy consumption by production line.
Energy cost analysis.
Historical comparisons.
Date-range filters.

4.3 Machine Monitoring
Display industrial machine performance.

Features:
Machine list and status.
Machine-wise energy consumption.
Operating hours.
Production output.
Energy efficiency.
Machine detail view.
Abnormal machine indicators.

4.4 Energy Forecast
Display AI-powered energy predictions.

Features:
Historical consumption chart.
Predicted consumption chart.
Forecast time range selection.
Actual versus predicted comparison.
Forecast confidence or uncertainty information, when provided by the model.
Expected peak demand.
Clearly distinguish historical observations from model predictions.

4.5 Anomaly Detection
Display abnormal energy consumption detected by the ML service.

Features:
Anomaly list.
Machine identification.
Detection timestamp.
Severity level.
Expected versus actual consumption.
Anomaly status.
Investigation details.

4.6 Root Cause Analysis
Display potential reasons behind abnormal energy consumption.

Features:
Detected issue.
Affected machine.
Supporting evidence.
Contributing factors.
Recommended investigation steps.
Confidence or evidence level, when available.
Do not present correlations or suspected causes as confirmed root causes.

4.7 Digital Twin
Build a software-based simulation interface.

Features:
Scenario configuration.
Machine operating parameters.
Production quantity controls.
Operating duration controls.
Energy consumption comparison.
Baseline versus simulated results.
Estimated energy savings.
Scenario comparison.
The frontend should send simulation parameters to the backend and display returned results. Do not calculate or invent simulation results inside UI components.

4.8 Production Optimization
Display optimized production schedules.

Features:
Production schedule.
Machine allocation.
Schedule timeline.
Energy consumption comparison.
Production constraints.
Optimization recommendations.
Before-and-after comparison.

4.9 AI Energy Copilot
Create an integrated industrial energy assistant.

Features:

Chat interface.
User questions about energy consumption.
Machine performance questions.
Forecast explanations.
Anomaly explanations.
Recommendation summaries.
Evidence-linked responses.
The Copilot must use backend-provided AI responses and verified platform data. Do not generate fake energy statistics in the frontend.

4.10 Recommendations
Display actionable energy-saving recommendations.

Features:
Recommendation title.
Description.
Affected machine or production line.
Estimated savings, if calculated by the backend.
Priority.
Implementation status.
Suggested actions.

4.11 Alerts
Display important operational notifications.

Features:
Critical alerts.
Warning alerts.
Informational alerts.
Alert timestamps.
Affected machines.
Read/unread status.
Alert details.

4.12 Settings

Provide application configuration options.
Features:
User profile.
Factory information.
Notification preferences.
Application preferences.
Account settings.
