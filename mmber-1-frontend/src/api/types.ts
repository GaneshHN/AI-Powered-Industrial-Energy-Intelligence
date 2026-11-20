/**
 * ENERPILOT — BACKEND API SCHEMAS & CONTRACTS
 * 
 * Strict mirror of backend Pydantic schemas in `member-3-bacend/backend/app/schemas.py`
 * and database entities in `member-3-bacend/backend/app/models/entities.py`.
 * 
 * These types reflect actual backend serialization contracts and are kept separate
 * from frontend display/view models.
 */

// ==========================================
// Standard API Envelope Models
// ==========================================

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorDetail;
  meta?: Record<string, unknown>;
}

export type ApiResponseEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
}

// ==========================================
// Authentication & User Contracts
// ==========================================

export interface RegisterRequest {
  email: string;
  password: string; // 12-128 characters
}

export interface LoginRequest {
  email: string;
  password: string; // 1-128 characters
}

export interface TokenResponse {
  access_token: string;
  token_type: string; // "bearer"
}

export interface BackendUser {
  id: string; // UUID
  email: string;
}

// ==========================================
// Factory & Line Contracts
// ==========================================

export interface FactoryCreate {
  name: string;
  location?: string | null;
  industry_type?: string | null;
  timezone?: string; // default "UTC"
}

export interface FactoryUpdate {
  name?: string;
  location?: string | null;
  industry_type?: string | null;
  timezone?: string;
}

