import React from 'react';
import { Cpu, Code2, Play, Activity, Network, Settings, Copy, Check, Radio } from 'lucide-react';

interface NavbarProps {
  activeTab: 'code' | 'simulator' | 'protocol' | 'wiring';
  setActiveTab: (tab: 'code' | 'simulator' | 'protocol' | 'wiring') => void;
  onOpenConfig: () => void;
  onCopyCode: () => void;
  copied: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenConfig,
  onCopyCode,
  copied,
}) => {
  return (
    <header className="border-b border-slate-700/80 bg-[#161F33] sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3.5 gap-4">
          {/* Brand Logo & Title from Design Theme */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-cyan-600 rounded-lg flex items-center justify-center font-bold text-white text-lg sm:text-xl shadow-lg shadow-cyan-900/40 shrink-0 select-none">
              EH
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                  Endress+Hauser Flowphant™ T DTT31
                </h1>
                <span className="hidden lg:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                  ESP32 UART
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 uppercase tracking-widest truncate">
                ESP32 Async Web Service Interface
              </p>
            </div>
          </div>

          {/* Center/Right: Network & UART Status (visible on md+) */}
          <div className="hidden xl:flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Network Identity</span>
              <span className="font-mono text-xs text-cyan-400">ESP32_FLOW_01 (192.168.1.105)</span>
            </div>
            <div className="flex flex-col items-end border-l border-slate-700 pl-6">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">UART-2 Port</span>
              <span className="text-emerald-400 flex items-center gap-1.5 font-semibold text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                LINK ESTABLISHED
              </span>
            </div>
          </div>

          {/* Actions & Config */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenConfig}
              className="p-2 rounded-lg text-slate-300 hover:text-white bg-[#1e293b] hover:bg-[#25334a] border border-slate-600 transition-colors shadow-sm"
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
        <div className="flex items-center justify-between border-t border-slate-700/60 pt-2.5 pb-2.5 gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Arduino C++ Firmware</span>
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'simulator'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Live ESP32 Telemetry</span>
            </button>

            <button
              onClick={() => setActiveTab('protocol')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'protocol'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>UART Protocol & Frames</span>
            </button>

            <button
              onClick={() => setActiveTab('wiring')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'wiring'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500'
                  : 'bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 hover:text-white border border-slate-700/80'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Industrial Wiring & Pins</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400 pl-4 border-l border-slate-700/60">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>GPIO16 (RX) / GPIO17 (TX)</span>
          </div>
        </div>
      </div>
    </header>
  );
};
