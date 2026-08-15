import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { CodeViewer } from './components/CodeViewer';
import { LiveSimulator } from './components/LiveSimulator';
import { ProtocolAnalyzer } from './components/ProtocolAnalyzer';
import { WiringGuide } from './components/WiringGuide';
import { ConfigModal } from './components/ConfigModal';
import { ESP32Config } from './types/esp32';
import { generateArduinoInoCode } from './utils/arduinoCodeGenerator';
import { ShieldCheck, Cpu, Flame, Gauge, Wifi, Zap, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'code' | 'simulator' | 'protocol' | 'wiring'>('code');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [config, setConfig] = useState<ESP32Config>({
    wifiSsid: 'Your_WiFi_SSID',
    wifiPass: 'Your_WiFi_Password',
    rxPin: 16,
    txPin: 17,
    baudRate: 19200,
    pollIntervalMs: 1500,
    deviceAddress: '01',
    webServerPort: 80,
    enableApFallback: true,
    apSsid: 'ESP32_Flowphant_AP',
    tempUnit: 'C',
  });

  const handleCopyCode = () => {
    const inoCode = generateArduinoInoCode(config);
    navigator.clipboard.writeText(inoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-slate-300 selection:bg-cyan-600 selection:text-white flex flex-col">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenConfig={() => setIsConfigOpen(true)}
        onCopyCode={handleCopyCode}
        copied={copied}
        config={config}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeTab === 'code' && (
          <CodeViewer config={config} onOpenConfig={() => setIsConfigOpen(true)} />
        )}

        {activeTab === 'simulator' && (
          <LiveSimulator config={config} />
        )}

        {activeTab === 'protocol' && (
          <ProtocolAnalyzer />
        )}

        {activeTab === 'wiring' && (
          <WiringGuide config={config} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#070B16] py-5 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-medium text-slate-300">
            <div className="w-5 h-5 rounded bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center">
              <Cpu className="w-3 h-3 text-cyan-400" />
            </div>
            <span>Endress+Hauser Flowphant™ T DTT31 &bull; ESP32 Async Web Service Interface</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
            <span className="text-cyan-400 font-semibold">UART-2: 19200 8N1</span>
            <span>&bull;</span>
            <span>PROGMEM AsyncServer</span>
            <span>&bull;</span>
            <span className="text-emerald-400 font-semibold">FreeRTOS Mutex</span>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        setConfig={setConfig}
      />
    </div>
  );
}
