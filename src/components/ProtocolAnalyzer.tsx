import React, { useState } from 'react';
import { 
  Binary, 
  Calculator, 
  Layers, 
  ArrowRight, 
  CheckCircle, 
  HelpCircle, 
  Copy, 
  Check, 
  Cpu, 
  Hash 
} from 'lucide-react';
import { PROTOCOL_COMMANDS, formatHexArray, formatHexSpaced, calculateDTT31BCC, bytesToAscii } from '../data/protocolData';

export const ProtocolAnalyzer: React.FC = () => {
  const [selectedCommandId, setSelectedCommandId] = useState<string>('poll');
  const [customPayload, setCustomPayload] = useState<string>('R1000');
  const [deviceAddr, setDeviceAddr] = useState<string>('01');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const selectedCommand = PROTOCOL_COMMANDS.find((c) => c.id === selectedCommandId) || PROTOCOL_COMMANDS[0];

  // Dynamic custom frame generator
  const generateCustomFrame = () => {
    const bytes: number[] = [0x01]; // SOH
    // Device Address (2 ASCII chars, e.g. "01")
    const addr = deviceAddr.padEnd(2, '0').substring(0, 2);
    bytes.push(addr.charCodeAt(0));
    bytes.push(addr.charCodeAt(1));
    bytes.push(0x02); // STX

    // Payload ASCII
    for (let i = 0; i < customPayload.length; i++) {
      bytes.push(customPayload.charCodeAt(i));
    }
    bytes.push(0x03); // ETX

    // Calculate BCC Checksum (XOR from SOH to ETX)
    const bcc = calculateDTT31BCC(bytes);
    bytes.push(bcc);

    return {
      bytes,
      hexArray: formatHexArray(bytes),
      hexSpaced: formatHexSpaced(bytes),
      ascii: bytesToAscii(bytes),
      bccHex: '0x' + bcc.toString(16).toUpperCase().padStart(2, '0'),
      bccChar: bcc >= 32 && bcc <= 126 ? String.fromCharCode(bcc) : `\\x${bcc.toString(16)}`,
    };
  };

  const customFrame = generateCustomFrame();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Overview */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <Binary className="w-5 h-5 text-cyan-400" />
          Endress+Hauser Flowphant T DTT31 UART Protocol Specification
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          The DTT31 uses a framed ASCII-over-UART protocol at <strong className="text-slate-200 font-mono">19200 Baud, 8 Data Bits, No Parity, 1 Stop Bit (8N1)</strong>. Frames are delimited by <code className="text-cyan-400 font-mono">SOH (0x01)</code>, device address, <code className="text-cyan-400 font-mono">STX (0x02)</code>, command payload, <code className="text-cyan-400 font-mono">ETX (0x03)</code>, and a Longitudinal Redundancy / BCC Checksum byte.
        </p>

        {/* Frame Structure Visual Architecture */}
        <div className="mt-5 bg-[#0e1626] p-4 rounded-xl border border-slate-800">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block mb-2.5">
            Generic Frame Architecture:
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="bg-sky-950/80 border border-sky-700/60 text-sky-300 px-3 py-2 rounded-lg text-center shadow-sm">
              <span className="block text-[10px] text-sky-400/80 font-sans uppercase">Start of Header</span>
              <span className="font-bold">0x01 (SOH)</span>
            </div>

            <span className="text-slate-600 font-bold">+</span>

            <div className="bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-3 py-2 rounded-lg text-center shadow-sm">
              <span className="block text-[10px] text-indigo-400/80 font-sans uppercase">Address</span>
              <span className="font-bold">&apos;0&apos; &apos;1&apos; (0x30, 0x31)</span>
            </div>

            <span className="text-slate-600 font-bold">+</span>

            <div className="bg-sky-950/80 border border-sky-700/60 text-sky-300 px-3 py-2 rounded-lg text-center shadow-sm">
              <span className="block text-[10px] text-sky-400/80 font-sans uppercase">Start of Text</span>
              <span className="font-bold">0x02 (STX)</span>
            </div>

            <span className="text-slate-600 font-bold">+</span>

            <div className="bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 px-4 py-2 rounded-lg text-center flex-1 min-w-[140px] shadow-sm">
              <span className="block text-[10px] text-cyan-400/80 font-sans uppercase">Command Payload</span>
              <span className="font-bold">ASCII (e.g. &quot;R1000&quot; / &quot;TFL20&quot;)</span>
            </div>

            <span className="text-slate-600 font-bold">+</span>

            <div className="bg-amber-950/80 border border-amber-700/60 text-amber-300 px-3 py-2 rounded-lg text-center shadow-sm">
              <span className="block text-[10px] text-amber-400/80 font-sans uppercase">End of Text</span>
              <span className="font-bold">0x03 (ETX)</span>
            </div>

            <span className="text-slate-600 font-bold">+</span>

            <div className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 px-3 py-2 rounded-lg text-center shadow-sm">
              <span className="block text-[10px] text-emerald-400/80 font-sans uppercase">BCC Checksum</span>
              <span className="font-bold">XOR (0x01 .. 0x03)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5 Proprietary Commands Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Command Selector List */}
        <div className="lg:col-span-5 space-y-2.5">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Standard Sensor Commands
          </h3>
          {PROTOCOL_COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => setSelectedCommandId(cmd.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                selectedCommandId === cmd.id
                  ? 'bg-[#161F33] border-cyan-500 shadow-md shadow-cyan-900/30'
                  : 'bg-[#161F33]/70 border-slate-700 hover:bg-[#161F33]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-100">{cmd.name}</span>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  cmd.functionCategory === 'calibration'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : cmd.functionCategory === 'read'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                }`}>
                  {cmd.functionCategory}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cmd.description}</p>
              <div className="mt-2 font-mono text-[11px] text-cyan-400 bg-[#050811] px-2.5 py-1 rounded border border-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                {formatHexSpaced(cmd.hexBytes)}
              </div>
            </button>
          ))}
        </div>

        {/* Selected Command Deep Dive */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div>
                <span className="text-[10px] text-cyan-400 font-mono uppercase font-bold tracking-wider">
                  Command Analysis
                </span>
                <h3 className="text-base font-bold text-white">{selectedCommand.name}</h3>
              </div>
              <button
                onClick={() => handleCopy(formatHexArray(selectedCommand.hexBytes), 'selected-cmd')}
                className="px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#25334a] text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-600 transition-colors cursor-pointer"
              >
                {copiedIndex === 'selected-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIndex === 'selected-cmd' ? 'Copied' : 'Copy C++ Array'}
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selectedCommand.description}</p>

            {/* C++ Byte Array Declaration */}
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">C++ Byte Array Declaration:</span>
              <div className="bg-[#050811] p-3 rounded-lg border border-slate-800 font-mono text-xs text-amber-300 select-all">
                byte {selectedCommand.id.toUpperCase()}_CMD[] = &#123;{formatHexArray(selectedCommand.hexBytes)}&#125;;
              </div>
            </div>

            {/* Byte-by-Byte Breakdown Table */}
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">Byte Breakdown:</span>
              <div className="overflow-x-auto rounded-lg border border-slate-700 bg-[#050811]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0e1626] text-slate-400 font-mono text-[11px] border-b border-slate-700">
                    <tr>
                      <th className="p-2.5">Index</th>
                      <th className="p-2.5">Hex</th>
                      <th className="p-2.5">ASCII</th>
                      <th className="p-2.5">Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {selectedCommand.hexBytes.map((b, i) => {
                      let meaning = 'Payload Byte';
                      if (i === 0) meaning = 'SOH (Start of Header 0x01)';
                      else if (i === 1 || i === 2) meaning = `Address Digit '${String.fromCharCode(b)}'`;
                      else if (i === 3) meaning = 'STX (Start of Text 0x02)';
                      else if (i === selectedCommand.hexBytes.length - 2) meaning = 'ETX (End of Text 0x03)';
                      else if (i === selectedCommand.hexBytes.length - 1) meaning = 'BCC (XOR Checksum)';

                      return (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="p-2.5 text-slate-500">{i}</td>
                          <td className="p-2.5 text-amber-400 font-bold">0x{b.toString(16).toUpperCase().padStart(2, '0')}</td>
                          <td className="p-2.5 text-cyan-400">
                            {b >= 32 && b <= 126 ? `'${String.fromCharCode(b)}'` : b === 1 ? '<SOH>' : b === 2 ? '<STX>' : b === 3 ? '<ETX>' : '\\x' + b.toString(16)}
                          </td>
                          <td className="p-2.5 text-slate-300 font-sans">{meaning}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expected Sensor Echo Example */}
            <div className="bg-[#0e1626] p-3 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                Typical DTT31 Sensor Response:
              </span>
              <div className="font-mono text-xs text-emerald-400">
                {selectedCommand.expectedResponseExample}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive BCC Checksum & Frame Builder Calculator */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-bold text-white">
            Interactive DTT31 BCC Checksum & Frame Builder
          </h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Test any custom command (e.g. read parameters, write setpoints, change units). The algorithm calculates the longitudinal redundancy checksum (<code className="text-cyan-400 font-mono">XOR</code> across the entire byte sequence from SOH to ETX).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1">Command String Payload:</label>
              <input
                type="text"
                value={customPayload}
                onChange={(e) => setCustomPayload(e.target.value)}
                placeholder="e.g. R1000, TFL20, V, TFH80"
                className="w-full bg-[#050811] border border-slate-700 rounded-lg px-3.5 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1">Device Address (2 Digits):</label>
              <input
                type="text"
                maxLength={2}
                value={deviceAddr}
                onChange={(e) => setDeviceAddr(e.target.value)}
                className="w-24 bg-[#050811] border border-slate-700 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Resulting Computed Array */}
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Calculated Output Array:</span>
              <button
                onClick={() => handleCopy(customFrame.hexArray, 'custom-calc')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
              >
                {copiedIndex === 'custom-calc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Array
              </button>
            </div>

            <div className="p-2.5 bg-[#050811] rounded-lg border border-slate-800 font-mono text-xs text-amber-300 break-all select-all">
              byte CUSTOM_CMD[] = &#123;{customFrame.hexArray}&#125;;
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-1">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Computed BCC</span>
                <span className="text-emerald-400 font-bold">{customFrame.bccHex} ({customFrame.bccChar})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Length</span>
                <span className="text-slate-200 font-bold">{customFrame.bytes.length} Bytes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
