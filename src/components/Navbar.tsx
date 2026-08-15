import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Code2, 
  Play, 
  Activity, 
  Network, 
  Settings, 
  Copy, 
  Check, 
  HeartPulse, 
  Radio, 
  ShieldCheck, 
  Zap,
  CheckCircle2,
  ChevronDown,
  Usb,
  Power
} from 'lucide-react';
import { ESP32Config, SensorTelemetry, ConnectionMode } from '../types/esp32';

interface NavbarProps {
  activeTab: 'code' | 'flasher' | 'simulator' | 'protocol' | 'wiring';
  setActiveTab: (tab: 'code' | 'flasher' | 'simulator' | 'protocol' | 'wiring') => void;
  onOpenConfig: () => void;
  onCopyCode: () => void;
  copied: boolean;
  config?: ESP32Config;
  telemetry?: SensorTelemetry;
  activeConnectionMode?: ConnectionMode;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenConfig,
  onCopyCode,
  copied,
  config,
  telemetry,
  activeConnectionMode = 'disconnected',
}) => {
  const [pulse, setPulse] = useState(false);
  const [showHeartbeatDetails, setShowHeartbeatDetails] = useState(false);

  const isRealConnected = activeConnectionMode === 'usb_serial' || (activeConnectionMode === 'wifi_network' && telemetry?.connected);
  const isDemo = activeConnectionMode === 'simulated_demo';
  const isConnected = isRealConnected || isDemo;

  // Real-time Heartbeat pulse effect reflecting incoming UART frames
  useEffect(() => {
    if (isConnected) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(timer);
    }
  }, [telemetry?.packetCount, isConnected]);

  return (
    <header className="border-b border-slate-700/80 bg-[#161F33] sticky top-0 z-40 shadow-xl select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-cyan-600 rounded-lg flex items-center justify-center font-bold text-white text-base sm:text-lg shadow-lg shadow-cyan-900/40 shrink-0 select-none">
              EH
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Endress+Hauser Flowphant™ T DTT31
                </h1>
                <span className="hidden xl:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                  ESP32 UART &bull; Web Flasher
                </span>
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate">
                Async Web Service &bull; Serial2 @ {config?.baudRate || 19200} Baud
              </p>
            </div>
          </div>

          {/* Visual Connection Status Indicator (Heartbeat Icon) */}
          <div className="relative">
            <button
              onClick={() => setShowHeartbeatDetails(!showHeartbeatDetails)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                isRealConnected
                  ? 'bg-[#0e1626] border-emerald-500/40 text-emerald-400 hover:border-emerald-400 hover:bg-[#121c30]'
                  : isDemo
                  ? 'bg-[#0e1626] border-amber-500/40 text-amber-400 hover:border-amber-400'
                  : 'bg-[#0e1626] border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
              title="Click to view Hardware Connection & Packet Telemetry Diagnostics"
            >
              {/* Animated Heartbeat Icon */}
              <div className="relative flex items-center justify-center">
                <HeartPulse 
                  className={`w-4 h-4 transition-transform duration-300 ${
                    isRealConnected
                      ? pulse ? 'scale-125 text-emerald-300' : 'scale-100 text-emerald-400'
                      : isDemo
                      ? 'text-amber-400'
                      : 'text-slate-600'
                  }`} 
                />
                {isRealConnected && (
                  <span 
                    className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ${
                      pulse ? 'animate-ping opacity-100' : 'opacity-75'
                    }`} 
                  />
                )}
              </div>

              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider font-mono">
                    {isRealConnected ? 'REAL HARDWARE LINK' : isDemo ? 'DEMO DRY-RUN' : 'DISCONNECTED'}
                  </span>
                  {isRealConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
                </div>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline leading-none mt-0.5">
                  {isRealConnected 
                    ? `RX: ${telemetry?.packetCount || 0} pkts` 
                    : isDemo 
                    ? 'Synthetic Simulation' 
                    : 'Plug USB / Connect Wi-Fi'
                  }
                </span>
              </div>

              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showHeartbeatDetails ? 'rotate-180' : ''}`} />
            </button>

            {/* Heartbeat Diagnostic Popover */}
            {showHeartbeatDetails && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#0e1626] border border-slate-700 rounded-xl p-4 shadow-2xl z-50 text-xs font-mono">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-cyan-400" />
                    Hardware Telemetry Status
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
                    isRealConnected
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : isDemo
                      ? 'bg-amber-950 text-amber-400 border-amber-800'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {isRealConnected ? 'REAL HARDWARE' : isDemo ? 'SYNTHETIC DEMO' : 'OFFLINE'}
                  </span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Connection Mode:</span>
                    <span className="text-cyan-300 font-semibold uppercase">{activeConnectionMode.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Sensor:</span>
                    <span className="text-slate-200">Flowphant T DTT31</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hardware Serial:</span>
                    <span className="text-slate-200">UART2 (RX:{config?.rxPin || 16}, TX:{config?.txPin || 17})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sensor Baud:</span>
                    <span className="text-amber-300 font-semibold">{config?.baudRate || 19200} Baud (8N1)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Packets Received:</span>
                    <span className={isRealConnected ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {telemetry?.packetCount || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CRC/BCC Status:</span>
                    <span className={telemetry?.connected ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {telemetry?.connected ? 'VERIFIED' : 'AWAITING LINK'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Web Serial API: Ready</span>
                  <button 
                    onClick={() => setShowHeartbeatDetails(false)}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions & Config */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenConfig}
              className="p-2 rounded-lg text-slate-300 hover:text-white bg-[#1e293b] hover:bg-[#25334a] border border-slate-600 transition-colors shadow-sm cursor-pointer"
              title="Customize WiFi, UART Pins & Settings"
            >
              <Settings className="w-4 h-4 text-cyan-400" />
            </button>

            <button
              onClick={onCopyCode}
              className="px-3.5 py-2 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-white border border-slate-600 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm group cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300" />
              )}
              <span className="hidden sm:inline">{copied ? 'Copied Arduino .ino' : 'Copy Code'}</span>
              <span className="sm:hidden">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="flex items-center justify-between border-t border-slate-700/60 pt-2 pb-2 gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Tab 1: Arduino & PlatformIO Code */}
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'code'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Arduino &amp; PlatformIO Code</span>
            </button>

            {/* Tab 2: Web Serial Flasher (NEW) */}
            <button
              onClick={() => setActiveTab('flasher')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'flasher'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>⚡ Web Serial Flasher</span>
            </button>

            {/* Tab 3: Live Telemetry */}
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'simulator'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Live ESP32 Telemetry</span>
            </button>

            {/* Tab 4: UART Protocol */}
            <button
              onClick={() => setActiveTab('protocol')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'protocol'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>UART Protocol &amp; Frames</span>
            </button>

            {/* Tab 5: Industrial Wiring */}
            <button
              onClick={() => setActiveTab('wiring')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'wiring'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Industrial Wiring &amp; Pins</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400 pl-4 border-l border-slate-700/60 shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>GPIO{config?.rxPin || 16} (RX) / GPIO{config?.txPin || 17} (TX)</span>
          </div>
        </div>
      </div>
    </header>
  );
};
