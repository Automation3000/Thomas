import React, { useState, useEffect, useRef } from 'react';
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
  Cpu
} from 'lucide-react';
import { ESP32Config, SensorTelemetry, SerialLogMessage } from '../types/esp32';
import { PROTOCOL_COMMANDS, formatHexSpaced, bytesToAscii, calculateDTT31BCC } from '../data/protocolData';

interface LiveSimulatorProps {
  config: ESP32Config;
}

export const LiveSimulator: React.FC<LiveSimulatorProps> = ({ config }) => {
  // Physical Process Simulation States
  const [fluidFlow, setFluidFlow] = useState<number>(45.8);
  const [fluidTemp, setFluidTemp] = useState<number>(24.3);
  const [isFlowing, setIsFlowing] = useState<boolean>(true);
  const [sensorOnline, setSensorOnline] = useState<boolean>(true);
  const [simulateNoise, setSimulateNoise] = useState<boolean>(true);

  // ESP32 Telemetry State (Simulating what ESP32 parsed from UART)
  const [telemetry, setTelemetry] = useState<SensorTelemetry>({
    flowPercent: 45.8,
    temperatureC: 24.3,
    temperatureF: 75.7,
    connected: true,
    status: 'NORMAL',
    lastUpdatedMs: Date.now(),
    rawHexResponse: '01 30 31 02 46 30 34 35 2E 38 54 30 32 34 2E 33 03 7D',
    rawAsciiResponse: '<SOH>01<STX>F045.8T024.3<ETX>}',
    packetCount: 142,
    errorCount: 0,
    rssi: -58,
    freeHeap: 184520,
    uptimeSeconds: 320,
  });

  // History for trend sparkline
  const [flowHistory, setFlowHistory] = useState<number[]>([44, 45, 46, 45.2, 45.8, 46.1, 45.5, 45.8]);

  // Serial Monitor Log Buffer
  const [serialLogs, setSerialLogs] = useState<SerialLogMessage[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Calibration sequence interactive state
  const [calibState, setCalibState] = useState<{
    inProgress: boolean;
    type: 'min' | 'max' | 'exit' | null;
    currentStep: number;
    totalSteps: number;
    message: string;
    success: boolean | null;
  }>({
    inProgress: false,
    type: null,
    currentStep: 0,
    totalSteps: 2,
    message: '',
    success: null,
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
    setSerialLogs((prev) => [...prev.slice(-40), newLog]);
  };

  // Polling simulation loop (mirrors ESP32 non-blocking poll loop)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!calibState.inProgress) {
        // Apply slight physical noise if enabled
        let currentFlow = fluidFlow;
        let currentTemp = fluidTemp;
        if (simulateNoise && sensorOnline) {
          const deltaFlow = (Math.random() - 0.5) * 0.4;
          const deltaTemp = (Math.random() - 0.5) * 0.1;
          currentFlow = Math.max(0, Math.min(100, +(fluidFlow + deltaFlow).toFixed(1)));
          currentTemp = Math.max(-20, Math.min(100, +(fluidTemp + deltaTemp).toFixed(1)));
        }

        // ESP32 sends POLLING_CMD (R1000)
        const pollCmd = PROTOCOL_COMMANDS.find(c => c.id === 'poll')!;
        const txHex = formatHexSpaced(pollCmd.hexBytes);
        const txAscii = pollCmd.asciiEquivalent;

        if (sensorOnline) {
          // Construct simulated DTT31 UART frame: <SOH>01<STX>F{flow}T{temp}<ETX>{BCC}
          const flowStr = 'F' + (currentFlow < 100 ? (currentFlow < 10 ? '00' : '0') : '') + currentFlow.toFixed(1);
          const tempStr = 'T' + (currentTemp >= 0 ? (currentTemp < 10 ? '00' : '0') : '') + currentTemp.toFixed(1);
          const payloadStr = flowStr + tempStr; // e.g. F045.8T024.3

          const rxBytes: number[] = [0x01, 0x30, 0x31, 0x02];
          for (let i = 0; i < payloadStr.length; i++) {
            rxBytes.push(payloadStr.charCodeAt(i));
          }
          rxBytes.push(0x03);
          const bcc = calculateDTT31BCC(rxBytes);
          rxBytes.push(bcc);

          const rxHex = formatHexSpaced(rxBytes);
          const rxAscii = bytesToAscii(rxBytes);

          setTelemetry((prev) => ({
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
          }));

          setFlowHistory((prev) => [...prev.slice(-15), currentFlow]);
          addLog('TX', txHex, txAscii, 'ESP32 Polling Register R1000');
          addLog('RX', rxHex, rxAscii, `Echo: Flow=${currentFlow}%, Temp=${currentTemp}°C`);
        } else {
          // Timeout
          setTelemetry((prev) => ({
            ...prev,
            connected: false,
            status: 'OFFLINE',
            errorCount: prev.errorCount + 1,
            lastUpdatedMs: Date.now(),
          }));
          addLog('TX', txHex, txAscii, 'ESP32 Polling Register R1000');
          addLog('ERR', '-- -- --', 'TIMEOUT: No UART echo received from DTT31', 'Timeout (150ms)');
        }
      }
    }, config.pollIntervalMs || 1500);

    return () => clearInterval(interval);
  }, [fluidFlow, fluidTemp, sensorOnline, simulateNoise, calibState.inProgress, config.pollIntervalMs]);

  // Scroll serial logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLogs]);

  // Execute Calibration Sequence (Simulates ESP32 POST /api/calibrate/min or /api/calibrate/max)
  const runCalibration = async (type: 'min' | 'max' | 'exit') => {
    if (calibState.inProgress) return;

    if (!sensorOnline) {
      showToast('Cannot calibrate: Sensor is offline/unresponsive!', true);
      return;
    }

    setCalibState({
      inProgress: true,
      type,
      currentStep: 1,
      totalSteps: type === 'exit' ? 1 : 2,
      message: type === 'min' ? 'Step 1/2: Sending TFL20 (Teach Min 20%)...' : type === 'max' ? 'Step 1/2: Sending TFH80 (Teach Max 80%)...' : 'Sending TFX (Exit/Ack)...',
      success: null,
    });

    if (type === 'exit') {
      const exitCmd = PROTOCOL_COMMANDS.find(c => c.id === 'calib_exit')!;
      addLog('TX', formatHexSpaced(exitCmd.hexBytes), exitCmd.asciiEquivalent, 'ESP32 Sending CMD_CALIB_EXIT (TFX)');
      await new Promise(r => setTimeout(r, 400));
      const ackBytes = [0x01, 0x30, 0x31, 0x02, 0x41, 0x43, 0x4B, 0x03, 0x27];
      addLog('RX', formatHexSpaced(ackBytes), bytesToAscii(ackBytes), 'Sensor ACK received (OK prompt cleared)');
      setCalibState({ inProgress: false, type: null, currentStep: 0, totalSteps: 1, message: 'TFX Executed', success: true });
      showToast('Calibration screen cleared (TFX Ack)', false);
      return;
    }

    // Step 1: Send Teach Command
    const teachCmd = type === 'min' 
      ? PROTOCOL_COMMANDS.find(c => c.id === 'learn_min')!
      : PROTOCOL_COMMANDS.find(c => c.id === 'learn_max')!;

    addLog('TX', formatHexSpaced(teachCmd.hexBytes), teachCmd.asciiEquivalent, `ESP32 Sending ${teachCmd.name}`);
    await new Promise(r => setTimeout(r, 600));

    // Simulated Sensor OK Response
    const okBytes = [0x01, 0x30, 0x31, 0x02, 0x4F, 0x4B, 0x03, 0x3E]; // "OK"
    addLog('RX', formatHexSpaced(okBytes), bytesToAscii(okBytes), 'DTT31 Sensor Display: "OK" Confirmation');

    // Step 2: Auto Exit / Acknowledge (TFX)
    setCalibState(prev => ({
      ...prev,
      currentStep: 2,
      message: 'Step 2/2: Sending TFX (Clear OK screen & Commit)...',
    }));

    await new Promise(r => setTimeout(r, 500));
    const exitCmd = PROTOCOL_COMMANDS.find(c => c.id === 'calib_exit')!;
    addLog('TX', formatHexSpaced(exitCmd.hexBytes), exitCmd.asciiEquivalent, 'ESP32 Sending CMD_CALIB_EXIT (TFX)');
    await new Promise(r => setTimeout(r, 400));
    const ackBytes = [0x01, 0x30, 0x31, 0x02, 0x41, 0x43, 0x4B, 0x03, 0x27];
    addLog('RX', formatHexSpaced(ackBytes), bytesToAscii(ackBytes), 'Sensor Flash Stored & Return to Normal Run Mode');

    setCalibState({
      inProgress: false,
      type: null,
      currentStep: 2,
      totalSteps: 2,
      message: `${type === 'min' ? '20% Minimum Flow' : '80% Maximum Flow'} Calibrated and Acknowledged!`,
      success: true,
    });

    showToast(`Success: ${type === 'min' ? '20% Minimum' : '80% Maximum'} Flow taught and committed!`, false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Device Identity */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">ESP32 &times; Flowphant™ T Controller</span>
              {telemetry.connected ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  UART-2 CONNECTED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 font-mono">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  SENSOR OFFLINE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulating non-blocking UART polling at {config.pollIntervalMs}ms interval with FreeRTOS mutex protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex flex-col md:items-end">
            <span className="text-[10px] uppercase text-slate-500 font-bold">Network IP</span>
            <span className="text-cyan-400">192.168.1.105:80</span>
          </div>
          <div className="flex flex-col md:items-end border-l border-slate-700 pl-4">
            <span className="text-[10px] uppercase text-slate-500 font-bold">UART Baud</span>
            <span className="text-slate-200">{config.baudRate} (8N1)</span>
          </div>
          <div className="flex flex-col md:items-end border-l border-slate-700 pl-4">
            <span className="text-[10px] uppercase text-slate-500 font-bold">GPIO Pins</span>
            <span className="text-slate-200">RX:{config.rxPin} TX:{config.txPin}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: 8 Cols (Metrics & Telemetry) + 4 Cols (Calibration & Controls) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 8 COLS: Telemetry Gauges + Chart + Embedded Browser */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Dual Big Telemetry Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Live Flow Rate Card */}
            <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center relative shadow-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500"></div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2 font-bold flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Live Flow Rate
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-5xl sm:text-7xl font-bold text-white tracking-tighter font-mono">
                  {telemetry.connected ? telemetry.flowPercent.toFixed(1) : '--.-'}
                </span>
                <span className="text-xl sm:text-2xl text-cyan-400 font-medium font-mono">%</span>
              </div>
              <div className="w-full mt-6 bg-slate-800/50 h-3 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, telemetry.flowPercent))}%` }}
                ></div>
              </div>
              <div className="mt-3 flex justify-between w-full text-[10px] text-slate-500 font-mono">
                <span>0.0% (MIN)</span>
                <span className="text-cyan-400/80">CALIBRATED BAND: 20% - 80%</span>
                <span>100.0% (MAX)</span>
              </div>
            </div>

            {/* Sensor Temp Card */}
            <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center relative shadow-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2 font-bold flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                Sensor Temp
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-5xl sm:text-7xl font-bold text-white tracking-tighter font-mono">
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
                  style={{ width: `${Math.max(0, Math.min(100, (telemetry.temperatureC / 80) * 100))}%` }}
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
                Real-time Telemetry ({config.pollIntervalMs / 1000}s interval)
              </h3>
              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span> Flow Trend ({telemetry.flowPercent.toFixed(1)}%)
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Thermal Stability ({telemetry.temperatureC.toFixed(1)}°C)
                </span>
              </div>
            </div>

            {/* Sparkline Canvas / Dynamic Graph */}
            <div className="h-40 border-l border-b border-slate-700/70 relative flex items-end overflow-hidden rounded-bl-sm">
              <div className="absolute inset-0 grid grid-cols-6 pointer-events-none">
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
                <div className="border-r border-slate-800/40"></div>
              </div>

              {/* Dynamic Bars Trend */}
              <div className="relative z-10 w-full h-full flex items-end gap-1 px-1 pt-4">
                {flowHistory.map((val, idx) => {
                  const heightPct = Math.max(10, Math.min(95, val));
                  return (
                    <div key={idx} className="flex-1 h-full flex flex-col justify-end items-center group">
                      <div
                        className="w-full bg-gradient-to-t from-cyan-600/70 to-cyan-400 rounded-t-sm transition-all duration-300 group-hover:bg-cyan-300"
                        style={{ height: `${heightPct}%` }}
                      ></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2">
              <span>-30s</span>
              <span>-20s</span>
              <span>-10s</span>
              <span className="text-cyan-400 font-semibold">LIVE NOW</span>
            </div>
          </div>

          {/* Physical Process Simulator Controls */}
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/80">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Physical Process & Sensor Simulator</h3>
              </div>
              <button
                onClick={() => setSensorOnline(!sensorOnline)}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                  sensorOnline
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}
              >
                {sensorOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {sensorOnline ? 'SENSOR ONLINE' : 'SIMULATE OFFLINE'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
              {/* Flow Velocity Slider */}
              <div className="bg-[#0e1626] p-3.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-slate-300 mb-1.5 font-medium">
                  <span>Fluid Flow Velocity:</span>
                  <span className="font-mono text-cyan-400 font-bold">{fluidFlow.toFixed(1)} %</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={fluidFlow}
                  onChange={(e) => setFluidFlow(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
                  <button onClick={() => setFluidFlow(20)} className="hover:text-cyan-400 transition-colors">20% (Min)</button>
                  <button onClick={() => setFluidFlow(50)} className="hover:text-cyan-400 transition-colors">50% (Nom)</button>
                  <button onClick={() => setFluidFlow(80)} className="hover:text-cyan-400 transition-colors">80% (Max)</button>
                </div>
              </div>

              {/* Fluid Temperature Slider */}
              <div className="bg-[#0e1626] p-3.5 rounded-lg border border-slate-800">
                <div className="flex justify-between text-slate-300 mb-1.5 font-medium">
                  <span>Fluid Temperature:</span>
                  <span className="font-mono text-emerald-400 font-bold">{fluidTemp.toFixed(1)} &deg;C</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="80"
                  step="0.5"
                  value={fluidTemp}
                  onChange={(e) => setFluidTemp(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
                  <button onClick={() => setFluidTemp(15)} className="hover:text-emerald-400 transition-colors">15&deg;C (Cold)</button>
                  <button onClick={() => setFluidTemp(25)} className="hover:text-emerald-400 transition-colors">25&deg;C (Ambient)</button>
                  <button onClick={() => setFluidTemp(65)} className="hover:text-emerald-400 transition-colors">65&deg;C (Hot)</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT 4 COLS: Device Calibration Actions & System Health */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-6 flex flex-col shadow-2xl h-full">
            <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              Device Calibration Actions
            </h3>

            {/* Calibration Progress Notification */}
            {calibState.inProgress && (
              <div className="mb-4 p-3 bg-cyan-950/60 border border-cyan-700/80 rounded-xl flex items-center gap-3 animate-pulse">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                <span className="text-xs text-cyan-200 font-mono">{calibState.message}</span>
              </div>
            )}

            {/* Action Buttons as in Design Theme */}
            <div className="space-y-3.5">
              {/* Button 1: Learn Min Flow */}
              <button
                disabled={calibState.inProgress}
                onClick={() => runCalibration('min')}
                className="w-full bg-[#1e293b] hover:bg-[#25334a] disabled:opacity-50 border border-slate-600 text-white rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer shadow-md"
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
                disabled={calibState.inProgress}
                onClick={() => runCalibration('max')}
                className="w-full bg-[#1e293b] hover:bg-[#25334a] disabled:opacity-50 border border-slate-600 text-white rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer shadow-md"
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
                disabled={calibState.inProgress}
                onClick={() => runCalibration('exit')}
                className="w-full bg-orange-950/20 hover:bg-orange-950/30 disabled:opacity-50 border border-orange-900/50 text-orange-400 rounded-xl p-4 sm:p-5 transition-all flex items-center justify-between group cursor-pointer"
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
                System Health & Hardware
              </h4>
              <div className="grid grid-cols-2 gap-y-3 text-[11px] font-mono">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">CPU Temperature</span>
                  <span className="text-slate-200 font-semibold">42.1 &deg;C</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">WiFi Signal (RSSI)</span>
                  <span className="text-emerald-400 font-semibold">Excellent (-58 dBm)</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">Free Heap SRAM</span>
                  <span className="text-slate-200 font-semibold">224,192 Bytes</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[9px] uppercase font-bold">UART Baudrate</span>
                  <span className="text-cyan-400 font-semibold">{config.baudRate} (8N1)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Raw UART Communication Stream (Serial2) */}
      <div className="bg-[#050811] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col shadow-inner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-cyan-500 rounded"></span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Raw UART Communication Stream (Serial2)
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
            <span>PINS: RX={config.rxPin} TX={config.txPin}</span>
            <span>PACKETS: <strong className="text-slate-300">{telemetry.packetCount}</strong></span>
            <span>ERRORS: <strong className="text-rose-400">{telemetry.errorCount}</strong></span>
            <button
              onClick={() => setSerialLogs([])}
              className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
            >
              Clear Log
            </button>
          </div>
        </div>

        <div className="h-44 overflow-y-auto font-mono text-[11px] text-emerald-400/80 leading-relaxed space-y-1 pr-2 select-text">
          {serialLogs.length === 0 ? (
            <div className="text-slate-600 italic py-8 text-center font-sans">
              Waiting for UART traffic on GPIO {config.rxPin} & {config.txPin}...
            </div>
          ) : (
            serialLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-baseline gap-2 py-0.5 hover:bg-slate-900/40 rounded px-1">
                <span className="text-slate-600 select-none">[{log.timestamp}]</span>
                {log.direction === 'TX' ? (
                  <span className="text-cyan-500 font-bold shrink-0">TX &rarr;</span>
                ) : log.direction === 'RX' ? (
                  <span className="text-emerald-400 font-bold shrink-0">RX &larr;</span>
                ) : (
                  <span className="text-rose-400 font-bold shrink-0">ERR !</span>
                )}
                <span className={log.direction === 'TX' ? 'text-cyan-300' : log.direction === 'RX' ? 'text-emerald-300' : 'text-rose-300'}>
                  {log.hex}
                </span>
                {log.description && (
                  <span className="text-slate-400 font-semibold underline decoration-cyan-900/80 text-[10px]">
                    [{log.description}]
                  </span>
                )}
                <span className="text-slate-600 text-[10px]">({log.ascii})</span>
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
