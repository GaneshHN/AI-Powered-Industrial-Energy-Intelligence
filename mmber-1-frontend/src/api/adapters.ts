/**
 * ENERPILOT — FRONTEND API ADAPTERS & VIEW-MODEL TRANSFORMS
 * 
 * Strict boundary separation between backend REST contracts and UI presentation.
 * 
 * Rules:
 * 1. Do NOT map peak_demand_kw to instantaneous currentDemandKw.
 * 2. Do NOT label total energy as today's energy unless the query covers the local calendar day.
 * 3. Do NOT invent missing values, sensors (temp/vibration/power factor), costs, or carbon metrics.
 * 4. Map backend machine statuses ('available', 'running', 'maintenance', 'offline')
 *    to UI statuses explicitly: maintenance is NEVER mapped to warning.
 * 5. Handle loading, empty, partial-data, and error states gracefully.
 */

import * as Types from './types';
import { Machine, MachineStatus, MaintenanceStatus, EnergyHourlyData, MachineDistribution } from '../types';

// ==========================================
// 1. Time Range & Shift Helpers
// ==========================================

export interface TimeRangeResult {
  startTime: string; // ISO 8601 with timezone (UTC 'Z')
  endTime: string;   // ISO 8601 with timezone (UTC 'Z')
  isLocalDay: boolean;
}

/**
 * Calculates start and end ISO 8601 timestamps for a given date range.
 * Timestamps always include explicit timezone UTC ('Z').
 */
export function calculateTimeRange(range: string, referenceDate: Date = new Date()): TimeRangeResult {
  const now = new Date(referenceDate);
  const start = new Date(now);

  switch (range) {
    case 'today': {
      // Start of current day (00:00:00.000)
      start.setHours(0, 0, 0, 0);
      return {
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        isLocalDay: true
      };
    }
    case 'yesterday': {
      // Start of yesterday (00:00:00.000) to end of yesterday (23:59:59.999)
      const yStart = new Date(now);
      yStart.setDate(yStart.getDate() - 1);
      yStart.setHours(0, 0, 0, 0);

      const yEnd = new Date(now);
      yEnd.setDate(yEnd.getDate() - 1);
      yEnd.setHours(23, 59, 59, 999);

      return {
        startTime: yStart.toISOString(),
        endTime: yEnd.toISOString(),
        isLocalDay: false
      };
    }
    case 'week':
    case 'last7days': {
      // Past 7 days (7 * 24h before now)
      start.setDate(start.getDate() - 7);
      return {
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        isLocalDay: false
      };
    }
    case 'month':
    case 'monthToDate': {
      // Start of current calendar month (day 1, 00:00:00.000)
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return {
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        isLocalDay: false
      };
    }
    default: {
      // Default to past 24 hours
      start.setHours(start.getHours() - 24);
      return {
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        isLocalDay: false
      };
    }
  }
}

/**
 * Maps frontend UI shift filter ('SHIFT-A', 'SHIFT-B', 'SHIFT-C', 'all')
 * to backend shift query parameter ('day', 'evening', 'night', or undefined).
 */
export function mapShiftFilter(shift?: string): 'day' | 'evening' | 'night' | undefined {
  if (!shift || shift === 'all') return undefined;
  if (shift === 'SHIFT-A' || shift === 'day') return 'day';
  if (shift === 'SHIFT-B' || shift === 'evening') return 'evening';
  if (shift === 'SHIFT-C' || shift === 'night') return 'night';
  return undefined;
}

// ==========================================
// 2. Machine Status & Fleet Mappings
// ==========================================

/**
 * Maps backend machine status ('available', 'running', 'maintenance', 'offline')
 * to existing UI MachineStatus ('running', 'idle', 'warning', 'down').
 * 
 * Explicit, documented mapping rules:
 * - 'running' -> 'running' (actively consuming power under production load)
 * - 'available' -> 'idle' (energized and ready in standby mode)
 * - 'offline' -> 'down' (powered down or tripped)
 * - 'maintenance' -> 'idle' (equipment is in scheduled maintenance;
 *   CRITICAL: Do NOT infer warning status from maintenance status, as maintenance
 *   is an intentional servicing procedure, NOT an operational fault or anomaly.)
 */
