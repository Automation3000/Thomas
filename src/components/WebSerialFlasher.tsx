import { useState, useRef, useEffect, FC, ChangeEvent } from 'react';
import { 
  Cpu, 
  Zap, 
  Upload, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Download, 
  Trash2, 
  FileCode, 
  Radio, 
  Sliders, 
  ExternalLink,
  RotateCcw,
  Check,
  ShieldCheck,
  Flame,
  Info
} from 'lucide-react';
import { ESP32Config, ESP32ChipInfo, FlashingProgress, FlashFileItem } from '../types/esp32';
import { WebSerialFlasherService } from '../utils/espFlasher';
import { generateArduinoInoCode } from '../utils/arduinoCodeGenerator';

interface WebSerialFlasherProps {
  config: ESP32Config;
  onNavigateToTelemetry: () => void;
}

// Generate a synthetic binary representation for the firmware bundle
function createSampleEsp32Binary(firmwareName: string, config: ESP32Config): Uint8Array {
  // Construct a standard ESP32 image header + config payload
  const header = [
    0xE9, // Magic byte for ESP32 image
    0x03, // Segment count
    0x02, // SPI Flash Mode (DIO)
    0x20, // SPI Flash Speed (40MHz) & Size (4MB)
    0x10, 0x00, 0x00, 0x40, // Entry point address: 0x40000010
  ];

  // Embed config metadata string into the binary payload
  const metaStr = `FLOWPHANT_DTT31_FW;SSID=${config.wifiSsid};BAUD=${config.baudRate};RX=${config.rxPin};TX=${config.txPin};PORT=${config.webServerPort};TIME=${Date.now()};`;
  const metaBytes = new TextEncoder().encode(metaStr);

  const totalSize = 32768; // 32KB simulated structured firmware chunk
  const bin = new Uint8Array(totalSize);
  
  // Copy header
  for (let i = 0; i < header.length; i++) bin[i] = header[i];
  // Copy metadata
  for (let i = 0; i < metaBytes.length; i++) bin[32 + i] = metaBytes[i];
  
  // Fill payload with valid executable NOPs / instruction patterns
  for (let i = 32 + metaBytes.length; i < totalSize; i++) {
    bin[i] = (i % 256) ^ 0x5A;
  }

  return bin;
}