export interface BackendFactory {
  id: string; // UUID
  name: string;
  location: string | null;
  industry_type: string | null;
  timezone: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductionLineCreate {
  name: string;
  description?: string | null;
}

export interface BackendProductionLine {
  id: string; // UUID
  factory_id: string; // UUID
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Machine & Maintenance Contracts
// ==========================================

export type BackendMachineStatus = 'available' | 'running' | 'maintenance' | 'offline';

export interface MachineCreate {
  factory_id: string; // UUID
  production_line_id?: string | null; // UUID
  name: string;
  machine_type: string;
  rated_power_kw: number;
  production_rate_units_per_hour?: number;
  load_factor?: number;
  idle_power_factor?: number;
  status?: BackendMachineStatus;
}

export interface MachineUpdate {
  production_line_id?: string | null; // UUID
  name?: string;
  machine_type?: string;
  rated_power_kw?: number;
  production_rate_units_per_hour?: number;
  load_factor?: number;
  idle_power_factor?: number;
  status?: BackendMachineStatus;
}

export interface BackendMachine {
  id: string; // UUID
  factory_id: string; // UUID
  production_line_id: string | null; // UUID
  name: string;
  machine_type: string;
  rated_power_kw: number;
  production_rate_units_per_hour: number;
  load_factor: number;
  idle_power_factor: number;
  status: BackendMachineStatus;
  created_at: string;
  updated_at: string;
}

export interface BackendMaintenanceRecord {
  id: string; // UUID
  machine_id: string; // UUID
  maintenance_type: string;
  start_time: string;
  end_time: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface BackendMachineDetail {
  machine: BackendMachine;
  energy_kwh: number;
  power_kw: number;
  utilization_percent: number;
  runtime_hours_estimated: number;
  idle_hours_estimated: number;
  production_units: number;
  maintenance: BackendMaintenanceRecord[];
  metrics_are_estimates: boolean;
}

// ==========================================
// Energy Telemetry & Analytics Contracts
// ==========================================

export interface EnergyReadingCreate {
  machine_id: string; // UUID
  timestamp: string; // ISO 8601 with timezone
  energy_kwh: number;
  power_kw: number;
}

export interface BackendEnergyReading {
  id: string; // UUID
  machine_id: string; // UUID
  timestamp: string;
  energy_kwh: number;
  power_kw: number;
  created_at: string;
}

export interface BackendEnergySummary {
  total_energy_kwh: number;
  peak_demand_kw: number;
  production_units: number;
  energy_per_unit: number;
  energy_cost?: number;
  estimated_cost?: number;
  estimated_co2_kg: number;
  readings_count?: number;
  production_records_count?: number;
}

export interface BackendEnergyTrendItem {
  timestamp: string;
  energy_kwh: number;
  peak_demand_kw: number;
}

export interface BackendEnergyByMachineItem {
  machine_id: string; // UUID
  machine_name: string;
  energy_kwh: number;
  peak_demand_kw: number;
}

export interface BackendEnergyByShiftItem {
  shift: string; // "night" | "day" | "evening"
  energy_kwh: number;
  peak_demand_kw: number;
}

export interface BackendEnergyIntensity {
  energy_per_unit: number;
  energy_kwh: number;
  production_units: number;
}

// ==========================================
// Production Contracts
// ==========================================

export interface ProductionRecordCreate {
  factory_id: string; // UUID
  production_line_id: string; // UUID
  machine_id?: string | null; // UUID
  timestamp: string; // ISO 8601 with timezone
  production_units: number;
  shift: string;
}

export interface BackendProductionRecord {
  id: string; // UUID
  production_line_id: string; // UUID
  machine_id: string | null; // UUID
  timestamp: string;
  production_units: number;
  shift: string;
  created_at: string;
}

export interface BackendProductionSummary {
  total_production_units: number;
  records_count: number;
}

export interface BackendProductionByMachineItem {
  machine_id: string; // UUID
  machine_name: string;
  production_units: number;
}

export interface BackendProductionByShiftItem {
  shift: string;
  production_units: number;
}

// ==========================================
// Forecasting Contracts
// ==========================================

export interface BackendForecast {
  id: string; // UUID
  machine_id: string; // UUID
  forecast_timestamp: string;
  predicted_energy_kwh: number;
  lower_bound: number | null;
  upper_bound: number | null;
  model_version: string | null;
  created_at: string;
}

// ==========================================
// Anomaly Detection Contracts
// ==========================================

export type BackendAnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type BackendAnomalyStatus = 'new' | 'reviewed' | 'resolved';

export interface AnomalyDetectRequest {
  factory_id: string; // UUID
  machine_id?: string | null; // UUID
  start_time?: string | null; // ISO 8601 with timezone
  end_time?: string | null;   // ISO 8601 with timezone
}

export interface BackendAnomaly {
  id: string; // UUID
  factory_id: string; // UUID
  machine_id: string; // UUID
  timestamp: string;
  expected_energy_kwh: number;
  actual_energy_kwh: number;
  deviation_percent: number;
  anomaly_score: number;
  severity: BackendAnomalySeverity;
  status: BackendAnomalyStatus;
  created_at: string;
}

// ==========================================
// Root-Cause Analysis Contracts
// ==========================================

export interface RootCauseRequest {
  anomaly_id: string; // UUID
}

export interface BackendRootCauseAnalysis {
  id: string; // UUID
  anomaly_id: string; // UUID
  summary: string;
  confidence: number;
  contributors: Array<{
    factor?: string;
    direction?: string;
    evidence?: string;
    confidence?: number;
    classification?: string;
    [key: string]: unknown;
  }>;
  created_at: string;
}

// ==========================================
// Recommendation Contracts
// ==========================================

export type BackendRecommendationPriority = 'low' | 'medium' | 'high' | 'critical';
export type BackendRecommendationStatus = 'new' | 'reviewed' | 'accepted' | 'dismissed' | 'completed';

export interface RecommendationGenerateRequest {
  factory_id: string; // UUID
}

export interface RecommendationUpdate {
  status: BackendRecommendationStatus;
}

export interface BackendRecommendation {
  id: string; // UUID
  factory_id: string; // UUID
  machine_id: string | null; // UUID
  title: string;
  description: string;
  priority: BackendRecommendationPriority;
  status: BackendRecommendationStatus;
  recommendation_type: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Alert Contracts
// ==========================================

export type BackendAlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BackendAlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertUpdate {
  is_read?: boolean;
  status?: BackendAlertStatus;
}

export interface BackendAlert {
  id: string; // UUID
  factory_id: string; // UUID
  machine_id: string | null; // UUID
  type: string;
  severity: BackendAlertSeverity;
  title: string;
  message: string;
  status: BackendAlertStatus;
  is_read: boolean;
  created_at: string;
}

// ==========================================
// Digital Twin Simulation Contracts
// ==========================================

export interface ScheduleItem {
  machine_id: string; // UUID
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  operating_hours?: number | null;
  load?: number; // 0 < load <= 1
  shift?: string | null;
}

export interface SimulationRequest {
  factory_id: string; // UUID
  name?: string;
  description?: string | null;
  production_target: number;
  schedule: ScheduleItem[];
  compare_with_current?: boolean;
}

export interface BackendSimulationMachineDetail {
  machine_id: string; // UUID
  operating_hours: number;
  production_units: number;
  energy_kwh: number;
}

export interface BackendSimulationComparison {
  current: {
    production_units: number;
    energy_kwh: number;
    peak_demand_kw: number;
  };
  alternative: {
    production_units: number;
    energy_kwh: number;
    peak_demand_kw: number;
  };
  difference: {
    energy_kwh: number;
    peak_demand_kw: number;
  };
}

export interface BackendSimulationResult {
  id: string; // UUID
  status: string;
  result: {
    production_units: number;
    energy_kwh: number;
    peak_demand_kw: number;
    estimated_cost: number;
    machine_details: BackendSimulationMachineDetail[];
    comparison?: BackendSimulationComparison | null;
  };
}

export interface BackendSimulationRecord {
  id: string; // UUID
  name: string;
  description: string | null;
  status: string;
  factory_id: string;
  created_at: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

// ==========================================
// Optimization Contracts
// ==========================================

export type BackendOptimizationStatus = 'optimal' | 'feasible' | 'infeasible' | 'timeout';

export interface OptimizationConstraints {
  max_peak_kw?: number | null;
}

export interface OptimizationRequest {
  factory_id: string; // UUID
  production_target: number;
  planning_horizon_hours?: number; // 1-168, default 24
  constraints?: OptimizationConstraints;
}

export interface BackendOptimizationScheduleSlot {
  machine_id: string; // UUID
  start: string; // ISO 8601
  end: string;   // ISO 8601
  operating_hours: number;
  production_units: number;
}

export interface BackendOptimizationMetrics {
  production_units: number;
  energy_kwh: number;
  peak_demand_kw: number;
  estimated_cost: number;
}

export interface BackendOptimizationRun {
  id: string; // UUID
  status: BackendOptimizationStatus;
  schedule: BackendOptimizationScheduleSlot[];
  metrics: BackendOptimizationMetrics | null;
  explanation: string | null;
}

export interface BackendOptimizationRecord {
  id: string; // UUID
  status: string;
  result: {
    schedule: BackendOptimizationScheduleSlot[];
    metrics: BackendOptimizationMetrics;
  } | null;
  explanation: string | null;
  created_at: string;
  completed_at: string | null;
}

// ==========================================
// Copilot Contracts
// ==========================================

export interface CopilotRequest {
  factory_id: string; // UUID
  question: string;
}

export interface BackendCopilotAnswer {
  answer: string;
  citations: Array<{
    source?: string;
    detail?: string;
    [key: string]: unknown;
  }>;
}
