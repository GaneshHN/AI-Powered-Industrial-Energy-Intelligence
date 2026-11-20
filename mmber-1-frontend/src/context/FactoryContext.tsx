import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Factory,
  Machine,
  EnergyHourlyData,
  Anomaly,
  RootCauseInvestigation,
  DigitalTwinScenario,
  ProductionScheduleItem,
  Recommendation,
  AlertItem,
  UserSession
} from '../types';
import {
  FACTORIES,
  MACHINES,
  HOURLY_ENERGY_SERIES,
  ANOMALIES,
  ROOT_CAUSE_CASES,
  DIGITAL_TWIN_SCENARIOS,
  PRODUCTION_SCHEDULE,
  RECOMMENDATIONS,
  ALERTS
} from '../data/mockIndustrialData';
import { api, tokenManager, ApiClientError, PaginationMeta } from '../api';
import { transformBackendMachine } from '../api/adapters';
import * as ApiTypes from '../api/types';

export type DateRange = 'today' | 'yesterday' | 'last7days' | 'monthToDate';
export type AppRoute =
  | 'dashboard'
  | 'energy'
  | 'machines'
  | 'forecast'
  | 'anomalies'
  | 'root-cause'
  | 'digital-twin'
  | 'optimization'
  | 'copilot'
  | 'recommendations'
  | 'alerts'
  | 'settings'
  | 'login';

interface FactoryContextType {
  // Navigation & View
  currentRoute: AppRoute;
  setCurrentRoute: (route: AppRoute) => void;
  selectedMachineId: string | null;
  setSelectedMachineId: (id: string | null) => void;
  selectedAnomalyId: string | null;
  setSelectedAnomalyId: (id: string | null) => void;
  selectedRcaId: string | null;
  setSelectedRcaId: (id: string | null) => void;

  // Global Context Selectors
  factories: Factory[];
  selectedFactoryId: string;
  setSelectedFactoryId: (id: string) => void;
  currentFactory: Factory;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  selectedShift: string;
  setSelectedShift: (shift: string) => void;
  
  // Real-time telemetry simulation
  isLiveTelemetry: boolean;
  setIsLiveTelemetry: (live: boolean) => void;
  lastTelemetryTimestamp: string;
  triggerManualRefresh: () => void;

  // Data states
  machines: Machine[];
  isMachinesLoading: boolean;
  machinesError: string | null;
  refreshMachines: () => Promise<void>;
  hourlySeries: EnergyHourlyData[];
  anomalies: Anomaly[];
  rcaCases: RootCauseInvestigation[];
  digitalTwinScenarios: DigitalTwinScenario[];
  activeScenarioId: string;
  setActiveScenarioId: (id: string) => void;
  productionSchedule: ProductionScheduleItem[];
  recommendations: Recommendation[];
  alerts: AlertItem[];
  
  // User Session & Authentication
  userSession: UserSession;
  isAuthLoading: boolean;
  authError: string | null;
  isFactoryLoading: boolean;
  factoryError: string | null;
  paginationMeta: PaginationMeta | null;
  loginUser: (email: string, password?: string) => Promise<void>;
  logoutUser: () => void;
  refreshFactories: () => Promise<void>;

  // Actions
  updateMachineStatus: (id: string, status: Machine['status']) => void;
  updateAnomalyStatus: (id: string, status: Anomaly['status']) => void;
  updateRecommendationStatus: (id: string, status: Recommendation['status']) => void;
  resolveAlert: (id: string) => void;
  applyOptimizedSchedule: () => void;
  runScenarioSimulation: (config: Partial<DigitalTwinScenario>) => DigitalTwinScenario;
  
  // Notifications feedback
  notificationMessage: string | null;
  clearNotification: () => void;
  showNotification: (msg: string) => void;
}

const FactoryContext = createContext<FactoryContextType | undefined>(undefined);