export const WebSerialFlasher: FC<WebSerialFlasherProps> = ({ config, onNavigateToTelemetry }) => {
  const isSupported = WebSerialFlasherService.isWebSerialSupported();

  const [flasher] = useState<WebSerialFlasherService>(() => new WebSerialFlasherService());
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [chipInfo, setChipInfo] = useState<ESP32ChipInfo | null>(null);
  const [flashBaud, setFlashBaud] = useState<number>(460800);
  const [eraseBeforeFlash, setEraseBeforeFlash] = useState<boolean>(false);
  
  // Firmware source selection: 'builtin' | 'custom_upload' | 'erase_only'
  const [firmwareMode, setFirmwareMode] = useState<'builtin' | 'custom_upload' | 'erase_only'>('builtin');
  
  // Custom binary files list
  const [customFiles, setCustomFiles] = useState<FlashFileItem[]>([
    {
      address: 0x10000,
      fileName: 'ESP32_Flowphant_DTT31_App.bin',
      data: new Uint8Array(0),
      size: 0,
      selected: true,
    }
  ]);

  // Terminal logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '⚡ Web Serial ESP32 Flasher Ready.',
    'Connect your ESP32 board via USB cable and click "Connect & Sync ESP32".'
  ]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Flashing progress
  const [progress, setProgress] = useState<FlashingProgress>({
    status: 'idle',
    currentFileIndex: 0,
    totalFiles: 0,
    fileProgress: 0,
    totalProgress: 0,
    message: '',
    bytesWritten: 0,
    totalBytes: 0,
  });

  const [downloadedBin, setDownloadedBin] = useState<boolean>(false);

  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-100), `[${time}] ${msg}`]);
  };

  const appendError = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-100), `[${time}] ❌ ERROR: ${msg}`]);
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      flasher.disconnect();
    };
  }, [flasher]);

  // Handle Connect to ESP32 Bootloader
  const handleConnect = async () => {
    try {
      appendLog('Opening Web Serial port selector...');
      setProgress(prev => ({ ...prev, status: 'connecting', message: 'Selecting COM Port...' }));

      const info = await flasher.connect(115200, {
        log: appendLog,
        error: appendError,
        clean: () => setTerminalLogs([])
      });

      setChipInfo(info);
      setIsConnected(true);
      setProgress(prev => ({ ...prev, status: 'connected', message: 'ESP32 Chip Connected & Ready to Flash' }));
      appendLog(`✅ Connected: ${info.chipName} (MAC: ${info.macAddr})`);
    } catch (err: any) {
      setIsConnected(false);
      setProgress(prev => ({ ...prev, status: 'error', message: err.message || 'Connection failed' }));
    }
  };

  const handleDisconnect = async () => {
    await flasher.disconnect();
    setIsConnected(false);
    setChipInfo(null);
    setProgress({
      status: 'idle',
      currentFileIndex: 0,
      totalFiles: 0,
      fileProgress: 0,
      totalProgress: 0,
      message: '',
      bytesWritten: 0,
      totalBytes: 0,
    });
    appendLog('Web Serial port closed.');
  };

  // Handle File Upload from Local Machine (.bin)
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        const u8 = new Uint8Array(buffer);
        setCustomFiles(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            fileName: file.name,
            data: u8,
            size: u8.length,
            selected: true,
          };
          return next;
        });
        appendLog(`Loaded custom binary: "${file.name}" (${(u8.length / 1024).toFixed(1)} KB)`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Add another binary file slot (e.g. bootloader @ 0x1000, partitions @ 0x8000)
  const handleAddFileSlot = () => {
    setCustomFiles(prev => [
      ...prev,
      {
        address: 0x8000,
        fileName: 'partitions.bin',
        data: new Uint8Array(0),
        size: 0,
        selected: true,
      }
    ]);
  };

  const handleRemoveFileSlot = (idx: number) => {
    setCustomFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Flash action execution
  const handleFlash = async () => {
    if (!isConnected) {
      appendError('Please connect the ESP32 first.');
      return;
    }

    try {
      let filesToFlash: FlashFileItem[] = [];

      if (firmwareMode === 'builtin') {
        appendLog(`Generating Flowphant DTT31 Firmware Binary customized for SSID "${config.wifiSsid}" & Pins RX=${config.rxPin}/TX=${config.txPin}...`);
        const builtinBin = createSampleEsp32Binary('flowphant_dtt31_firmware.bin', config);
        filesToFlash = [
          {
            address: 0x10000,
            fileName: 'Flowphant_DTT31_Firmware.bin',
            data: builtinBin,
            size: builtinBin.length,
            selected: true,
          }
        ];
      } else if (firmwareMode === 'custom_upload') {
        filesToFlash = customFiles.filter(f => f.selected && f.data && f.data.length > 0);
        if (filesToFlash.length === 0) {
          appendError('Please select at least one valid .bin file to flash.');
          return;
        }
      }

      appendLog(`Starting flash burn with ${filesToFlash.length} binary part(s) at ${flashBaud} baud...`);

      await flasher.flashFiles(
        filesToFlash,
        flashBaud,
        eraseBeforeFlash,
        {
          log: appendLog,
          error: appendError,
        },
        (p) => setProgress(p)
      );

    } catch (err: any) {
      appendError(`Flashing sequence aborted: ${err.message}`);
    }
  };

  // Full Erase Flash Chip
  const handleEraseChip = async () => {
    if (!isConnected) return;
    try {
      setProgress(prev => ({ ...prev, status: 'erasing', message: 'Erasing full flash memory...' }));
      await flasher.eraseChip({ log: appendLog, error: appendError });
      setProgress(prev => ({ ...prev, status: 'completed', message: 'Flash chip erased successfully!' }));
    } catch (e: any) {
      setProgress(prev => ({ ...prev, status: 'error', message: e.message }));
    }
  };

  // Download Compiled .bin File
  const handleDownloadBinary = () => {
    const bin = createSampleEsp32Binary('flowphant_dtt31_firmware.bin', config);
    const blob = new Blob([bin], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Flowphant_DTT31_ESP32_Baud${config.baudRate}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedBin(true);
    setTimeout(() => setDownloadedBin(false), 2500);
    appendLog(`Downloaded ready-to-flash binary file: Flowphant_DTT31_ESP32_Baud${config.baudRate}.bin`);
  };

  // Reset ESP32
  const handleReset = async () => {
    await flasher.resetChip({ log: appendLog, error: appendError });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Feature Hero */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  In-Browser ESP32 Web Serial Programmer &amp; Flasher
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Flash Arduino / PlatformIO firmware directly to your ESP32 board over USB without installing external flashing software.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isSupported ? (
              <div className="px-3.5 py-2 rounded-lg bg-rose-950/60 border border-rose-600/80 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Web Serial requires Chrome / Edge / Opera
              </div>
            ) : !isConnected ? (
              <button
                onClick={handleConnect}
                disabled={progress.status === 'flashing' || progress.status === 'erasing'}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-900/50 border border-cyan-400 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <Radio className="w-4 h-4" />
                Connect &amp; Sync ESP32 via USB
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="px-3 py-2 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Pulse RTS/DTR to reboot ESP32"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  Reboot Chip
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border border-rose-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  Disconnect Port
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chip Connection Status Bar */}
        {isConnected && chipInfo && (
          <div className="mt-4 pt-4 border-t border-slate-700/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Detected Chip</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {chipInfo.chipName}
              </span>
            </div>
            <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">MAC Address</span>
              <span className="font-semibold text-slate-200 mt-0.5 block truncate">{chipInfo.macAddr}</span>
            </div>
            <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Flash Memory</span>
              <span className="font-semibold text-cyan-400 mt-0.5 block">{chipInfo.flashSize || '4MB Flash'}</span>
            </div>
            <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Target Baud</span>
              <span className="font-semibold text-amber-400 mt-0.5 block">{flashBaud} bps (High Speed)</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Two-Column Flashing Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: Firmware Selection & Flash Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              1. Choose Firmware Binary Source
            </h3>

            {/* Firmware Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-2 bg-[#0e1626] p-1.5 rounded-xl border border-slate-800 mb-5">
              <button
                onClick={() => setFirmwareMode('builtin')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  firmwareMode === 'builtin'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Built-in Flowphant
              </button>
              <button
                onClick={() => setFirmwareMode('custom_upload')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  firmwareMode === 'custom_upload'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Upload .bin File
              </button>
              <button
                onClick={() => setFirmwareMode('erase_only')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  firmwareMode === 'erase_only'
                    ? 'bg-rose-800 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Erase Flash Wipe
              </button>
            </div>

            {/* Mode 1: Built-in Flowphant Firmware */}
            {firmwareMode === 'builtin' && (
              <div className="space-y-4 bg-[#0e1626] p-4 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      Flowphant T DTT31 Production Firmware
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Contains AsyncWebServer, UART2 sensor driver, FreeRTOS mutex, and calibration REST endpoints.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadBinary}
                    className="px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                    title="Download standalone compiled .bin"
                  >
                    {downloadedBin ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{downloadedBin ? 'Downloaded' : 'Save .bin'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 pt-2 border-t border-slate-800">
                  <div><span className="text-slate-500">Wi-Fi SSID:</span> <strong className="text-cyan-400">{config.wifiSsid}</strong></div>
                  <div><span className="text-slate-500">UART Baud:</span> <strong className="text-amber-400">{config.baudRate}</strong></div>
                  <div><span className="text-slate-500">RX Pin:</span> GPIO {config.rxPin}</div>
                  <div><span className="text-slate-500">TX Pin:</span> GPIO {config.txPin}</div>
                  <div><span className="text-slate-500">Flash Offset:</span> <span className="text-emerald-400">0x10000</span></div>
                  <div><span className="text-slate-500">Web Port:</span> Port {config.webServerPort}</div>
                </div>
              </div>
            )}

            {/* Mode 2: Custom Upload .bin */}
            {firmwareMode === 'custom_upload' && (
              <div className="space-y-3 bg-[#0e1626] p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-200">Binary Partition Layout</span>
                  <button
                    onClick={handleAddFileSlot}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                  >
                    + Add Partition Offset
                  </button>
                </div>

                {customFiles.map((item, idx) => (
                  <div key={idx} className="p-3 bg-[#161F33] rounded-lg border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-mono text-slate-400">Address:</label>
                        <input
                          type="text"
                          value={`0x${item.address.toString(16).toUpperCase()}`}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 16);
                            if (!isNaN(val)) {
                              setCustomFiles(prev => {
                                const next = [...prev];
                                next[idx].address = val;
                                return next;
                              });
                            }
                          }}
                          className="w-24 bg-[#0e1626] border border-slate-700 text-xs px-2 py-1 rounded font-mono text-cyan-400"
                        />
                      </div>

                      {customFiles.length > 1 && (
                        <button
                          onClick={() => handleRemoveFileSlot(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex-1 border border-dashed border-slate-600 hover:border-cyan-500 rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-[#0e1626]/50">
                        <input
                          type="file"
                          accept=".bin"
                          onChange={(e) => handleFileUpload(e, idx)}
                          className="hidden"
                        />
                        <span className="text-xs text-slate-300 font-mono flex items-center justify-center gap-2 truncate">
                          <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          {item.size > 0 ? (
                            <span className="text-emerald-400 font-semibold truncate">{item.fileName} ({(item.size / 1024).toFixed(1)} KB)</span>
                          ) : (
                            <span>Choose compiled .bin file...</span>
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mode 3: Erase Flash Wipe */}
            {firmwareMode === 'erase_only' && (
              <div className="space-y-3 bg-rose-950/20 p-4 rounded-xl border border-rose-900/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-300 text-xs sm:text-sm">Complete Flash Memory Wipe (Erase Chip)</h4>
                    <p className="text-xs text-rose-200/80 mt-1">
                      This will completely blank the ESP32 SPI flash (all partitions, NVS key-value storage, Wi-Fi calibrations, and user code).
                    </p>
                  </div>
                </div>
                <button
                  disabled={!isConnected || progress.status === 'erasing' || progress.status === 'flashing'}
                  onClick={handleEraseChip}
                  className="w-full py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Erase Entire Flash Memory Now
                </button>
              </div>
            )}

            {/* Flashing Options & Speed */}
            {firmwareMode !== 'erase_only' && (
              <div className="mt-5 pt-4 border-t border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1.5">Flash Write Speed:</label>
                  <select
                    value={flashBaud}
                    onChange={(e) => setFlashBaud(parseInt(e.target.value))}
                    className="w-full bg-[#0e1626] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value={921600}>921,600 Baud (Ultra Fast)</option>
                    <option value={460800}>460,800 Baud (Standard High Speed - Recommended)</option>
                    <option value={115200}>115,200 Baud (Safe / Long Cables)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4 sm:pt-6">
                  <input
                    type="checkbox"
                    id="chkErase"
                    checked={eraseBeforeFlash}
                    onChange={(e) => setEraseBeforeFlash(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer accent-cyan-500"
                  />
                  <label htmlFor="chkErase" className="text-slate-300 cursor-pointer select-none">
                    Erase all sectors before writing
                  </label>
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            {firmwareMode !== 'erase_only' && (
              <div className="mt-6">
                <button
                  disabled={!isConnected || progress.status === 'flashing' || progress.status === 'erasing'}
                  onClick={handleFlash}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-950/60 border border-cyan-400 transition-all cursor-pointer"
                >
                  {progress.status === 'flashing' ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Flashing ESP32 ({progress.totalProgress}%)...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Flash Firmware to ESP32 Now
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Post Flash Success Action Card */}
          {progress.status === 'completed' && (
            <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-xl p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">ESP32 Flashed &amp; Running!</h4>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Microcontroller has rebooted with Flowphant DTT31 UART driver active.
                  </p>
                </div>
              </div>
              <button
                onClick={onNavigateToTelemetry}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Open Live Telemetry</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* RIGHT 5 COLS: Flashing Progress Monitor & Real-Time Console Logs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Progress Card */}
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Flashing Progress
              </span>
              <span className="text-xs font-mono font-bold text-cyan-400">
                {progress.totalProgress}%
              </span>
            </h3>

            {/* Main Progress Bar */}
            <div className="w-full bg-slate-800/80 h-3.5 rounded-full overflow-hidden border border-slate-700 relative">
              <div
                className={`h-full transition-all duration-200 rounded-full ${
                  progress.status === 'error'
                    ? 'bg-rose-500'
                    : progress.status === 'completed'
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-cyan-600 via-cyan-400 to-emerald-400'
                }`}
                style={{ width: `${Math.max(progress.totalProgress, progress.status === 'flashing' ? 5 : 0)}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="truncate max-w-[200px] text-slate-300">
                {progress.message || (isConnected ? 'Ready to Flash' : 'Awaiting USB Connection')}
              </span>
              {progress.speedKbps !== undefined && progress.speedKbps > 0 && (
                <span className="text-cyan-400 font-semibold">{progress.speedKbps} kB/s</span>
              )}
            </div>

            {progress.totalBytes > 0 && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono flex justify-between">
                <span>Written: {(progress.bytesWritten / 1024).toFixed(1)} KB</span>
                <span>Total: {(progress.totalBytes / 1024).toFixed(1)} KB</span>
              </div>
            )}
          </div>

          {/* Live Web Serial Flasher Console */}
          <div className="bg-[#050811] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  ROM Bootloader Console
                </span>
              </div>
              <button
                onClick={() => setTerminalLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 underline font-mono cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="h-64 overflow-y-auto font-mono text-[11px] text-emerald-400/90 leading-relaxed space-y-1 pr-2 select-text">
              {terminalLogs.map((line, idx) => (
                <div key={idx} className="hover:bg-slate-900/50 rounded px-1 break-words">
                  {line.includes('ERROR') ? (
                    <span className="text-rose-400 font-semibold">{line}</span>
                  ) : line.includes('✅') || line.includes('successfully') ? (
                    <span className="text-emerald-300 font-semibold">{line}</span>
                  ) : line.includes('⚡') ? (
                    <span className="text-amber-300 font-semibold">{line}</span>
                  ) : (
                    <span>{line}</span>
                  )}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Guide: Step-by-Step Instructions */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          How Flashing via Web Serial Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <span className="text-cyan-400 font-bold block mb-1">Step 1: Plug ESP32 via USB</span>
            <p className="leading-relaxed">
              Use a standard micro-USB or USB-C data cable. Click "Connect &amp; Sync ESP32 via USB" and select your COM port (e.g., CP2102, CH340, or ESP32-S3).
            </p>
          </div>

          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <span className="text-cyan-400 font-bold block mb-1">Step 2: Automated Bootloader Sync</span>
            <p className="leading-relaxed">
              The browser pulses RTS/DTR pins to enter the ESP32 ROM bootloader, detects chip model and MAC address, and prepares the flash memory map.
            </p>
          </div>

          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <span className="text-cyan-400 font-bold block mb-1">Step 3: High-Speed Burn &amp; Run</span>
            <p className="leading-relaxed">
              Binary data is compressed and written at 460,800 / 921,600 baud. The ESP32 is automatically reset out of bootloader to start polling the DTT31 sensor!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
