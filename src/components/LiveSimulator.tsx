import { useState, useEffect, useRef, FC, ChangeEvent, Dispatch, SetStateAction } from 'react';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Flame, 
  Gauge, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Terminal, 
  Play, 
  Pause, 
  Sliders, 
  RefreshCw,
  Sparkles,
  Zap,
  Cpu,
  Radio,
  Globe,
  Usb,
  Power,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { ESP32Config, SensorTelemetry, SerialLogMessage, ConnectionMode } from '../types/esp32';
import { PROTOCOL_COMMANDS, formatHexSpaced, bytesToAscii, calculateDTT31BCC } from '../data/protocolData';
import { WebSerialReaderService } from '../utils/webSerialReader';

interface LiveSimulatorProps {
  config: ESP32Config;
  activeConnectionMode: ConnectionMode;
  setActiveConnectionMode: (mode: ConnectionMode) => void;
  telemetry: SensorTelemetry;
  setTelemetry: Dispatch<SetStateAction<SensorTelemetry>>;
  serialLogs: SerialLogMessage[];
  setSerialLogs: Dispatch<SetStateAction<SerialLogMessage[]>>;
  webSerialReader: WebSerialReaderService;
}

export const LiveSimulator: FC<LiveSimulatorProps> = ({
  config,
  activeConnectionMode,
  setActiveConnectionMode,
  telemetry,
  setTelemetry,
  serialLogs,
  setSerialLogs,
  webSerialReader,
}) => {
  // IP / Network Connection States
  const [espIpInput, setEspIpInput] = useState<string>(config.espIpAddress || '192.168.1.105');
  const [isIpPolling, setIsIpPolling] = useState<boolean>(false);
  const [ipPollError, setIpPollError] = useState<string | null>(null);

  // USB Serial States
  const [isUsbConnecting, setIsUsbConnecting] = useState<boolean>(false);
  const [customSerialCmd, setCustomSerialCmd] = useState<string>('');

  // Physical Demo Process Simulation States (Disabled by default, user-enabled only for dry-run)
  const [demoFluidFlow, setDemoFluidFlow] = useState<number>(45.8);
  const [demoFluidTemp, setDemoFluidTemp] = useState<number>(24.3);
  const [demoSensorOnline, setDemoSensorOnline] = useState<boolean>(true);

  // History for trend sparkline
  const [flowHistory, setFlowHistory] = useState<number[]>([]);

  // Logs DOM ref
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Calibration sequence interactive state
  const [calibState, setCalibState] = useState<{
    inProgress: boolean;
    type: 'min' | 'max' | 'exit' | null;
    message: string;
  }>({
    inProgress: false,
    type: null,
    message: '',
  });

  const [toastMessage, setToastMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const showToast = (text: string, isError: boolean = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Add serial log helper
  const addLog = (direction: 'TX' | 'RX' | 'SYS' | 'ERR', hex: string, ascii: string, description?: string) => {
    const newLog: SerialLogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'),
      direction,
      hex,
      ascii,
      description,
    };
    setSerialLogs((prev) => [...prev.slice(-80), newLog]);
  };

  // Scroll logs to bottom on new entry
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLogs]);

  // Record flow history when telemetry updates
  useEffect(() => {
    if (telemetry.connected && telemetry.flowPercent !== undefined) {
      setFlowHistory(prev => [...prev.slice(-20), telemetry.flowPercent]);
    }
  }, [telemetry.connected, telemetry.flowPercent]);

  // ==========================================
  // 1. USB WEB SERIAL CONNECTION HANDLERS
  // ==========================================
  const handleConnectUsbSerial = async () => {
    if (activeConnectionMode === 'usb_serial') {
      await webSerialReader.disconnect({
        onLog: (l) => setSerialLogs(p => [...p, l]),
        onTelemetryUpdate: () => {},
        onConnectionChange: () => {},
        onError: () => {},
      });
      setActiveConnectionMode('disconnected');
      setTelemetry(prev => ({
        ...prev,
        connected: false,
        status: 'DISCONNECTED',
        source: 'disconnected',
      }));
      showToast('USB Serial port disconnected.');
      return;
    }

    try {
      setIsUsbConnecting(true);
      await webSerialReader.connect(115200, {
        onLog: (newLog) => {
          setSerialLogs(prev => [...prev.slice(-80), newLog]);
        },
        onTelemetryUpdate: (updated) => {
          setTelemetry(prev => ({
            ...prev,
            ...updated,
            connected: true,
            packetCount: prev.packetCount + 1,
            source: 'usb_serial',
          }));
        },
        onConnectionChange: (connected, info) => {
          if (connected) {
            setActiveConnectionMode('usb_serial');
            setTelemetry(prev => ({
              ...prev,
              connected: true,
              status: 'NORMAL',
              source: 'usb_serial',
            }));
            showToast(`Real ESP32 USB Serial Connected (${info || '115200 8N1'})`);
          } else {
            setActiveConnectionMode('disconnected');
            setTelemetry(prev => ({
              ...prev,
              connected: false,
              status: 'DISCONNECTED',
              source: 'disconnected',
            }));
          }
        },
        onError: (err) => {
          showToast(`USB Error: ${err}`, true);
        },
      });
    } catch (err: any) {
      showToast(`USB Connection Failed: ${err.message || err}`, true);
    } finally {
      setIsUsbConnecting(false);
    }
  };

  const handleSendCustomSerial = async () => {
    if (!customSerialCmd.trim()) return;
    try {
      await webSerialReader.sendCommand(customSerialCmd, {
        onLog: (l) => setSerialLogs(p => [...p, l]),
        onTelemetryUpdate: () => {},
        onConnectionChange: () => {},
        onError: (e) => showToast(e, true),
      });
      setCustomSerialCmd('');
    } catch (e: any) {
      showToast(`Send failed: ${e.message}`, true);
    }
  };

  const handleHardwareResetUsb = async () => {
    try {
      await webSerialReader.hardwareReset({
        onLog: (l) => setSerialLogs(p => [...p, l]),
        onTelemetryUpdate: () => {},
        onConnectionChange: () => {},
        onError: (e) => showToast(e, true),
      });
      showToast('ESP32 Hardware Reset pulse sent');
    } catch (e: any) {
      showToast(`Reset error: ${e.message}`, true);
    }
  };

  // ==========================================
  // 2. WI-FI HTTP REAL POLLING HANDLER
  // ==========================================
  const toggleWifiPolling = () => {
    if (activeConnectionMode === 'wifi_network') {
      setIsIpPolling(false);
      setActiveConnectionMode('disconnected');
      setTelemetry(prev => ({
        ...prev,
        connected: false,
        status: 'DISCONNECTED',
        source: 'disconnected',
      }));
      showToast('Disconnected from ESP32 Wi-Fi IP.');
      return;
    }

    if (!espIpInput.trim()) {
      showToast('Please enter a valid ESP32 IP address.', true);
      return;
    }

    setActiveConnectionMode('wifi_network');
    setIsIpPolling(true);
    setIpPollError(null);
    showToast(`Connecting to ESP32 at http://${espIpInput}...`);
  };

  // Wi-Fi polling loop when active
  useEffect(() => {
    if (activeConnectionMode !== 'wifi_network' || !isIpPolling) return;

    const pollIp = async () => {
      const targetUrl = espIpInput.startsWith('http') ? espIpInput : `http://${espIpInput}`;
      try {
        const res = await fetch(`${targetUrl}/api/data`, { 
          cache: 'no-store',
          signal: AbortSignal.timeout(3000)
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setIpPollError(null);
        setTelemetry(prev => ({
          ...prev,
          flowPercent: typeof data.flowPercent === 'number' ? data.flowPercent : parseFloat(data.flowPercent || 0),
          temperatureC: typeof data.temperatureC === 'number' ? data.temperatureC : parseFloat(data.temperatureC || 0),
          temperatureF: typeof data.temperatureC === 'number' ? +(data.temperatureC * 1.8 + 32).toFixed(1) : prev.temperatureF,
          connected: data.connected !== undefined ? data.connected : true,
          status: data.status || 'NORMAL',
          lastUpdatedMs: Date.now(),
          rawHexResponse: data.rawHex || '',
          rawAsciiResponse: data.rawAscii || '',
          packetCount: prev.packetCount + 1,
          errorCount: data.crcErrors || prev.errorCount,
          uptimeSeconds: data.uptimeSeconds || prev.uptimeSeconds + 1,
          source: 'wifi_network',
        }));

        addLog('RX', data.rawHex || '--', data.rawAscii || 'HTTP /api/data response', `Flow: ${data.flowPercent}%, Temp: ${data.temperatureC}°C`);
      } catch (err: any) {
        setIpPollError(err.message || 'Connection timeout');
        setTelemetry(prev => ({
          ...prev,
          connected: false,
          status: 'OFFLINE',
          source: 'wifi_network',
        }));
        addLog('ERR', '--', `Failed to poll http://${espIpInput}/api/data: ${err.message}`, 'HTTP Error');
      }
    };

    pollIp();
    const interval = setInterval(pollIp, config.pollIntervalMs || 1500);
    return () => clearInterval(interval);
  }, [activeConnectionMode, isIpPolling, espIpInput, config.pollIntervalMs]);

  // ==========================================
  // 3. OFFLINE DEMO SIMULATION (EXPLICIT ONLY)
  // ==========================================
  const toggleDemoSimulation = () => {
    if (activeConnectionMode === 'simulated_demo') {
      setActiveConnectionMode('disconnected');
      setTelemetry(prev => ({
        ...prev,
        connected: false,
        status: 'DISCONNECTED',
        source: 'disconnected',
      }));
      showToast('Demo simulation turned OFF.');
    } else {
      setActiveConnectionMode('simulated_demo');
      setTelemetry(prev => ({
        ...prev,
        flowPercent: demoFluidFlow,
        temperatureC: demoFluidTemp,
        temperatureF: +(demoFluidTemp * 1.8 + 32).toFixed(1),
        connected: demoSensorOnline,
        status: demoSensorOnline ? 'NORMAL' : 'OFFLINE',
        source: 'simulated_demo',
      }));
      showToast('Offline Demo Mode Activated (Synthetic Dry-Run Only)');
    }
  };

  // Demo loop only runs if activeConnectionMode === 'simulated_demo'
  useEffect(() => {
    if (activeConnectionMode !== 'simulated_demo') return;

    const interval = setInterval(() => {
      if (demoSensorOnline) {
        // Construct simulated DTT31 UART frame
        const delta = (Math.random() - 0.5) * 0.4;
        const currentFlow = Math.max(0, Math.min(100, +(demoFluidFlow + delta).toFixed(1)));
        const currentTemp = demoFluidTemp;

        const flowStr = 'F' + (currentFlow < 100 ? (currentFlow < 10 ? '00' : '0') : '') + currentFlow.toFixed(1);
        const tempStr = 'T' + (currentTemp >= 0 ? (currentTemp < 10 ? '00' : '0') : '') + currentTemp.toFixed(1);
        const payloadStr = flowStr + tempStr;

        const rxBytes: number[] = [0x01, 0x30, 0x31, 0x02];
        for (let i = 0; i < payloadStr.length; i++) rxBytes.push(payloadStr.charCodeAt(i));
        rxBytes.push(0x03);
        const bcc = calculateDTT31BCC(rxBytes);
        rxBytes.push(bcc);

        const rxHex = formatHexSpaced(rxBytes);
        const rxAscii = bytesToAscii(rxBytes);

        setTelemetry(prev => ({
          ...prev,
          flowPercent: currentFlow,
          temperatureC: currentTemp,
          temperatureF: +(currentTemp * 1.8 + 32).toFixed(1),
          connected: true,
          status: 'NORMAL',
          lastUpdatedMs: Date.now(),
          rawHexResponse: rxHex,
          rawAsciiResponse: rxAscii,
          packetCount: prev.packetCount + 1,
          uptimeSeconds: prev.uptimeSeconds + 1,
          source: 'simulated_demo',
        }));

        addLog('TX', '01 30 31 02 52 31 30 30 30 03 50', '<SOH>01<STX>R1000<ETX>P', '[DEMO] Poll Register R1000');
        addLog('RX', rxHex, rxAscii, `[DEMO] Flow=${currentFlow}%, Temp=${currentTemp}°C`);
      } else {
        setTelemetry(prev => ({
          ...prev,
          connected: false,
          status: 'OFFLINE',
          source: 'simulated_demo',
        }));
        addLog('ERR', '-- --', '[DEMO] SENSOR TIMEOUT: No UART echo', 'Timeout (150ms)');
      }
    }, config.pollIntervalMs || 1500);

    return () => clearInterval(interval);
  }, [activeConnectionMode, demoFluidFlow, demoFluidTemp, demoSensorOnline, config.pollIntervalMs]);

  // ==========================================
  // CALIBRATION ACTIONS (REAL + DEMO SUPPORT)
  // ==========================================
  const runCalibration = async (type: 'min' | 'max' | 'exit') => {
    if (calibState.inProgress) return;

    if (!telemetry.connected) {
      showToast('Cannot calibrate: Hardware is not connected!', true);
      return;
    }

    setCalibState({
      inProgress: true,
      type,
      message: type === 'min' ? 'Sending TFL20 (Teach Min 20%)...' : type === 'max' ? 'Sending TFH80 (Teach Max 80%)...' : 'Sending TFX (Exit)...',
    });

    // 1. If USB Web Serial is active, transmit over real serial!
    if (activeConnectionMode === 'usb_serial') {
      try {
        const cmd = type === 'min' ? 'TFL20' : type === 'max' ? 'TFH80' : 'TFX';
        await webSerialReader.sendCommand(cmd, {
          onLog: (l) => setSerialLogs(p => [...p, l]),
          onTelemetryUpdate: () => {},
          onConnectionChange: () => {},
          onError: (e) => showToast(e, true),
        });

        if (type !== 'exit') {
          await new Promise(r => setTimeout(r, 600));
          await webSerialReader.sendCommand('TFX', {
            onLog: (l) => setSerialLogs(p => [...p, l]),
            onTelemetryUpdate: () => {},
            onConnectionChange: () => {},
            onError: (e) => showToast(e, true),
          });
        }
        showToast(`Real ESP32: Calibration ${type.toUpperCase()} sent over USB!`);
      } catch (err: any) {
        showToast(`Calibration error: ${err.message}`, true);
      } finally {
        setCalibState({ inProgress: false, type: null, message: '' });
      }
      return;
    }

    // 2. If Wi-Fi is active, POST to ESP32 REST API
    if (activeConnectionMode === 'wifi_network') {
      try {
        const targetUrl = espIpInput.startsWith('http') ? espIpInput : `http://${espIpInput}`;
        const res = await fetch(`${targetUrl}/api/calibrate/${type}`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message || `Calibration ${type.toUpperCase()} committed!`);
      } catch (e: any) {
        showToast(`Wi-Fi Calibration failed: ${e.message}`, true);
      } finally {
        setCalibState({ inProgress: false, type: null, message: '' });
      }
      return;
    }

    // 3. If Demo mode is active
    if (activeConnectionMode === 'simulated_demo') {
      await new Promise(r => setTimeout(r, 800));
      addLog('TX', '01 30 31 02 54 46 4C 32 30 03 5F', '<SOH>01<STX>TFL20<ETX>_', '[DEMO] Teach 20% Min Flow');
      addLog('RX', '01 30 31 02 4F 4B 03 3E', '<SOH>01<STX>OK<ETX>>', '[DEMO] Sensor Display OK');
      addLog('TX', '01 30 31 02 54 46 58 03 49', '<SOH>01<STX>TFX<ETX>I', '[DEMO] Exit Calibration (TFX)');
      setCalibState({ inProgress: false, type: null, message: '' });
      showToast(`[DEMO] ${type === 'min' ? '20% Min' : '80% Max'} Flow sequence simulated.`);
    }
  };

  const isRealHardwareConnected = activeConnectionMode === 'usb_serial' || (activeConnectionMode === 'wifi_network' && telemetry.connected);

  return (
    <div className="space-y-6">
      {/* Real Connection Manager Header Banner */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-lg ${
              isRealHardwareConnected
                ? 'bg-emerald-600 border border-emerald-400 text-white shadow-emerald-950/50'
                : activeConnectionMode === 'simulated_demo'
                ? 'bg-amber-600 border border-amber-400 text-white shadow-amber-950/50'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}>
              {isRealHardwareConnected ? <Usb className="w-5 h-5" /> : activeConnectionMode === 'simulated_demo' ? <Sparkles className="w-5 h-5" /> : <Power className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-white text-base">Live ESP32 Telemetry &amp; Hardware Link</span>
                {isRealHardwareConnected ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    REAL HARDWARE CONNECTED ({activeConnectionMode === 'usb_serial' ? 'USB SERIAL' : 'WI-FI IP'})
                  </span>
                ) : activeConnectionMode === 'simulated_demo' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    SIMULATED DEMO (DRY-RUN)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    NO HARDWARE CONNECTED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your real physical ESP32 via USB Web Serial or Wi-Fi network to read real flow &amp; temperature data.
              </p>
            </div>
          </div>

          {/* Quick Hardware Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Action 1: USB Web Serial Button */}
            <button
              onClick={handleConnectUsbSerial}
              disabled={isUsbConnecting}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                activeConnectionMode === 'usb_serial'
                  ? 'bg-rose-950/60 hover:bg-rose-950/80 text-rose-300 border border-rose-700'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400 shadow-cyan-950/50'
              }`}
            >
              <Usb className="w-4 h-4" />
              <span>{activeConnectionMode === 'usb_serial' ? 'Disconnect USB' : 'Connect ESP32 via USB'}</span>
            </button>

            {/* Action 2: Reset Button when USB connected */}
            {activeConnectionMode === 'usb_serial' && (
              <button
                onClick={handleHardwareResetUsb}
                className="p-2 rounded-xl bg-[#0e1626] hover:bg-[#162238] border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer"
                title="Send RTS/DTR Hardware Reset pulse"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
              </button>
            )}
          </div>
        </div>

        {/* Real Connection Options Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-4 border-t border-slate-700/80 text-xs font-mono">
          {/* Wi-Fi IP Connector Box */}
          <div className="md:col-span-8 bg-[#0e1626] p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-slate-300 font-semibold">ESP32 Wi-Fi IP Address:</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <input
                type="text"
                placeholder="192.168.1.105 or 192.168.4.1"
                value={espIpInput}
                onChange={(e) => setEspIpInput(e.target.value)}
                disabled={activeConnectionMode === 'wifi_network'}
                className="bg-[#050811] border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono w-full focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              />
              <button
                onClick={toggleWifiPolling}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeConnectionMode === 'wifi_network'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400'
                }`}
              >
                {activeConnectionMode === 'wifi_network' ? 'Stop IP Link' : 'Connect IP'}
              </button>
            </div>
          </div>

          {/* Explicit Offline Dry-Run Toggle */}
          <div className="md:col-span-4 bg-[#0e1626] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-slate-300 font-semibold text-[11px]">Offline Test Dry-Run:</span>
            </div>
            <button
              onClick={toggleDemoSimulation}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold font-mono transition-colors cursor-pointer ${
                activeConnectionMode === 'simulated_demo'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {activeConnectionMode === 'simulated_demo' ? 'DEMO ON' : 'ENABLE DEMO'}
            </button>
          </div>
        </div>

        {/* IP Connection Error Banner */}
        {ipPollError && activeConnectionMode === 'wifi_network' && (
          <div className="p-3 bg-rose-950/50 border border-rose-700/80 rounded-xl flex items-center gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Unable to connect to <strong>http://{espIpInput}/api/data</strong> ({ipPollError}). Ensure ESP32 is powered on and connected to the same Wi-Fi network.</span>
          </div>
        )}

        {/* Warning Banner when Demo Mode is Active */}
        {activeConnectionMode === 'simulated_demo' && (
          <div className="p-3 bg-amber-950/40 border border-amber-600/70 rounded-xl flex items-center gap-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>TEST DEMO MODE ACTIVE:</strong> Showing synthetic simulation values for UI inspection. Connect real ESP32 over USB or Wi-Fi for live physical telemetry.</span>
          </div>
        )}
      </div>

      {/* Main Grid: 8 Cols (Metrics & Telemetry) + 4 Cols (Calibration & Controls) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 8 COLS: Telemetry Gauges + Chart + Embedded Browser */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Dual Big Telemetry Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Live Flow Rate Card */}
            <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center relative shadow-xl overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1 ${telemetry.connected ? 'bg-cyan-500' : 'bg-slate-700'}`}></div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2 font-bold flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Live Flow Rate
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-5xl sm:text-7xl font-bold tracking-tighter font-mono ${telemetry.connected ? 'text-white' : 'text-slate-600'}`}>
                  {telemetry.connected ? telemetry.flowPercent.toFixed(1) : '--.-'}
                </span>
                <span className="text-xl sm:text-2xl text-cyan-400 font-medium font-mono">%</span>
              </div>
              <div className="w-full mt-6 bg-slate-800/50 h-3 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${telemetry.connected ? Math.max(0, Math.min(100, telemetry.flowPercent)) : 0}%` }}
                ></div>
              </div>
              <div className="mt-3 flex justify-between w-full text-[10px] text-slate-500 font-mono">
                <span>0.0% (MIN)</span>
                <span className="text-cyan-400/80">OPERATING BAND: 20% - 80%</span>
                <span>100.0% (MAX)</span>
              </div>
            </div>

            {/* Sensor Temp Card */}
            <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center relative shadow-xl overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1 ${telemetry.connected ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2 font-bold flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                Sensor Temp
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-5xl sm:text-7xl font-bold tracking-tighter font-mono ${telemetry.connected ? 'text-white' : 'text-slate-600'}`}>
                  {telemetry.connected ? telemetry.temperatureC.toFixed(1) : '--.-'}
                </span>
                <span className="text-xl sm:text-2xl text-emerald-400 font-medium font-mono">&deg;C</span>
                <span className="text-xs text-slate-500 font-mono ml-2">
                  ({telemetry.connected ? telemetry.temperatureF.toFixed(1) : '--.-'}&deg;F)
                </span>
              </div>
              <div className="w-full mt-6 bg-slate-800/50 h-3 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${telemetry.connected ? Math.max(0, Math.min(100, (telemetry.temperatureC / 80) * 100)) : 0}%` }}
                ></div>
              </div>
              <div className="mt-3 flex justify-between w-full text-[10px] text-slate-500 font-mono">
                <span>0.0&deg;C</span>
                <span className="text-emerald-400/80">SENSOR CORE TEMP</span>
                <span>80.0&deg;C</span>
              </div>
            </div>
          </div>

          {/* Real-time Telemetry Trend Graph */}
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 shadow-inner flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-cyan-500 rounded-full"></span>
                Hardware Telemetry Stream
              </h3>
              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span> Flow Trend ({telemetry.connected ? telemetry.flowPercent.toFixed(1) : '--'}%)
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Thermal ({telemetry.connected ? telemetry.temperatureC.toFixed(1) : '--'}°C)
                </span>
              </div>
            </div>

            {/* Sparkline Canvas */}
            <div className="h-40 border-l border-b border-slate-700/70 relative flex items-end overflow-hidden rounded-bl-sm bg-[#0a0f1d]/50">
              <div className="absolute inset-0 grid grid-cols-6 pointer-events-none">
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
              </div>

              {!telemetry.connected ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-500 font-mono gap-1">
                  <span>Awaiting Hardware Data Stream...</span>
                  <span className="text-[10px] text-slate-600">Connect ESP32 via USB Serial or Wi-Fi IP</span>
                </div>
              ) : flowHistory.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 font-mono">
                  Receiving initial packets...
                </div>
              ) : (
                <div className="relative z-10 w-full h-full flex items-end gap-1 px-1 pt-4">
                  {flowHistory.map((val, idx) => {
                    const heightPct = Math.max(8, Math.min(95, val));
                    return (
                      <div key={idx} className="flex-1 h-full flex flex-col justify-end items-center group">
                        <div
                          className="w-full bg-gradient-to-t from-cyan-600/80 to-cyan-400 rounded-t-sm transition-all duration-300 group-hover:bg-cyan-300"
                          style={{ height: `${heightPct}%` }}
                        ></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2">
              <span>-30s</span>
              <span>-20s</span>
              <span>-10s</span>
              <span className={telemetry.connected ? 'text-cyan-400 font-semibold' : 'text-slate-600'}>
                {telemetry.connected ? 'LIVE HARDWARE DATA' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Interactive Dry-Run Controls (Only visible if Simulated Demo is enabled) */}
          {activeConnectionMode === 'simulated_demo' && (
            <div className="bg-[#161F33] border border-amber-500/40 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/80">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Offline Test Calibration Slider (Dry Run)</h3>
                </div>
                <button
                  onClick={() => setDemoSensorOnline(!demoSensorOnline)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                    demoSensorOnline
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {demoSensorOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  {demoSensorOnline ? 'SENSOR ONLINE' : 'SIMULATE OFFLINE'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
                <div className="bg-[#0e1626] p-3.5 rounded-lg border border-slate-800">
                  <div className="flex justify-between text-slate-300 mb-1.5 font-medium">
                    <span>Simulate Fluid Flow:</span>
                    <span className="font-mono text-cyan-400 font-bold">{demoFluidFlow.toFixed(1)} %</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={demoFluidFlow}
                    onChange={(e) => setDemoFluidFlow(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="bg-[#0e1626] p-3.5 rounded-lg border border-slate-800">
                  <div className="flex justify-between text-slate-300 mb-1.5 font-medium">
                    <span>Simulate Temperature:</span>
                    <span className="font-mono text-emerald-400 font-bold">{demoFluidTemp.toFixed(1)} &deg;C</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="0.5"
                    value={demoFluidTemp}
                    onChange={(e) => setDemoFluidTemp(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT 4 COLS: Calibration Actions & System Health */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 flex flex-col shadow-2xl h-full">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              Sensor Calibration Actions
            </h3>

            {/* Calibration Progress Notification */}
            {calibState.inProgress && (
              <div className="mb-4 p-3 bg-cyan-950/60 border border-cyan-700/80 rounded-xl flex items-center gap-3 animate-pulse">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                <span className="text-xs text-cyan-200 font-mono">{calibState.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3.5">
              {/* Button 1: Learn Min Flow */}
              <button
                disabled={calibState.inProgress || !telemetry.connected}
                onClick={() => runCalibration('min')}
                className="w-full bg-[#1e293b] hover:bg-[#25334a] disabled:opacity-40 border border-slate-600 text-white rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer shadow-md"
              >
                <div className="text-left">
                  <span className="block font-bold text-[13px] text-white group-hover:text-cyan-300 transition-colors">
                    Learn Min Flow (20%)
                  </span>
                  <span className="text-[10px] text-cyan-400 uppercase font-mono tracking-tight font-semibold">
                    TX: CMD_LEARN_MIN (TFL20)
                  </span>
                </div>
                <div className="bg-slate-700 group-hover:bg-cyan-600 rounded-lg p-2 transition-colors">
                  <Zap className="w-4 h-4 text-white" />
                </div>
              </button>

              {/* Button 2: Learn Max Flow */}
              <button
                disabled={calibState.inProgress || !telemetry.connected}
                onClick={() => runCalibration('max')}
                className="w-full bg-[#1e293b] hover:bg-[#25334a] disabled:opacity-40 border border-slate-600 text-white rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer shadow-md"
              >
                <div className="text-left">
                  <span className="block font-bold text-[13px] text-white group-hover:text-cyan-300 transition-colors">
                    Learn Max Flow (80%)
                  </span>
                  <span className="text-[10px] text-cyan-400 uppercase font-mono tracking-tight font-semibold">
                    TX: CMD_LEARN_MAX (TFH80)
                  </span>
                </div>
                <div className="bg-slate-700 group-hover:bg-cyan-600 rounded-lg p-2 transition-colors">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </button>

              {/* Button 3: Exit Cal Mode */}
              <button
                disabled={calibState.inProgress || !telemetry.connected}
                onClick={() => runCalibration('exit')}
                className="w-full bg-orange-950/20 hover:bg-orange-950/30 disabled:opacity-40 border border-orange-900/50 text-orange-400 rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="text-left">
                  <span className="block font-bold text-[13px] text-orange-300">Exit Cal Mode (TFX)</span>
                  <span className="text-[10px] text-orange-500 uppercase font-mono tracking-tight font-semibold">
                    TX: CMD_CALIB_EXIT
                  </span>
                </div>
                <div className="bg-orange-900/40 rounded-lg p-2 text-orange-400">
                  <RotateCcw className="w-4 h-4" />
                </div>
              </button>
            </div>

            {/* System Health & Hardware Info */}
            <div className="mt-auto pt-6 border-t border-slate-800">
              <h4 className="text-[10px] uppercase text-slate-500 font-bold mb-3 tracking-wider">
                Connection Diagnostics
              </h4>
              <div className="grid grid-cols-2 gap-y-3 text-[11px] font-mono">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">Connection Link</span>
                  <span className="text-cyan-400 font-semibold uppercase">
                    {activeConnectionMode === 'usb_serial' ? 'USB Web Serial' : activeConnectionMode === 'wifi_network' ? 'Wi-Fi IP Link' : activeConnectionMode === 'simulated_demo' ? 'Simulated Dry-Run' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">Packets Received</span>
                  <span className="text-slate-200 font-semibold">{telemetry.packetCount.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">Sensor Status</span>
                  <span className={telemetry.connected ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                    {telemetry.connected ? 'LIVE ONLINE' : 'NO ECHO / OFFLINE'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">UART Baudrate</span>
                  <span className="text-amber-400 font-semibold">{config.baudRate} (8N1)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Live Serial Communication Log Monitor */}
      <div className="bg-[#050811] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col shadow-inner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-cyan-500 rounded"></span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Live Serial Communication Stream &amp; Console
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
            <span>PACKETS: <strong className="text-slate-300">{telemetry.packetCount}</strong></span>
            <span>ERRORS: <strong className="text-rose-400">{telemetry.errorCount}</strong></span>
            <button
              onClick={() => setSerialLogs([])}
              className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
            >
              Clear Console
            </button>
          </div>
        </div>

        {/* Command input if USB Web Serial is active */}
        {activeConnectionMode === 'usb_serial' && (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Send custom serial command (e.g., TFL20, TFH80, TFX, V)..."
              value={customSerialCmd}
              onChange={(e) => setCustomSerialCmd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCustomSerial()}
              className="bg-[#0e1626] border border-slate-700 text-xs px-3 py-1.5 rounded-lg text-slate-200 font-mono flex-1 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSendCustomSerial}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        )}

        <div className="h-44 overflow-y-auto font-mono text-[11px] text-emerald-400/80 leading-relaxed space-y-1 pr-2 select-text">
          {serialLogs.length === 0 ? (
            <div className="text-slate-600 italic py-8 text-center font-sans">
              {!telemetry.connected 
                ? 'Awaiting hardware connection. Plug ESP32 via USB or enter Wi-Fi IP to view real serial traffic.'
                : 'Serial buffer empty. Waiting for incoming UART traffic...'
              }
            </div>
          ) : (
            serialLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-baseline gap-2 py-0.5 hover:bg-slate-900/40 rounded px-1">
                <span className="text-slate-600 select-none">[{log.timestamp}]</span>
                {log.direction === 'TX' ? (
                  <span className="text-cyan-500 font-bold shrink-0">TX &rarr;</span>
                ) : log.direction === 'RX' ? (
                  <span className="text-emerald-400 font-bold shrink-0">RX &larr;</span>
                ) : log.direction === 'SYS' ? (
                  <span className="text-amber-400 font-bold shrink-0">SYS *</span>
                ) : (
                  <span className="text-rose-400 font-bold shrink-0">ERR !</span>
                )}
                <span className={log.direction === 'TX' ? 'text-cyan-300' : log.direction === 'RX' ? 'text-emerald-300' : log.direction === 'SYS' ? 'text-amber-200' : 'text-rose-300'}>
                  {log.hex}
                </span>
                {log.description && (
                  <span className="text-slate-400 font-semibold underline decoration-cyan-900/80 text-[10px]">
                    [{log.description}]
                  </span>
                )}
                <span className="text-slate-500 text-[10px]">({log.ascii})</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* Floating Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl z-50 transition-all flex items-center gap-2 ${
            toastMessage.isError
              ? 'bg-rose-950 border-rose-600 text-rose-200'
              : 'bg-[#161F33] border-cyan-500 text-cyan-200'
          }`}
        >
          {toastMessage.isError ? (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};
