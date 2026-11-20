import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { useFactory } from '../../context/FactoryContext';
import { MachineDistribution } from '../../types';

interface MachineDistributionChartProps {
  onSelectMachine?: (machineId: string) => void;
  data?: MachineDistribution[];
  isLoading?: boolean;
}

export const MachineDistributionChart: React.FC<MachineDistributionChartProps> = ({
  onSelectMachine,
  data = [],
  isLoading = false
}) => {
  const { setSelectedMachineId, setCurrentRoute } = useFactory();

  const handleRowClick = (machineId: string) => {
    if (onSelectMachine) {
      onSelectMachine(machineId);
    } else {
      setSelectedMachineId(machineId);
      setCurrentRoute('machines');
    }
  };

  const totalEnergy = data.reduce((acc, curr) => acc + curr.energyKwh, 0);
  const maxEnergy = data.length > 0 ? Math.max(...data.map(m => m.energyKwh)) : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[#14283F]">
          Machine Energy Distribution (Ranked by Consumption)
        </span>
        <span className="text-[11px] text-slate-500 font-mono">
          {isLoading ? 'Loading...' : `Total: ${totalEnergy.toLocaleString()} kWh`}
        </span>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Loading machine energy distribution...
        </div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No machine energy distribution recorded for this period.
        </div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 6).map((item) => {
            const widthPct = maxEnergy > 0 ? Math.round((item.energyKwh / maxEnergy) * 100) : 0;

            return (
              <div
                key={item.machineId}
                onClick={() => handleRowClick(item.machineId)}
                className="p-2 rounded-xs hover:bg-[#F4F6F8] transition-colors cursor-pointer border border-transparent hover:border-slate-200 group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-slate-900 group-hover:text-[#2563A6] transition-colors truncate max-w-[120px]">
                      {item.machineId}
                    </span>
                    <span className="text-slate-500 truncate hidden sm:inline">
                      {item.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {item.energyKwh.toLocaleString()} kWh
                    </span>
                    <span className="text-slate-500 w-12 text-right tabular-nums">
                      {item.sharePct}%
                    </span>
                    <StatusBadge status={item.status} className="hidden md:inline-flex" />
                  </div>
                </div>

                {/* Progress track */}
                <div className="h-1.5 w-full bg-[#EDF1F4] rounded-xs overflow-hidden">
                  <div
                    className={`h-full rounded-xs transition-all duration-300 ${
                      item.sharePct > 20
                        ? 'bg-[#14283F]'
                        : item.sharePct > 10
                        ? 'bg-[#2563A6]'
                        : 'bg-[#54718A]'
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