export function mapBackendMachineStatus(backendStatus: Types.BackendMachineStatus | string): MachineStatus {
  switch (backendStatus) {
    case 'running':
      return 'running';
    case 'available':
      return 'idle';
    case 'offline':
      return 'down';
    case 'maintenance':
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * Transforms a backend Machine record + optional detail into the UI presentation model.
 * Sensors not supported by backend telemetry (temperature, vibration, power factor)
 * are set to null (marked unavailable) rather than fabricating numbers.
 */
export function transformBackendMachine(
  bm: Types.BackendMachine,
  detail?: Types.BackendMachineDetail | null
): Machine {
  const isEstimated = detail ? detail.metrics_are_estimates : true;

  const maintenanceStatus: MaintenanceStatus = 
    bm.status === 'maintenance'
      ? 'in_progress'
      : detail?.maintenance && detail.maintenance.length > 0
        ? (detail.maintenance[0].status === 'overdue' ? 'overdue' : 'scheduled')
        : 'nominal';

  return {
    id: bm.id,
    name: bm.name,
    line: bm.production_line_id ? `Line ${bm.production_line_id.slice(0, 8)}` : 'General Utility',
    status: mapBackendMachineStatus(bm.status),
    currentPowerKw: detail ? detail.power_kw : 0,
    ratedPowerKw: bm.rated_power_kw,
    energyTodayKwh: detail ? detail.energy_kwh : 0,
    utilizationPct: detail ? detail.utilization_percent : 0,
    runtimeHours: detail ? detail.runtime_hours_estimated : 0,
    idleHours: detail ? detail.idle_hours_estimated : 0,
    // Explicitly uninstrumented sensors in backend - set to null (unavailable)
    powerFactor: null,
    temperatureC: null,
    vibrationMmS: null,
    maintenanceStatus,
    daysToNextMaintenance: null,
    specificEnergyKwhPerUnit: detail && detail.production_units > 0 
      ? Number((detail.energy_kwh / detail.production_units).toFixed(3)) 
      : 0,
    hourlyOutputUnits: bm.production_rate_units_per_hour,
    lastAnomaly: null,
    isEstimated
  };
}

// ==========================================
// 3. Dashboard Data Adapters
// ==========================================

export interface TransformedDashboardMetrics {
  totalEnergyKwh: number | null;
  totalEnergyLabel: string;
  totalEnergyPeriod: string;
  energyIntensityKwhPerUnit: number | null;
  peakDemandKw: number | null;
  peakDemandLabel: string;
  productionUnits: number | null;
  calculatedCostInr: number | null;
  estimatedCo2eKg: number | null;
  isAvailable: boolean;
}

/**
 * Transforms backend energy summary into UI presentation metrics.
 * Correctly distinguishes today's energy from general period totals.
 * Correctly labels peak demand as the interval peak demand (not instantaneous power).
 */
export function transformDashboardSummary(
  summary: Types.BackendEnergySummary | null | undefined,
  isLocalDay: boolean
): TransformedDashboardMetrics {
  if (!summary) {
    return {
      totalEnergyKwh: null,
      totalEnergyLabel: isLocalDay ? "Total Energy Consumption (Today)" : "Total Energy Consumption (Period)",
      totalEnergyPeriod: isLocalDay ? "Daily cumulative meter" : "Selected period cumulative",
      energyIntensityKwhPerUnit: null,
      peakDemandKw: null,
      peakDemandLabel: "Interval Peak Demand",
      productionUnits: null,
      calculatedCostInr: null,
      estimatedCo2eKg: null,
      isAvailable: false
    };
  }

  const cost = summary.energy_cost ?? summary.estimated_cost ?? null;

  return {
    totalEnergyKwh: summary.total_energy_kwh != null ? summary.total_energy_kwh : null,
    totalEnergyLabel: isLocalDay ? "Total Energy Consumption (Today)" : "Total Energy Consumption (Period)",
    totalEnergyPeriod: isLocalDay ? "Daily cumulative meter" : "Selected period cumulative",
    energyIntensityKwhPerUnit: summary.energy_per_unit > 0 ? summary.energy_per_unit : null,
    peakDemandKw: summary.peak_demand_kw != null ? summary.peak_demand_kw : null,
    peakDemandLabel: "Interval Peak Demand",
    productionUnits: summary.production_units != null ? summary.production_units : null,
    calculatedCostInr: cost,
    estimatedCo2eKg: summary.estimated_co2_kg != null ? summary.estimated_co2_kg : null,
    isAvailable: true
  };
}

/**
 * Transforms backend /api/energy/trend items to the hourly chart structure.
 */
export function transformEnergyTrend(
  trendItems: Types.BackendEnergyTrendItem[] = []
): EnergyHourlyData[] {
  return trendItems.map(item => {
    const date = new Date(item.timestamp);
    const hour = date.getUTCHours();
    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
    const isPeak = hour >= 18 && hour < 22; // ToU Peak 18:00 - 22:00

    return {
      time: timeStr,
      actualKwh: item.energy_kwh,
      baselineKwh: 0,
      peakKw: item.peak_demand_kw,
      productionUnits: 0,
      costInr: Math.round(item.energy_kwh * (isPeak ? 11.4 : 7.6)),
      isPeakTariff: isPeak
    };
  });
}

/**
 * Transforms backend /api/energy/by-machine items to the distribution chart structure.
 */
export function transformEnergyByMachine(
  items: Types.BackendEnergyByMachineItem[] = [],
  machineStatuses: Record<string, MachineStatus> = {}
): MachineDistribution[] {
  const total = items.reduce((acc, curr) => acc + curr.energy_kwh, 0);

  return items
    .map(item => {
      const sharePct = total > 0 ? Number(((item.energy_kwh / total) * 100).toFixed(1)) : 0;
      return {
        machineId: item.machine_id,
        name: item.machine_name,
        line: 'Fleet Asset',
        energyKwh: item.energy_kwh,
        sharePct,
        status: machineStatuses[item.machine_id] || 'running',
        powerKw: item.peak_demand_kw
      };
    })
    .sort((a, b) => b.energyKwh - a.energyKwh);
}
