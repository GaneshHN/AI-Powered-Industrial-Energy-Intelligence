/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FactoryProvider, useFactory, AppRoute } from './context/FactoryContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DashboardView } from './components/views/DashboardView';
import { EnergyIntelligenceView } from './components/views/EnergyIntelligenceView';
import { MachineMonitoringView } from './components/views/MachineMonitoringView';
import { EnergyForecastView } from './components/views/EnergyForecastView';
import { AnomalyDetectionView } from './components/views/AnomalyDetectionView';
import { RootCauseView } from './components/views/RootCauseView';
import { DigitalTwinView } from './components/views/DigitalTwinView';
import { ProductionOptimizationView } from './components/views/ProductionOptimizationView';
import { CopilotView } from './components/views/CopilotView';
import { RecommendationsView } from './components/views/RecommendationsView';
import { AlertsView } from './components/views/AlertsView';
import { SettingsView } from './components/views/SettingsView';
import { LoginView } from './components/views/LoginView';
import { CheckCircle2, X, Building2, RefreshCw } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentRoute,
    notificationMessage,
    clearNotification,
    userSession,
    isAuthLoading,
    isFactoryLoading,
    factories,
    refreshFactories,
    logoutUser,
  } = useFactory();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 1. Initial Authentication Loading State (prevent flashing protected screens during session restore)
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#14283F] flex flex-col items-center justify-center p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xs bg-[#2563A6] flex items-center justify-center shadow-md">
            <span className="font-mono font-bold text-xl text-white">EP</span>
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight">ENER<span className="text-[#3B82F6]">PILOT</span></div>
            <div className="text-[10px] text-slate-400 font-mono tracking-wider">INDUSTRIAL ENERGY INTELLIGENCE</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-slate-300 bg-[#1D3552] px-4 py-2 rounded-xs border border-slate-700">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#3B82F6]" />
          <span>Verifying secure industrial session...</span>
        </div>
      </div>
    );
  }

  // 2. If user is on login page or not logged in
  if (currentRoute === 'login' || !userSession.isLoggedIn) {
    return <LoginView />;
  }

  // 3. Authenticated but factories are actively loading
  if (isFactoryLoading && factories.length === 0) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex flex-col items-center justify-center p-6 text-slate-700">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-4 py-2.5 rounded-xs border border-slate-200 shadow-xs">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#2563A6]" />
          <span>Loading manufacturing plant configurations...</span>
        </div>
      </div>
    );
  }

  // 4. Authenticated, but no accessible factories found (empty state)
  if (!isFactoryLoading && factories.length === 0) {
    return (
      <div className="min-h-screen bg-[#F4F6F8] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xs p-6 shadow-xs text-center">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-[#14283F] mb-1">No Accessible Facilities Found</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            Your user account is authenticated, but no industrial manufacturing facilities are currently associated with your role. Please contact your facility administrator to assign permissions.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => refreshFactories()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#2563A6] hover:bg-[#1D4E89] rounded-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
            <button
              onClick={() => logoutUser()}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xs transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (currentRoute) {
      case 'dashboard':
        return <DashboardView />;
      case 'energy':
        return <EnergyIntelligenceView />;
      case 'machines':
        return <MachineMonitoringView />;
      case 'forecast':
        return <EnergyForecastView />;
      case 'anomalies':
        return <AnomalyDetectionView />;
      case 'root-cause':
        return <RootCauseView />;
      case 'digital-twin':
        return <DigitalTwinView />;
      case 'optimization':
        return <ProductionOptimizationView />;
      case 'copilot':
        return <CopilotView />;
      case 'recommendations':
        return <RecommendationsView />;
      case 'alerts':
        return <AlertsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#1C2834] flex flex-col antialiased">
      {/* Toast Notification Banner */}
      {notificationMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 bg-[#14283F] text-white px-4 py-2.5 rounded-xs shadow-lg border border-slate-700 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="h-4 w-4 text-[#24845A] shrink-0" />
          <span className="font-medium">{notificationMessage}</span>
          <button
            onClick={clearNotification}
            className="text-slate-400 hover:text-white ml-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Collapsible Navigation Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Primary Layout Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          onOpenMobileMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
        />

        {/* Content Viewport */}
        <main
          className={`flex-1 p-4 sm:p-6 transition-all duration-200 ${
            collapsed ? 'lg:pl-22' : 'lg:pl-68'
          }`}
        >
          <div className="max-w-[1440px] mx-auto w-full">
            {renderActiveView()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <FactoryProvider>
      <AppContent />
    </FactoryProvider>
  );
}
