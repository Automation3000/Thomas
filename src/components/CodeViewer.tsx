import React, { useState } from 'react';
import { Download, Copy, Check, FileCode, Sliders, ShieldCheck, Terminal, Cpu, Info, Globe, BookOpen } from 'lucide-react';
import { ESP32Config } from '../types/esp32';
import { 
  generateArduinoInoCode, 
  generatePlatformIoIni, 
  generateMainCpp, 
  generateDataIndexHtml, 
  generateReadmeMd, 
  generateModularHeader 
} from '../utils/arduinoCodeGenerator';

interface CodeViewerProps {
  config: ESP32Config;
  onOpenConfig: () => void;
}

type ProjectFileType = 'main_cpp' | 'platformio' | 'index_html' | 'readme' | 'ino' | 'header';

export const CodeViewer: React.FC<CodeViewerProps> = ({ config, onOpenConfig }) => {
  const [selectedFile, setSelectedFile] = useState<ProjectFileType>('main_cpp');
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const mainCppCode = generateMainCpp(config);
  const platformioCode = generatePlatformIoIni();
  const indexHtmlCode = generateDataIndexHtml();
  const readmeCode = generateReadmeMd(config);
  const inoCode = generateArduinoInoCode(config);
  const headerCode = generateModularHeader();

  const getActiveCode = () => {
    switch (selectedFile) {
      case 'main_cpp': return mainCppCode;
      case 'platformio': return platformioCode;
      case 'index_html': return indexHtmlCode;
      case 'readme': return readmeCode;
      case 'ino': return inoCode;
      case 'header': return headerCode;
    }
  };

  const getFileName = (fileType: ProjectFileType) => {
    switch (fileType) {
      case 'main_cpp': return 'src/main.cpp';
      case 'platformio': return 'platformio.ini';
      case 'index_html': return 'data/index.html';
      case 'readme': return 'README.md';
      case 'ino': return 'ESP32_Flowphant_DTT31.ino';
      case 'header': return 'include/FlowphantDTT31.h';
    }
  };

  const activeCode = getActiveCode();
  const currentFileName = getFileName(selectedFile);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const rawName = currentFileName.split('/').pop() || currentFileName;
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = rawName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const codeLines = activeCode.split('\n');

  return (
    <div className="space-y-6">
      {/* Code Header and Quick Info */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                Production-Ready PlatformIO &amp; Arduino ESP32 Project
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" /> REPO READY
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Complete GitHub project repository structure featuring <span className="text-cyan-400 font-mono">platformio.ini</span>, <span className="text-cyan-400 font-mono">src/main.cpp</span>, <span className="text-cyan-400 font-mono">data/index.html</span>, and <span className="text-cyan-400 font-mono">README.md</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenConfig}
              className="px-3 py-2 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <Sliders className="w-4 h-4 text-cyan-400" />
              Configure Settings
            </button>

            <button
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-white border border-slate-600 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              {copied ? 'Copied File!' : `Copy ${currentFileName}`}
            </button>

            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-900/40 border border-cyan-500 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download {currentFileName}
            </button>
          </div>
        </div>

        {/* Quick parameters summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-700/80 text-xs font-mono">
          <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Wi-Fi Target</span>
            <span className="font-semibold text-slate-200 truncate block mt-0.5">{config.wifiSsid || 'ESP32_WiFi'}</span>
          </div>
          <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Hardware UART</span>
            <span className="font-semibold text-cyan-400 truncate block mt-0.5">Serial2 (RX:{config.rxPin}, TX:{config.txPin})</span>
          </div>
          <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Sensor Baud</span>
            <span className="font-semibold text-amber-400 truncate block mt-0.5">{config.baudRate} 8N1</span>
          </div>
          <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Async Web Port</span>
            <span className="font-semibold text-emerald-400 truncate block mt-0.5">Port {config.webServerPort}</span>
          </div>
        </div>
      </div>

      {/* Code Editor Frame */}
      <div className="bg-[#050811] border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
        {/* File Tabs & Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between border-b border-slate-700/80 bg-[#161F33] px-4 py-2.5 gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => setSelectedFile('platformio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedFile === 'platformio'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              platformio.ini
            </button>

            <button
              onClick={() => setSelectedFile('main_cpp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedFile === 'main_cpp'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              src/main.cpp
            </button>

            <button
              onClick={() => setSelectedFile('index_html')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedFile === 'index_html'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              data/index.html
            </button>

            <button
              onClick={() => setSelectedFile('readme')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedFile === 'readme'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              README.md
            </button>

            <button
              onClick={() => setSelectedFile('ino')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                selectedFile === 'ino'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              .ino Sketch
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search in code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#050811] border border-slate-700 text-xs px-3 py-1.5 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 w-full sm:w-48 font-mono"
            />
          </div>
        </div>

        {/* Code Content with Line Numbers */}
        <div className="p-4 overflow-x-auto max-h-[640px] font-mono text-xs leading-relaxed selection:bg-cyan-600 selection:text-white bg-[#050811]">
          <table className="w-full border-collapse">
            <tbody>
              {codeLines.map((line, idx) => {
                const lineNum = idx + 1;
                const isMatch = searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase());

                // Simple syntax color highlights
                const isComment = line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*') || line.trim().startsWith('#') && selectedFile === 'readme';
                const isPreprocessor = line.trim().startsWith('#') && selectedFile !== 'readme';
                const isConstByte = line.includes('CMD_') || line.includes('0x') || line.includes('INIT_CMD') || line.includes('POLLING_CMD');

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-900/80 ${isMatch ? 'bg-cyan-950/80 border-l-2 border-cyan-400' : ''}`}
                  >
                    <td className="w-12 pr-4 text-right select-none text-slate-600 border-r border-slate-800 align-top">
                      {lineNum}
                    </td>
                    <td className="pl-4 whitespace-pre text-slate-300">
                      {isComment ? (
                        <span className="text-slate-500 italic">{line}</span>
                      ) : isPreprocessor ? (
                        <span className="text-cyan-400 font-semibold">{line}</span>
                      ) : isConstByte ? (
                        <span className="text-amber-300">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Embedded Systems Best Practices Guide */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          Key Embedded Engineering Highlights in this Code
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <h4 className="font-bold text-slate-200 mb-1 text-cyan-400">1. Mutex-Safe UART Access</h4>
            <p className="leading-relaxed">
              Uses <code className="text-cyan-300">SemaphoreHandle_t</code> to guarantee that async web server requests (e.g. calibration buttons) never collide with the background telemetry polling loop on Serial2.
            </p>
          </div>

          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <h4 className="font-bold text-slate-200 mb-1 text-cyan-400">2. Automatic Calibration Handshake</h4>
            <p className="leading-relaxed">
              When Teach Min (20%) or Teach Max (80%) is triggered, the firmware issues <code className="text-amber-300">TFL20/TFH80</code>, verifies the sensor echo, and immediately delivers <code className="text-amber-300">TFX</code> to clear the sensor OK prompt.
            </p>
          </div>

          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800">
            <h4 className="font-bold text-slate-200 mb-1 text-cyan-400">3. Non-Blocking Web Server + LittleFS</h4>
            <p className="leading-relaxed">
              HTML dashboard served cleanly from <code className="text-emerald-400">LittleFS</code> with automatic fallback to <code className="text-emerald-400">PROGMEM</code>, delivering instantaneous REST API JSON responses via ESPAsyncWebServer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

