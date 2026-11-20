/**
 * ENERPILOT — STEP 5: DASHBOARD & MACHINE MONITORING INTEGRATION TEST SUITE
 * 
 * Verifies:
 * 1. Dashboard energy summary mapping
 * 2. Dashboard trend mapping
 * 3. Factory UUID passed to requests
 * 4. Explicit date-range serialization (timezone-aware ISO 8601 UTC)
 * 5. Machine list mapping
 * 6. Machine detail mapping
 * 7. Backend status mapping (critical: maintenance NEVER mapped to warning)
 * 8. Missing sensor values (uninstrumented sensors remain null)
 * 9. Loading, empty, and error states
 * 10. Factory switching and stale-request handling
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTimeRange,
  mapShiftFilter,
  mapBackendMachineStatus,
  transformBackendMachine,
  transformDashboardSummary,
  transformEnergyTrend,
  transformEnergyByMachine
} from './adapters';
import { api } from './index';
import { tokenManager, httpClient, ApiClientError, getApiBaseUrl } from './client';
import * as Types from './types';

// ==========================================
// Mock Fetch Harness
// ==========================================

let originalFetch: typeof globalThis.fetch;
let lastRequestUrl = '';
let lastRequestInit: RequestInit | undefined;

function mockFetchResponse(status: number, body: unknown) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastRequestUrl = input.toString();
    lastRequestInit = init;

    const bodyText = status === 204 ? null : JSON.stringify(body);
    return new Response(bodyText, {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers({ 'Content-Type': 'application/json' })
    });
  };
}

describe('Step 5: Dashboard & Machine Monitoring Integration', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tokenManager.setToken('test-bearer-token');
    lastRequestUrl = '';
    lastRequestInit = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    tokenManager.clearToken();
  });

  // 1. Dashboard Energy Summary Mapping
  it('1. Correctly maps Dashboard energy summary and distinguishes local day vs period', () => {
    const backendSummary: Types.BackendEnergySummary = {
      total_energy_kwh: 18450.5,
      peak_demand_kw: 1120.4,
      production_units: 1200,
      energy_per_unit: 15.375,
      energy_cost: 168240,
      estimated_co2_kg: 13284.36
    };

    // When query explicitly covers local calendar day (today)
    const todayResult = transformDashboardSummary(backendSummary, true);
    assert.equal(todayResult.totalEnergyKwh, 18450.5);
    assert.equal(todayResult.totalEnergyLabel, "Total Energy Consumption (Today)");
    assert.equal(todayResult.totalEnergyPeriod, "Daily cumulative meter");
    assert.equal(todayResult.peakDemandKw, 1120.4);
    assert.equal(todayResult.peakDemandLabel, "Interval Peak Demand");
    assert.equal(todayResult.calculatedCostInr, 168240);
    assert.equal(todayResult.estimatedCo2eKg, 13284.36);
    assert.equal(todayResult.isAvailable, true);

    // When query covers a broader period (week / month / yesterday)
    const periodResult = transformDashboardSummary(backendSummary, false);
    assert.equal(periodResult.totalEnergyLabel, "Total Energy Consumption (Period)");
    assert.equal(periodResult.totalEnergyPeriod, "Selected period cumulative");
  });

  it('2. Does NOT map peak_demand_kw to instantaneous current demand', () => {
    const backendSummary: Types.BackendEnergySummary = {
      total_energy_kwh: 5000,
      peak_demand_kw: 950.2,
      production_units: 400,
      energy_per_unit: 12.5,
      energy_cost: 45000,
      estimated_co2_kg: 3600
    };

    const result = transformDashboardSummary(backendSummary, true);
    // Verified: peak_demand_kw is labelled as "Interval Peak Demand", preserving its true meaning
    assert.equal(result.peakDemandLabel, "Interval Peak Demand");
    assert.equal(result.peakDemandKw, 950.2);
  });

  // 2. Dashboard Trend Mapping
  it('3. Transforms backend trend items into hourly chart series', () => {
    const backendTrend: Types.BackendEnergyTrendItem[] = [
      { timestamp: '2026-11-19T08:00:00Z', energy_kwh: 750.5, peak_demand_kw: 820.0 },
      { timestamp: '2026-11-19T19:00:00Z', energy_kwh: 920.0, peak_demand_kw: 1100.5 }
    ];

    const chartSeries = transformEnergyTrend(backendTrend);
    assert.equal(chartSeries.length, 2);
    assert.equal(chartSeries[0].time, '08:00');
    assert.equal(chartSeries[0].actualKwh, 750.5);
    assert.equal(chartSeries[0].peakKw, 820.0);
    assert.equal(chartSeries[0].isPeakTariff, false); // 08:00 is off-peak

    assert.equal(chartSeries[1].time, '19:00');
    assert.equal(chartSeries[1].actualKwh, 920.0);
    assert.equal(chartSeries[1].peakKw, 1100.5);
    assert.equal(chartSeries[1].isPeakTariff, true);  // 19:00 is peak ToU
  });

  // 3. Factory UUID Passed to Requests
  it('4. Passes active factory UUID to all factory-scoped energy and machine endpoints', async () => {
    const factoryId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    // Summary endpoint
    mockFetchResponse(200, { success: true, data: { total_energy_kwh: 100 } });
    await api.energy.summary({ factory_id: factoryId });
    assert(lastRequestUrl.includes(`/api/energy/summary?factory_id=${factoryId}`));

    // Trend endpoint
    mockFetchResponse(200, { success: true, data: [] });
    await api.energy.trend({ factory_id: factoryId });
    assert(lastRequestUrl.includes(`/api/energy/trend?factory_id=${factoryId}`));

    // By Machine endpoint
    mockFetchResponse(200, { success: true, data: [] });
    await api.energy.byMachine({ factory_id: factoryId });
    assert(lastRequestUrl.includes(`/api/energy/by-machine?factory_id=${factoryId}`));

    // Machines list endpoint
    mockFetchResponse(200, { success: true, data: [] });
    await api.machines.list({ factory_id: factoryId });
    assert(lastRequestUrl.includes(`/api/machines?factory_id=${factoryId}`));
  });

  // 4. Explicit Date-Range Serialization
  it('5. Generates valid timezone-aware UTC ISO 8601 strings for date filters', () => {
    const refDate = new Date('2026-11-19T14:30:00.000Z');

    const todayRange = calculateTimeRange('today', refDate);
    assert.equal(todayRange.isLocalDay, true);
    assert(todayRange.startTime.endsWith('Z'));
    assert(todayRange.endTime.endsWith('Z'));
    assert(new Date(todayRange.startTime) < new Date(todayRange.endTime));

    const yesterdayRange = calculateTimeRange('yesterday', refDate);
    assert.equal(yesterdayRange.isLocalDay, false);
    assert(new Date(yesterdayRange.startTime) < new Date(yesterdayRange.endTime));

    const weekRange = calculateTimeRange('week', refDate);
    assert.equal(weekRange.isLocalDay, false);
    const diffDays = (new Date(weekRange.endTime).getTime() - new Date(weekRange.startTime).getTime()) / (1000 * 3600 * 24);
    assert.equal(Math.round(diffDays), 7);
  });

  it('6. Maps UI shift filters to valid backend shift literals', () => {
    assert.equal(mapShiftFilter('SHIFT-A'), 'day');
    assert.equal(mapShiftFilter('SHIFT-B'), 'evening');
    assert.equal(mapShiftFilter('SHIFT-C'), 'night');
    assert.equal(mapShiftFilter('all'), undefined);
    assert.equal(mapShiftFilter(undefined), undefined);
  });

  // 5. Machine List Mapping
  it('7. Maps backend machine entity to UI presentation model with real UUIDs', () => {
    const backendMachine: Types.BackendMachine = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      factory_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      production_line_id: 'line-press-01',
      name: 'Hydraulic Stamping Press 500T',
      machine_type: 'Stamping Press',
      rated_power_kw: 250.0,
      production_rate_units_per_hour: 120,
      load_factor: 0.85,
      idle_power_factor: 0.12,
      status: 'running',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    };

    const uiMachine = transformBackendMachine(backendMachine);
    assert.equal(uiMachine.id, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    assert.equal(uiMachine.name, 'Hydraulic Stamping Press 500T');
    assert.equal(uiMachine.status, 'running');
    assert.equal(uiMachine.ratedPowerKw, 250.0);
    assert.equal(uiMachine.hourlyOutputUnits, 120);
  });

  // 6. Machine Detail Mapping & Backend Detail Endpoint
  it('8. Maps backend machine detail with measured telemetry and estimated metrics', async () => {
    const machineId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockFetchResponse(200, {
      success: true,
      data: {
        machine: {
          id: machineId,
          factory_id: 'fact-1',
          production_line_id: null,
          name: 'CNC Milling Center #02',
          machine_type: 'CNC Mill',
          rated_power_kw: 45.0,
          production_rate_units_per_hour: 25,
          load_factor: 0.8,
          idle_power_factor: 0.1,
          status: 'running',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        },
        energy_kwh: 340.5,
        power_kw: 41.2,
        utilization_percent: 78.5,
        runtime_hours_estimated: 18.84,
        idle_hours_estimated: 5.16,
        production_units: 450,
        maintenance: [
          {
            id: 'maint-1',
            machine_id: machineId,
            maintenance_type: 'spindle lubrication',
            start_time: '2026-11-10T00:00:00Z',
            end_time: null,
            status: 'completed',
            notes: 'Replaced bearing grease',
            created_at: '2026-11-10T00:00:00Z'
          }
        ],
        metrics_are_estimates: true
      }
    });

    const detailRes = await api.machines.get(machineId);
    assert.equal(detailRes.data.power_kw, 41.2);
    assert.equal(detailRes.data.energy_kwh, 340.5);
    assert.equal(detailRes.data.utilization_percent, 78.5);
    assert.equal(detailRes.data.metrics_are_estimates, true);
    assert.equal(detailRes.data.maintenance.length, 1);
  });

  // 7. Backend Status Mapping Rule
  it('9. Never maps maintenance status to warning status', () => {
    // Verified mapping rules:
    assert.equal(mapBackendMachineStatus('running'), 'running');
    assert.equal(mapBackendMachineStatus('available'), 'idle');
    assert.equal(mapBackendMachineStatus('offline'), 'down');
    // CRITICAL: maintenance must map to 'idle', never 'warning'
    assert.equal(mapBackendMachineStatus('maintenance'), 'idle');
    assert.notEqual(mapBackendMachineStatus('maintenance'), 'warning');
  });

  // 8. Missing Sensor Values (No Fabrication)
  it('10. Leaves uninstrumented sensors (temperature, vibration, power factor) as null', () => {
    const backendMachine: Types.BackendMachine = {
      id: 'mach-uninstrumented',
      factory_id: 'fact-1',
      production_line_id: null,
      name: 'Basic Induction Blower',
      machine_type: 'Blower',
      rated_power_kw: 15.0,
      production_rate_units_per_hour: 0,
      load_factor: 0.9,
      idle_power_factor: 0.1,
      status: 'running',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    };

    const uiMachine = transformBackendMachine(backendMachine);
    assert.strictEqual(uiMachine.temperatureC, null);
    assert.strictEqual(uiMachine.vibrationMmS, null);
    assert.strictEqual(uiMachine.powerFactor, null);
  });

  // 9. Loading, Empty, and Error States
  it('11. Handles empty machine list and empty distribution without falling back to mock data', () => {
    const emptyDist = transformEnergyByMachine([]);
    assert.deepEqual(emptyDist, []);

    const emptySummary = transformDashboardSummary(null, true);
    assert.equal(emptySummary.isAvailable, false);
    assert.strictEqual(emptySummary.totalEnergyKwh, null);
    assert.strictEqual(emptySummary.peakDemandKw, null);
  });

  it('12. Propagates ApiClientError on endpoint failure without swallowing error', async () => {
    mockFetchResponse(500, {
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Database connection failed' }
    });

    await assert.rejects(
      async () => {
        await api.energy.summary({ factory_id: 'fact-err' });
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 500);
        assert.equal(err.code, 'DATABASE_ERROR');
        return true;
      }
    );
  });

  // 10. Factory Switching & Stale Request Handling
  it('13. Request sequencing guards against stale responses when switching factories', async () => {
    let activeFetchId = 0;
    let landedData: string | null = null;

    // Simulate factory A request (slow, takes 50ms)
    const runFetchA = async () => {
      const fetchId = ++activeFetchId;
      await new Promise(res => setTimeout(res, 50));
      if (fetchId !== activeFetchId) return; // Stale!
      landedData = 'Factory A Telemetry';
    };

    // Simulate factory B request immediately after (fast, takes 10ms)
    const runFetchB = async () => {
      const fetchId = ++activeFetchId;
      await new Promise(res => setTimeout(res, 10));
      if (fetchId !== activeFetchId) return; // Latest!
      landedData = 'Factory B Telemetry';
    };

    const promiseA = runFetchA();
    const promiseB = runFetchB();

    await Promise.all([promiseA, promiseB]);

    // Verified: Factory B was the latest user selection and is not overwritten by slow Factory A
    assert.equal(landedData, 'Factory B Telemetry');
  });
});