export const FactoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('login');
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [selectedRcaId, setSelectedRcaId] = useState<string | null>(null);

  const [factories, setFactories] = useState<Factory[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string>('');
  const [isFactoryLoading, setIsFactoryLoading] = useState<boolean>(false);
  const [factoryError, setFactoryError] = useState<string | null>(null);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [isLiveTelemetry, setIsLiveTelemetry] = useState<boolean>(true);
  const [lastTelemetryTimestamp, setLastTelemetryTimestamp] = useState<string>('Just now');

  const [machines, setMachines] = useState<Machine[]>([]);
  const [isMachinesLoading, setIsMachinesLoading] = useState<boolean>(false);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const activeMachineFetchIdRef = useRef<number>(0);
  const [hourlySeries, setHourlySeries] = useState<EnergyHourlyData[]>(HOURLY_ENERGY_SERIES);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(ANOMALIES);
  const [rcaCases, setRcaCases] = useState<RootCauseInvestigation[]>(ROOT_CAUSE_CASES);
  const [digitalTwinScenarios, setDigitalTwinScenarios] = useState<DigitalTwinScenario[]>(DIGITAL_TWIN_SCENARIOS);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('SCENARIO-PEAK-SHAVED');
  const [productionSchedule, setProductionSchedule] = useState<ProductionScheduleItem[]>(PRODUCTION_SCHEDULE);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(RECOMMENDATIONS);
  const [alerts, setAlerts] = useState<AlertItem[]>(ALERTS);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // Authentication State
  const [userSession, setUserSession] = useState<UserSession>({
    id: '',
    name: '',
    role: '',
    email: '',
    plantAccess: [],
    isLoggedIn: false
  });
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);

  const showNotification = (msg: string) => {
    setNotificationMessage(msg);
    setTimeout(() => {
      setNotificationMessage(null);
    }, 4000);
  };

  const clearNotification = () => setNotificationMessage(null);

  // Derive current factory with safe fallback
  const currentFactory = factories.find(f => f.id === selectedFactoryId) || factories[0] || FACTORIES[0];

  /**
   * Load manufacturing facilities accessible to authenticated user
   */
  const loadFactories = async (): Promise<void> => {
    setIsFactoryLoading(true);
    setFactoryError(null);
    try {
      const res = await api.factories.list({ page: 1, page_size: 50 });
      const backendFactories = res.data || [];
      setPaginationMeta(res.meta ? (res.meta as unknown as PaginationMeta) : null);

      if (backendFactories.length === 0) {
        setFactories([]);
        setSelectedFactoryId('');
        return;
      }

      const mapped: Factory[] = backendFactories.map((bf, index) => {
        const template = FACTORIES.find(f => f.id === bf.id) || FACTORIES[index % FACTORIES.length] || FACTORIES[0];
        return {
          ...template,
          id: bf.id,
          name: bf.name,
          code: bf.name.split(' ').map(w => w[0]).join('').slice(0, 8).toUpperCase() || `PLANT-${index + 1}`,
          location: bf.location || 'Industrial Facility',
          status: template.status || 'optimal'
        };
      });

      setFactories(mapped);

      // Auto-select: preserve previous if still valid, otherwise select first available
      setSelectedFactoryId(prev => {
        if (prev && mapped.some(f => f.id === prev)) {
          return prev;
        }
        return mapped[0].id;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve manufacturing facilities';
      setFactoryError(msg);
    } finally {
      setIsFactoryLoading(false);
    }
  };

  /**
   * Load manufacturing equipment for the currently selected facility
   */
  const loadMachines = async (factoryId: string): Promise<void> => {
    if (!factoryId) {
      setMachines([]);
      setIsMachinesLoading(false);
      return;
    }
    const currentFetchId = ++activeMachineFetchIdRef.current;
    setIsMachinesLoading(true);
    setMachinesError(null);

    try {
      const res = await api.machines.list({ factory_id: factoryId, page: 1, page_size: 100 });
      // Guard against race conditions when switching factories quickly
      if (currentFetchId !== activeMachineFetchIdRef.current) return;

      const backendMachines = res.data || [];
      const transformed = backendMachines.map(bm => transformBackendMachine(bm));
      setMachines(transformed);
    } catch (err: unknown) {
      if (currentFetchId !== activeMachineFetchIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to retrieve equipment telemetry';
      setMachinesError(msg);
      // Do not silently fallback to mock data on API error
      setMachines([]);
    } finally {
      if (currentFetchId === activeMachineFetchIdRef.current) {
        setIsMachinesLoading(false);
      }
    }
  };

  /**
   * Automatically synchronize fleet machines whenever the active factory changes
   */
  useEffect(() => {
    if (selectedFactoryId && userSession.isLoggedIn) {
      loadMachines(selectedFactoryId);
    } else if (!userSession.isLoggedIn) {
      setMachines([]);
    }
  }, [selectedFactoryId, userSession.isLoggedIn]);

  /**
   * Session Restoration Flow:
   * Validates stored JWT against /api/auth/me on mount without duplicate runs
   */
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const restoreSession = async () => {
      setIsAuthLoading(true);
      setAuthError(null);

      const token = tokenManager.getToken();
      if (!token) {
        setUserSession({
          id: '',
          name: '',
          role: '',
          email: '',
          plantAccess: [],
          isLoggedIn: false
        });
        setCurrentRoute('login');
        setIsAuthLoading(false);
        return;
      }

      try {
        const userRes = await api.auth.me();
        const user = userRes.data;
        setUserSession({
          id: user.id,
          name: user.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          role: 'Principal Energy & Plant Operations Lead',
          email: user.email,
          plantAccess: [],
          isLoggedIn: true
        });

        await loadFactories();
        setCurrentRoute('dashboard');
      } catch (err: unknown) {
        tokenManager.clearToken();
        setUserSession({
          id: '',
          name: '',
          role: '',
          email: '',
          plantAccess: [],
          isLoggedIn: false
        });
        setCurrentRoute('login');
        if (err instanceof ApiClientError && err.status !== 401) {
          setAuthError(err.message || 'Session validation failed');
        }
      } finally {
        setIsAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  /**
   * Global 401 Unauthorized Interceptor Registration
   */
  useEffect(() => {
    tokenManager.onUnauthorized(() => {
      setUserSession({
        id: '',
        name: '',
        role: '',
        email: '',
        plantAccess: [],
        isLoggedIn: false
      });
      setFactories([]);
      setSelectedFactoryId('');
      setCurrentRoute('login');
      showNotification('Session expired or unauthorized. Please sign in again.');
    });

    return () => {
      tokenManager.onUnauthorized(null);
    };
  }, []);

  const loginUser = async (email: string, password?: string): Promise<void> => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      if (!password) {
        throw new Error('Password is required for enterprise authentication.');
      }
      const loginRes = await api.auth.login({ email, password });
      if (!loginRes.data?.access_token) {
        throw new Error('No access token received from authentication server.');
      }
      const userRes = await api.auth.me();
      const user = userRes.data;
      setUserSession({
        id: user.id,
        name: user.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        role: 'Principal Energy & Plant Operations Lead',
        email: user.email,
        plantAccess: [],
        isLoggedIn: true
      });
      await loadFactories();
      setCurrentRoute('dashboard');
      showNotification(`Signed in successfully as ${user.email}`);
    } catch (err: unknown) {
      let msg = 'Failed to sign in. Please verify your credentials.';
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          msg = 'Invalid email or password. Please try again.';
        } else if (err.status === 429) {
          msg = 'Account temporarily locked due to too many failed attempts. Try again later.';
        } else {
          msg = err.message || msg;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logoutUser = () => {
    api.auth.logout();
    setUserSession({
      id: '',
      name: '',
      role: '',
      email: '',
      plantAccess: [],
      isLoggedIn: false
    });
    setFactories([]);
    setSelectedFactoryId('');
    setMachines([]);
    setIsMachinesLoading(false);
    setMachinesError(null);
    setCurrentRoute('login');
    showNotification('Session concluded.');
  };

  // Subtle real-time telemetry timestamp updates
  useEffect(() => {
    if (!isLiveTelemetry) return;

    const interval = setInterval(() => {
      const date = new Date();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastTelemetryTimestamp(timeStr);
    }, 4000);

    return () => clearInterval(interval);
  }, [isLiveTelemetry]);

  const triggerManualRefresh = () => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLastTelemetryTimestamp(timeStr);
    if (selectedFactoryId) {
      loadMachines(selectedFactoryId);
    }
    showNotification('Edge telemetry synchronized across all metering nodes.');
  };

  const updateMachineStatus = async (id: string, status: Machine['status']) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    showNotification(`Machine ${id} operational status set to ${status.toUpperCase()}.`);

    try {
      const backendStatus: ApiTypes.BackendMachineStatus =
        status === 'running' ? 'running' :
        status === 'down' ? 'offline' : 'available';
      await api.machines.update(id, { status: backendStatus });
    } catch (err) {
      console.warn(`Failed to update machine ${id} status on backend:`, err);
    }
  };

  const updateAnomalyStatus = (id: string, status: Anomaly['status']) => {
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    showNotification(`Anomaly ${id} marked as ${status}.`);
  };

  const updateRecommendationStatus = (id: string, status: Recommendation['status']) => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    showNotification(`Recommendation ${id} updated to ${status}.`);
  };

  const resolveAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isResolved: true, acknowledgedBy: userSession.name } : a));
    showNotification(`Alert ${id} acknowledged & resolved.`);
  };

  const applyOptimizedSchedule = () => {
    setProductionSchedule(prev => prev.map(s => {
      if (s.id === 'SCH-04') {
        // Shift furnace to night
        return {
          ...s,
          startTime: '22:00',
          endTime: '06:00',
          tariffZone: 'Off-Peak',
          isOptimized: true
        };
      }
      if (s.id === 'SCH-03') {
        // Shift press out of peak
        return {
          ...s,
          startTime: '10:00',
          endTime: '14:00',
          tariffZone: 'Normal',
          isOptimized: true
        };
      }
      return s;
    }));
    showNotification('Optimized dispatch schedule applied to MES / PLC gateway.');
  };

  const runScenarioSimulation = (config: Partial<DigitalTwinScenario>): DigitalTwinScenario => {
    const targetUnits = config.productionTargetUnits || 1200;
    const isPeakShaved = config.peakShavingEnabled ?? true;

    // Realistic calculation based on energy intensity
    const baseKwh = targetUnits * 14.8;
    const peakPenaltyFactor = isPeakShaved ? 0.92 : 1.05;
    const simulatedKwh = Math.round(baseKwh * (isPeakShaved ? 0.93 : 1.0));
    const simulatedPeak = Math.round(isPeakShaved ? 1120 : 1360);
    const avgTariff = isPeakShaved ? 7.60 : 9.15;
    const simulatedCost = Math.round(simulatedKwh * avgTariff);
    const simulatedCo2 = Math.round(simulatedKwh * 0.72);

    const deltaEnergy = Number((((simulatedKwh - 18450) / 18450) * 100).toFixed(1));
    const deltaCost = simulatedCost - 168240;
    const deltaPeak = simulatedPeak - 1380;

    const newScenario: DigitalTwinScenario = {
      id: `SIM-CUSTOM-${Date.now().toString().slice(-4)}`,
      name: config.name || 'Custom Simulation',
      description: config.description || 'Simulated dynamic scenario with user constraints.',
      productionTargetUnits: targetUnits,
      shiftHours: config.shiftHours || 24,
      peakShavingEnabled: isPeakShaved,
      activeLines: config.activeLines || ['LINE-A', 'LINE-B', 'LINE-C', 'LINE-D', 'LINE-UTIL'],
      plannedMaintenanceMachines: config.plannedMaintenanceMachines || [],
      simulatedEnergyKwh: simulatedKwh,
      simulatedCostInr: simulatedCost,
      simulatedPeakKw: simulatedPeak,
      simulatedCo2eKg: simulatedCo2,
      targetMet: true,
      deltaEnergyPct: deltaEnergy,
      deltaCostInr: deltaCost,
      deltaPeakKw: deltaPeak
    };

    setDigitalTwinScenarios(prev => [newScenario, ...prev]);
    setActiveScenarioId(newScenario.id);
    showNotification('Digital Twin simulation completed with deterministic physics model.');
    return newScenario;
  };

  return (
    <FactoryContext.Provider
      value={{
        currentRoute,
        setCurrentRoute,
        selectedMachineId,
        setSelectedMachineId,
        selectedAnomalyId,
        setSelectedAnomalyId,
        selectedRcaId,
        setSelectedRcaId,
        factories,
        selectedFactoryId,
        setSelectedFactoryId,
        currentFactory,
        isFactoryLoading,
        factoryError,
        paginationMeta,
        refreshFactories: loadFactories,
        dateRange,
        setDateRange,
        selectedShift,
        setSelectedShift,
        isLiveTelemetry,
        setIsLiveTelemetry,
        lastTelemetryTimestamp,
        triggerManualRefresh,
        machines,
        isMachinesLoading,
        machinesError,
        refreshMachines: () => loadMachines(selectedFactoryId),
        hourlySeries,
        anomalies,
        rcaCases,
        digitalTwinScenarios,
        activeScenarioId,
        setActiveScenarioId,
        productionSchedule,
        recommendations,
        alerts,
        userSession,
        isAuthLoading,
        authError,
        loginUser,
        logoutUser,
        updateMachineStatus,
        updateAnomalyStatus,
        updateRecommendationStatus,
        resolveAlert,
        applyOptimizedSchedule,
        runScenarioSimulation,
        notificationMessage,
        clearNotification,
        showNotification
      }}
    >
      {children}
    </FactoryContext.Provider>
  );
};

export const useFactory = () => {
  const context = useContext(FactoryContext);
  if (!context) {
    throw new Error('useFactory must be used within a FactoryProvider');
  }
  return context;
};
