import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Gauge,
  Factory as FactoryIcon,
  Coins,
  Leaf,
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { PageHeader } from '../common/PageHeader';
import { MetricCard } from '../common/MetricCard';
import { StatusBadge } from '../common/StatusBadge';
import { EnergyTrendChart } from '../charts/EnergyTrendChart';
import { ProductionVsEnergyChart } from '../charts/ProductionVsEnergyChart';
import { MachineDistributionChart } from '../charts/MachineDistributionChart';
import { api } from '../../api';
import {
  calculateTimeRange,
  mapShiftFilter,
  transformDashboardSummary,
  transformEnergyTrend,
  transformEnergyByMachine,
  TransformedDashboardMetrics
} from '../../api/adapters';
import { EnergyHourlyData, MachineDistribution, MachineStatus } from '../../types';

export const DashboardView: React.FC = () => {
  const {
    currentFactory,
    selectedFactoryId,
    dateRange,
    selectedShift,
    machines,
    isMachinesLoading,
    machinesError,
    alerts,
    setCurrentRoute,
    setSelectedMachineId,
    setSelectedAnomalyId,
    lastTelemetryTimestamp,
    resolveAlert
  } = useFactory();

  // Dashboard Telemetry & Analytics State
  const [summaryMetrics, setSummaryMetrics] = useState<TransformedDashboardMetrics | null>(null);
  const [trendSeries, setTrendSeries] = useState<EnergyHourlyData[]>([]);
  const [byMachineDist, setByMachineDist] = useState<MachineDistribution[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState<boolean>(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const fetchIdRef = useRef<number>(0);

  const activeAlerts = alerts.filter(a => !a.isResolved);
  const runningMachines = machines.filter(m => m.status === 'running').length;
  const warningMachines = machines.filter(m => m.status === 'warning').length;
  const downMachines = machines.filter(m => m.status === 'down').length;

  /**
   * Fetch backend telemetry and analytics for the selected factory and time range
   */
  const loadDashboardAnalytics = useCallback(async () => {
    if (!selectedFactoryId) return;

    const currentFetchId = ++fetchIdRef.current;
    setIsDashboardLoading(true);
    setDashboardError(null);

    const { startTime, endTime, isLocalDay } = calculateTimeRange(dateRange);
    const shiftParam = mapShiftFilter(selectedShift);

    try {
      const [summaryRes, trendRes, byMachineRes] = await Promise.all([
        api.energy.summary({
          factory_id: selectedFactoryId,
          start_time: startTime,
          end_time: endTime,
          shift: shiftParam
        }),
        api.energy.trend({
          factory_id: selectedFactoryId,
          start_time: startTime,
          end_time: endTime
        }),
        api.energy.byMachine({
          factory_id: selectedFactoryId,
          start_time: startTime,
          end_time: endTime
        })
      ]);

      // Guard against stale responses overwriting newer user selections
      if (currentFetchId !== fetchIdRef.current) return;

      setSummaryMetrics(transformDashboardSummary(summaryRes.data, isLocalDay));
      setTrendSeries(transformEnergyTrend(trendRes.data));

      const machineStatusMap: Record<string, MachineStatus> = {};
      for (const m of machines) {
        machineStatusMap[m.id] = m.status;
      }
      setByMachineDist(transformEnergyByMachine(byMachineRes.data, machineStatusMap));
    } catch (err: unknown) {
      if (currentFetchId !== fetchIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to retrieve telemetry analytics';
      setDashboardError(msg);
      // Clean up metrics on error; do NOT silently fall back to mock data
      setSummaryMetrics(null);
      setTrendSeries([]);
      setByMachineDist([]);
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsDashboardLoading(false);
      }
    }
  }, [selectedFactoryId, dateRange, selectedShift, machines]);

  useEffect(() => {
    loadDashboardAnalytics();
  }, [loadDashboardAnalytics]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Factory Overview"
        subtitle={`${currentFactory.name} · Real-time operational intelligence and energy dispatch status`}
        metaInfo={[
          `Location: ${currentFactory.location}`,
          `Shift: ${selectedShift === 'all' ? 'All Shifts (24h)' : selectedShift}`,
          `Last Packet: ${lastTelemetryTimestamp}`,
          `System Status: ${currentFactory.status.toUpperCase()}`
        ]}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentRoute('digital-twin')}
              className="px-3 py-1.5 text-xs font-semibold text-[#14283F] bg-white border border-slate-300 hover:bg-[#EDF1F4] rounded-xs transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>Digital Twin Simulator</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCurrentRoute('copilot')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#2563A6] hover:bg-[#1E528B] rounded-xs transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>AI Energy Copilot</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      />

      {/* Error Alert Banner */}
      {dashboardError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xs flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>
              Telemetry synchronization error: <strong className="font-semibold">{dashboardError}</strong>
            </span>
          </div>
          <button
            onClick={() => loadDashboardAnalytics()}
            className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-white hover:bg-rose-100 border border-rose-300 rounded-xs transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 6 Core Industrial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label={summaryMetrics?.totalEnergyLabel || "Total Energy Consumption"}
          value={
            summaryMetrics?.totalEnergyKwh != null
              ? summaryMetrics.totalEnergyKwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="kWh"
          sublabel={summaryMetrics?.totalEnergyPeriod || (dateRange === 'today' ? "Daily cumulative meter" : "Selected period total")}
        />

        <MetricCard
          label="Energy per Unit (Intensity)"
          value={
            summaryMetrics?.energyIntensityKwhPerUnit != null
              ? summaryMetrics.energyIntensityKwhPerUnit.toFixed(2)
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="kWh / u"
          sublabel={
            summaryMetrics?.productionUnits
              ? `${summaryMetrics.productionUnits.toLocaleString()} units produced`
              : "Specific energy intensity"
          }
        />

        <MetricCard
          label="Interval Peak Demand"
          value={
            summaryMetrics?.peakDemandKw != null
              ? summaryMetrics.peakDemandKw.toFixed(1)
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="kW"
          sublabel={
            currentFactory.peakDemandLimitKw
              ? `Contract Max: ${currentFactory.peakDemandLimitKw} kW`
              : "Maximum measured interval load"
          }
        />

        <MetricCard
          label="Production Output"
          value={
            summaryMetrics?.productionUnits != null
              ? summaryMetrics.productionUnits.toLocaleString()
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="Units"
          sublabel="Logged manufacturing output"
        />

        <MetricCard
          label="Calculated Energy Cost"
          value={
            summaryMetrics?.calculatedCostInr != null
              ? `₹${(summaryMetrics.calculatedCostInr / 1000).toFixed(1)}k`
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="INR"
          sublabel="Industrial grid tariff applied"
        />

        <MetricCard
          label="Estimated CO₂ Emissions"
          value={
            summaryMetrics?.estimatedCo2eKg != null
              ? (summaryMetrics.estimatedCo2eKg / 1000).toFixed(2)
              : (isDashboardLoading ? "Loading..." : "Unavailable")
          }
          unit="t CO₂e"
          sublabel="Scope 2 grid emissions factor"
        />
      </div>

      {/* Main Analytical Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Energy Consumption Trend (2 Columns on large screens) */}
        <div className="lg:col-span-2 bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs">
          <EnergyTrendChart data={trendSeries} height={280} />
        </div>

        {/* Machine Energy Distribution (1 Column) */}
        <div className="bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs">
          <MachineDistributionChart
            data={byMachineDist}
            isLoading={isDashboardLoading}
            onSelectMachine={(mId) => {
              setSelectedMachineId(mId);
              setCurrentRoute('machines');
            }}
          />
        </div>
      </div>

      {/* Secondary Operational Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Production vs Energy Dual Axis */}
        <div className="lg:col-span-2 bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs">
          <ProductionVsEnergyChart data={trendSeries} height={260} />
        </div>

        {/* Evidence-based Operational Insights */}
        <div className="bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-[#14283F] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#2563A6]" />
                Operational Insights & Evidence
              </span>
              <span className="text-[10px] font-mono text-slate-400">ENGINEERING AUDIT</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 bg-[#F4F6F8] rounded-xs border-l-2 border-[#D99125]">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>ToU Peak Tariff Shift Opportunity</span>
                  <span className="font-mono text-[#D99125] text-[11px] font-bold">₹1.62L/mo</span>
                </div>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  Carburizing Furnace #01 is currently programmed during 18:00–22:00 peak tariff (₹11.40/kWh). Shifting thermal absorption soak to Night Shift C (₹5.60/kWh) eliminates peak surcharge without impacting dispatch.
                </p>
              </div>

              <div className="p-2.5 bg-[#F4F6F8] rounded-xs border-l-2 border-[#C94A45]">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Compressor 01 Idle Poppet Blowdown</span>
                  <span className="font-mono text-[#C94A45] text-[11px] font-bold">68.2 kW Loss</span>
                </div>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  Telemetry detected 68.2 kW continuous load during the 12:00–13:00 plant lunch period. Solenoid plunger seizure preventing mechanical standby unloader valve closure.
                </p>
              </div>

              <div className="p-2.5 bg-[#F4F6F8] rounded-xs border-l-2 border-[#24845A]">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Line A CNC Power Factor Stabilized</span>
                  <span className="font-mono text-[#24845A] text-[11px] font-bold">cos φ 0.94</span>
                </div>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  APFC capacitor bank step #2 replacement on Line A restored power factor from 0.78 to 0.94, avoiding reactive demand penalties.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setCurrentRoute('recommendations')}
            className="w-full mt-3 py-1.5 text-xs font-semibold text-[#2563A6] hover:text-[#14283F] border border-slate-200 hover:border-slate-300 rounded-xs transition-colors flex items-center justify-center gap-1"
          >
            <span>View All Engineering Recommendations</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Machine Status Overview & Operational Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Machine Status Summary Table (2 Columns) */}
        <div className="lg:col-span-2 bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#14283F]">
                Active Machine Fleet Status ({machines.length} Total)
              </span>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span className="text-emerald-700 font-semibold">{runningMachines} Running</span>
                <span>·</span>
                <span className="text-amber-700 font-semibold">{warningMachines} Warning</span>
                <span>·</span>
                <span className="text-rose-700 font-semibold">{downMachines} Down</span>
              </div>
            </div>
            <button
              onClick={() => setCurrentRoute('machines')}
              className="text-xs font-semibold text-[#2563A6] hover:underline flex items-center gap-1"
            >
              <span>Full Machine Fleet</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {isMachinesLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Loading manufacturing equipment telemetry...
            </div>
          ) : machines.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {machinesError ? `Error: ${machinesError}` : 'No equipment records found for this plant.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F6F8] text-[#687684] text-[11px] font-mono border-y border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Machine ID</th>
                    <th className="py-2 px-3 font-semibold">Equipment Name</th>
                    <th className="py-2 px-3 font-semibold">Line</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                    <th className="py-2 px-3 font-semibold text-right">Rated Power</th>
                    <th className="py-2 px-3 font-semibold text-right">Throughput</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {machines.slice(0, 6).map((machine) => (
                    <tr
                      key={machine.id}
                      onClick={() => {
                        setSelectedMachineId(machine.id);
                        setCurrentRoute('machines');
                      }}
                      className="hover:bg-[#F4F6F8] cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900 truncate max-w-[140px]" title={machine.id}>
                        {machine.id.slice(0, 8)}...
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-700 max-w-[180px] truncate">
                        {machine.name}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px] font-mono">
                        {machine.line}
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={machine.status} />
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums text-slate-900">
                        {machine.ratedPowerKw.toFixed(1)} kW
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums text-slate-600">
                        {machine.hourlyOutputUnits} u/h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Operational Alerts Card (1 Column) */}
        <div className="bg-white border border-[#EDF1F4] rounded-xs p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-[#14283F] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#C94A45]" />
                Operational Alerts ({activeAlerts.length})
              </span>
              <button
                onClick={() => setCurrentRoute('alerts')}
                className="text-xs font-semibold text-[#2563A6] hover:underline"
              >
                Alert Log
              </button>
            </div>

            <div className="space-y-2.5">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-2.5 bg-[#F4F6F8] border border-slate-200 rounded-xs text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${alert.severity === 'critical' ? 'bg-[#C94A45]' : 'bg-[#D99125]'}`} />
                      {alert.machineId}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{alert.timestamp}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-800">
                    {alert.category}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                    {alert.description}
                  </p>
                  <div className="pt-1.5 flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => {
                        setSelectedAnomalyId(alert.id);
                        setCurrentRoute('anomalies');
                      }}
                      className="font-medium text-[#2563A6] hover:underline flex items-center gap-1"
                    >
                      <span>Investigate Anomaly</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xs transition-colors"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>Threshold: Peak &gt; 1100 kW</span>
            <span>Edge Gateway: Synced</span>
          </div>
        </div>
      </div>
    </div>
  );
};
