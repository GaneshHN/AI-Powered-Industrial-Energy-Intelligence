/**
 * ENERPILOT — TYPED API SERVICES
 * 
 * Central API entry point providing 13 namespaces matching backend route modules:
 * - api.auth
 * - api.factories
 * - api.machines
 * - api.energy
 * - api.production
 * - api.forecast
 * - api.anomalies
 * - api.rootCause
 * - api.recommendations
 * - api.alerts
 * - api.simulation
 * - api.optimization
 * - api.copilot
 * 
 * Preserves backend response schemas, pagination metadata, and UUID identifiers.
 */

import { httpClient, tokenManager, ApiClientError, QueryParamValue } from './client';
import * as Types from './types';

export * from './types';
export * from './client';

export const api = {
  // ==========================================
  // 1. Authentication
  // ==========================================
  auth: {
    /** Register a new user account */
    register(payload: Types.RegisterRequest) {
      return httpClient.post<{ id: string; email: string }>('/api/auth/register', payload, { skipAuth: true });
    },

    /** Exchange credentials for access token & set in token manager */
    async login(payload: Types.LoginRequest) {
      const response = await httpClient.post<Types.TokenResponse>('/api/auth/login', payload, { skipAuth: true });
      if (response.data?.access_token) {
        tokenManager.setToken(response.data.access_token);
      }
      return response;
    },

    /** Get authenticated user profile */
    me() {
      return httpClient.get<Types.BackendUser>('/api/auth/me');
    },

    /** Clear local token and session */
    logout() {
      tokenManager.clearToken();
    },

    /** Check if client currently holds an authentication token */
    isAuthenticated(): boolean {
      return tokenManager.getToken() !== null;
    }
  },

  // ==========================================
  // 2. Factories & Production Lines
  // ==========================================
  factories: {
    /** List factories accessible to current user */
    list(params?: { page?: number; page_size?: number }) {
      return httpClient.get<Types.BackendFactory[]>('/api/factories', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Create a new factory (user becomes owner) */
    create(payload: Types.FactoryCreate) {
      return httpClient.post<Types.BackendFactory>('/api/factories', payload);
    },

    /** Get accessible factory by ID */
    get(factoryId: string) {
      return httpClient.get<Types.BackendFactory>(`/api/factories/${factoryId}`);
    },

    /** Update factory details */
    update(factoryId: string, payload: Types.FactoryUpdate) {
      return httpClient.put<Types.BackendFactory>(`/api/factories/${factoryId}`, payload);
    },

    /** Delete factory (owner only) */
    delete(factoryId: string) {
      return httpClient.delete<void>(`/api/factories/${factoryId}`);
    },

    /** List production lines in an accessible factory */
    listProductionLines(factoryId: string) {
      return httpClient.get<Types.BackendProductionLine[]>(`/api/factories/${factoryId}/production-lines`);
    },

    /** Create a production line in an accessible factory */
    createProductionLine(factoryId: string, payload: Types.ProductionLineCreate) {
      return httpClient.post<Types.BackendProductionLine>(`/api/factories/${factoryId}/production-lines`, payload);
    }
  },

  // ==========================================
  // 3. Machines & Equipment
  // ==========================================
  machines: {
    /** List machines with optional factory, line, and status filters */
    list(params?: {
      factory_id?: string;
      production_line_id?: string;
      status?: Types.BackendMachineStatus;
      page?: number;
      page_size?: number;
    }) {
      return httpClient.get<Types.BackendMachine[]>('/api/machines', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Create machine in accessible factory */
    create(payload: Types.MachineCreate) {
      return httpClient.post<Types.BackendMachine>('/api/machines', payload);
    },

    /** Get machine details, estimates, and maintenance records */
    get(machineId: string, params?: { start_time?: string | Date; end_time?: string | Date }) {
      return httpClient.get<Types.BackendMachineDetail>(`/api/machines/${machineId}`, {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Patch update machine attributes or operational status */
    update(machineId: string, payload: Types.MachineUpdate) {
      return httpClient.patch<Types.BackendMachine>(`/api/machines/${machineId}`, payload);
    }
  },

  // ==========================================
  // 4. Energy Telemetry & Analytics
  // ==========================================
  energy: {
    /** Insert an authorized machine energy reading */
    createReading(payload: Types.EnergyReadingCreate) {
      return httpClient.post<Types.BackendEnergyReading>('/api/energy/readings', payload);
    },

    /** Summarize measured energy and derived intensity, cost, emissions */
    summary(params: {
      factory_id: string;
      machine_id?: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
    }) {
      return httpClient.get<Types.BackendEnergySummary>('/api/energy/summary', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Return measured energy grouped by UTC hour */
    trend(params: {
      factory_id: string;
      machine_id?: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
    }) {
      return httpClient.get<Types.BackendEnergyTrendItem[]>('/api/energy/trend', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Group measured energy by machine */
    byMachine(params: {
      factory_id: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
    }) {
      return httpClient.get<Types.BackendEnergyByMachineItem[]>('/api/energy/by-machine', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Group measured energy by 8-hour shift time blocks */
    byShift(params: {
      factory_id: string;
      machine_id?: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: 'night' | 'day' | 'evening';
    }) {
      return httpClient.get<Types.BackendEnergyByShiftItem[]>('/api/energy/by-shift', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Calculate measured energy per produced unit */
    intensity(params: {
      factory_id: string;
      machine_id?: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
    }) {
      return httpClient.get<Types.BackendEnergyIntensity>('/api/energy/intensity', {
        params: params as Record<string, QueryParamValue>
      });
    }
  },

  // ==========================================
  // 5. Production Records
  // ==========================================
  production: {
    /** List production records */
    list(params: {
      factory_id: string;
      machine_id?: string;
      production_line_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
      page?: number;
      page_size?: number;
    }) {
      return httpClient.get<Types.BackendProductionRecord[]>('/api/production', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Record measured production output */
    create(payload: Types.ProductionRecordCreate) {
      return httpClient.post<Types.BackendProductionRecord>('/api/production', payload);
    },

    /** Summarize production units for factory */
    summary(params: {
      factory_id: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
    }) {
      return httpClient.get<Types.BackendProductionSummary>('/api/production/summary', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Group production by machine */
    byMachine(params: {
      factory_id: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
    }) {
      return httpClient.get<Types.BackendProductionByMachineItem[]>('/api/production/by-machine', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Group production by shift */
    byShift(params: {
      factory_id: string;
      start_time?: string | Date;
      end_time?: string | Date;
      shift?: string;
    }) {
      return httpClient.get<Types.BackendProductionByShiftItem[]>('/api/production/by-shift', {
        params: params as Record<string, QueryParamValue>
      });
    }
  },

  // ==========================================
  // 6. Energy Forecasting
  // ==========================================
  forecast: {
    /** Request energy forecast for a machine or entire factory */
    get(params: {
      factory_id?: string;
      machine_id?: string;
      horizon_hours?: number;
      start_time?: string | Date;
    }) {
      return httpClient.get<Types.BackendForecast[]>('/api/forecast', {
        params: params as Record<string, QueryParamValue>
      });
    }
  },

  // ==========================================
  // 7. Anomaly Detection
  // ==========================================
  anomalies: {
    /** List anomalies with optional severity, status, and time filters */
    list(params?: {
      factory_id?: string;
      machine_id?: string;
      start_time?: string | Date;
      end_time?: string | Date;
      status?: Types.BackendAnomalyStatus;
      severity?: Types.BackendAnomalySeverity;
      page?: number;
      page_size?: number;
    }) {
      return httpClient.get<Types.BackendAnomaly[]>('/api/anomalies', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Get anomaly by ID */
    get(anomalyId: string) {
      return httpClient.get<Types.BackendAnomaly>(`/api/anomalies/${anomalyId}`);
    },

    /** Trigger anomaly detection over time range */
    detect(payload: Types.AnomalyDetectRequest) {
      return httpClient.post<Types.BackendAnomaly[]>('/api/anomalies/detect', payload);
    }
  },

  // ==========================================
  // 8. Root-Cause Analysis (RCA)
  // ==========================================
  rootCause: {
    /** Get stored RCA for an anomaly */
    get(anomalyId: string) {
      return httpClient.get<Types.BackendRootCauseAnalysis>(`/api/root-cause/${anomalyId}`);
    },

    /** Run ML root-cause analysis on an anomaly */
    analyze(payload: Types.RootCauseRequest) {
      return httpClient.post<Types.BackendRootCauseAnalysis>('/api/root-cause/analyze', payload);
    }
  },

  // ==========================================
  // 9. Prescriptive Recommendations
  // ==========================================
  recommendations: {
    /** Generate recommendations via ML service */
    generate(payload: Types.RecommendationGenerateRequest) {
      return httpClient.post<Types.BackendRecommendation[]>('/api/recommendations/generate', payload);
    },

    /** List recommendations */
    list(params?: {
      factory_id?: string;
      machine_id?: string;
      status?: Types.BackendRecommendationStatus;
      page?: number;
      page_size?: number;
    }) {
      return httpClient.get<Types.BackendRecommendation[]>('/api/recommendations', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Get recommendation by ID */
    get(recommendationId: string) {
      return httpClient.get<Types.BackendRecommendation>(`/api/recommendations/${recommendationId}`);
    },

    /** Update recommendation status ('new' | 'reviewed' | 'accepted' | 'dismissed' | 'completed') */
    update(recommendationId: string, payload: Types.RecommendationUpdate) {
      return httpClient.patch<Types.BackendRecommendation>(`/api/recommendations/${recommendationId}`, payload);
    }
  },

  // ==========================================
  // 10. Operational Alerts
  // ==========================================
  alerts: {
    /** List alerts */
    list(params?: {
      factory_id?: string;
      machine_id?: string;
      type?: string;
      severity?: Types.BackendAlertSeverity;
      status?: Types.BackendAlertStatus;
      is_read?: boolean;
      start_time?: string | Date;
      end_time?: string | Date;
      page?: number;
      page_size?: number;
    }) {
      return httpClient.get<Types.BackendAlert[]>('/api/alerts', {
        params: params as Record<string, QueryParamValue>
      });
    },

    /** Get alert by ID */
    get(alertId: string) {
      return httpClient.get<Types.BackendAlert>(`/api/alerts/${alertId}`);
    },

    /** Update alert read state or status ('open' | 'acknowledged' | 'resolved') */
    update(alertId: string, payload: Types.AlertUpdate) {
      return httpClient.patch<Types.BackendAlert>(`/api/alerts/${alertId}`, payload);
    }
  },

  // ==========================================
  // 11. Digital Twin Simulation
  // ==========================================
  simulation: {
    /** Execute and store what-if simulation scenario */
    create(payload: Types.SimulationRequest) {
      return httpClient.post<Types.BackendSimulationResult>('/api/simulation', payload);
    },

    /** Get stored simulation record */
    get(simulationId: string) {
      return httpClient.get<Types.BackendSimulationRecord>(`/api/simulation/${simulationId}`);
    },

    /** Get calculated simulation metrics */
    getResult(simulationId: string) {
      return httpClient.get<Types.BackendSimulationResult['result']>(`/api/simulation/${simulationId}/result`);
    }
  },

  // ==========================================
  // 12. Energy-Aware Production Optimization
  // ==========================================
  optimization: {
    /** Trigger OR-Tools CP-SAT production schedule optimization */
    create(payload: Types.OptimizationRequest) {
      return httpClient.post<Types.BackendOptimizationRun>('/api/optimization', payload);
    },

    /** Get optimization run status */
    get(runId: string) {
      return httpClient.get<Types.BackendOptimizationRecord>(`/api/optimization/${runId}`);
    },

    /** Get completed optimization result schedule & metrics */
    getResult(runId: string) {
      return httpClient.get<{
        status: Types.BackendOptimizationStatus;
        schedule: Types.BackendOptimizationScheduleSlot[];
        metrics: Types.BackendOptimizationMetrics;
      }>(`/api/optimization/${runId}/result`);
    }
  },

  // ==========================================
  // 13. AI Energy Copilot
  // ==========================================
  copilot: {
    /** Submit question to factory-grounded Copilot */
    ask(payload: Types.CopilotRequest) {
      return httpClient.post<Types.BackendCopilotAnswer>('/api/copilot', payload);
    }
  },

  // ==========================================
  // Liveness Check
  // ==========================================
  health() {
    return httpClient.get<{ status: string }>('/health', { skipAuth: true });
  }
};

export default api;
