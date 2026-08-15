import React from 'react';
import { X, Sliders, Wifi, Cpu, Clock, Globe, Shield, RefreshCw } from 'lucide-react';
import { ESP32Config } from '../types/esp32';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ESP32Config;
  setConfig: React.Dispatch<React.SetStateAction<ESP32Config>>;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, config, setConfig }) => {
  if (!isOpen) return null;

  const handleChange = <K extends keyof ESP32Config>(key: K, value: ESP32Config[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setConfig({
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#161F33] border border-slate-700 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-[#0e1626]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">ESP32 &amp; Sensor Configuration</h3>
              <p className="text-xs text-slate-400">Updates live in the generated Arduino C++ code</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1e293b] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          {/* Wi-Fi Settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              Wi-Fi Connection Settings
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Wi-Fi SSID:</label>
                <input
                  type="text"
                  value={config.wifiSsid}
                  onChange={(e) => handleChange('wifiSsid', e.target.value)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="e.g. Workshop_WiFi"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Wi-Fi Password:</label>
                <input
                  type="text"
                  value={config.wifiPass}
                  onChange={(e) => handleChange('wifiPass', e.target.value)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="e.g. WPA2 Key"
                />
              </div>
            </div>
          </div>

          {/* Hardware Serial Pins & Baud */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Hardware Serial2 (UART) Pinout &amp; Baud
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 font-medium block mb-1">RX Pin (GPIO):</label>
                <input
                  type="number"
                  value={config.rxPin}
                  onChange={(e) => handleChange('rxPin', parseInt(e.target.value) || 16)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">TX Pin (GPIO):</label>
                <input
                  type="number"
                  value={config.txPin}
                  onChange={(e) => handleChange('txPin', parseInt(e.target.value) || 17)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Baud Rate:</label>
                <select
                  value={config.baudRate}
                  onChange={(e) => handleChange('baudRate', parseInt(e.target.value))}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value={19200}>19200 (Default)</option>
                  <option value={9600}>9600</option>
                  <option value={38400}>38400</option>
                  <option value={57600}>57600</option>
                  <option value={115200}>115200</option>
                </select>
              </div>
            </div>
          </div>

          {/* Web Server & Polling */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Timing &amp; Server Configuration
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Polling Interval (ms):</label>
                <input
                  type="number"
                  min={200}
                  max={10000}
                  step={100}
                  value={config.pollIntervalMs}
                  onChange={(e) => handleChange('pollIntervalMs', parseInt(e.target.value) || 1500)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Web Server HTTP Port:</label>
                <input
                  type="number"
                  value={config.webServerPort}
                  onChange={(e) => handleChange('webServerPort', parseInt(e.target.value) || 80)}
                  className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            {/* AP Fallback Checkbox */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="apFallback"
                checked={config.enableApFallback}
                onChange={(e) => handleChange('enableApFallback', e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 bg-[#050811] border-slate-700 focus:ring-cyan-500"
              />
              <label htmlFor="apFallback" className="text-slate-300 select-none cursor-pointer">
                Enable SoftAP Fallback mode if Station Wi-Fi connection fails
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-[#0e1626]">
          <button
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/40 border border-cyan-500 transition-colors cursor-pointer"
          >
            Apply &amp; View Generated Code
          </button>
        </div>
      </div>
    </div>
  );
};
