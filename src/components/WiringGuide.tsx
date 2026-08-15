import React from 'react';
import { Network, Zap, AlertTriangle, CheckCircle2, Shield, ArrowRight, ExternalLink, Cpu } from 'lucide-react';
import { ESP32Config } from '../types/esp32';

interface WiringGuideProps {
  config: ESP32Config;
}

export const WiringGuide: React.FC<WiringGuideProps> = ({ config }) => {
  return (
    <div className="space-y-6">
      {/* Overview & Critical Voltage Warning */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Industrial Electrical Interfacing & Pinouts</h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Endress+Hauser Flowphant T DTT31 requires 18..30 VDC industrial power. ESP32 GPIOs tolerate maximum 3.3V.
            </p>
          </div>
        </div>

        <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-800/50 rounded-xl text-xs text-amber-200/90 leading-relaxed">
          <strong className="text-amber-300">Crucial Protection Note:</strong> The DTT31 sensor communication port operates either via standard RS-232 signal levels (&plusmn;12V) or optical head / 5V TTL. <strong className="text-amber-300">NEVER connect 24V or raw RS-232 signals directly to ESP32 GPIO pins!</strong> Always use a MAX3232 transceiver or 3.3V bi-directional level shifter.
        </div>
      </div>

      {/* Wiring Schematic & Pin Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Matrix Table */}
        <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            ESP32 to DTT31 Interface Pinout
          </h3>

          <div className="overflow-x-auto rounded-lg border border-slate-700 bg-[#050811]">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0e1626] text-slate-400 font-mono text-[11px] border-b border-slate-700">
                <tr>
                  <th className="p-3">ESP32 Pin</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">MAX3232 / Shifter</th>
                  <th className="p-3">DTT31 Sensor Port</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                <tr className="hover:bg-slate-900/50">
                  <td className="p-3 text-cyan-400 font-bold">GPIO {config.rxPin} (RX2)</td>
                  <td className="p-3 text-slate-400">&larr; INPUT</td>
                  <td className="p-3 text-slate-300">R1OUT / LV1</td>
                  <td className="p-3 text-emerald-400 font-semibold">Sensor TX (Data Out)</td>
                </tr>

                <tr className="hover:bg-slate-900/50">
                  <td className="p-3 text-cyan-400 font-bold">GPIO {config.txPin} (TX2)</td>
                  <td className="p-3 text-slate-400">&rarr; OUTPUT</td>
                  <td className="p-3 text-slate-300">T1IN / HV1</td>
                  <td className="p-3 text-emerald-400 font-semibold">Sensor RX (Data In)</td>
                </tr>

                <tr className="hover:bg-slate-900/50">
                  <td className="p-3 text-slate-300 font-bold">GND</td>
                  <td className="p-3 text-slate-400">&harr; COMMON</td>
                  <td className="p-3 text-slate-300">GND</td>
                  <td className="p-3 text-slate-300 font-semibold">Power GND (0V Ref)</td>
                </tr>

                <tr className="hover:bg-slate-900/50">
                  <td className="p-3 text-slate-300 font-bold">3.3V</td>
                  <td className="p-3 text-slate-400">&rarr; POWER</td>
                  <td className="p-3 text-slate-300">VCC (3.3V side)</td>
                  <td className="p-3 text-slate-500 font-sans italic">(Powered by 24V supply)</td>
                </tr>

                <tr className="hover:bg-slate-900/50 bg-[#0e1626]/60">
                  <td className="p-3 text-slate-500 font-sans italic">(External 24V PSU)</td>
                  <td className="p-3 text-slate-400">&rarr; POWER</td>
                  <td className="p-3 text-slate-500">-</td>
                  <td className="p-3 text-amber-400 font-bold">L+ (Pin 1, +24VDC)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3.5 bg-[#0e1626] rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
            <span className="font-bold text-slate-200 block">Common Ground Rule:</span>
            Ensure the 24V DC Power Supply GND, the ESP32 GND, and the MAX3232 transceiver GND are all tied together to establish a shared reference plane.
          </div>
        </div>

        {/* M12 Industrial Connector & Optical Interface */}
        <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Endress+Hauser DTT31 Port Details
          </h3>

          <div className="p-4 bg-[#0e1626] rounded-xl border border-slate-800 space-y-3.5 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-bold shrink-0">
                1
              </div>
              <div>
                <h4 className="font-bold text-slate-200">M12 4-Pin Standard Sensor Connector</h4>
                <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                  Pin 1: +24V DC (L+) &bull; Pin 2: Switch Output 2 / Analog &bull; Pin 3: 0V (L-) &bull; Pin 4: Switch Output 1
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center font-bold shrink-0">
                2
              </div>
              <div>
                <h4 className="font-bold text-slate-200">Front Display Optical/Infrared Interface</h4>
                <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                  Endress+Hauser DTT31 models with front-panel serial interface communicate at 19200 baud 8N1 using the proprietary framed byte arrays.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold shrink-0">
                3
              </div>
              <div>
                <h4 className="font-bold text-slate-200">UART Baud Configuration</h4>
                <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                  Factory default is fixed to <strong className="text-slate-200 font-mono">19200 bps</strong>, 8 Data bits, No parity, 1 Stop bit.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flashing & Library Installation Step-by-Step */}
      <div className="bg-[#161F33] border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          Step-by-Step Arduino IDE / PlatformIO Setup Guide
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Step 1 */}
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xs">1</span>
              Install ESP32 Board
            </div>
            <p className="text-slate-400 leading-relaxed">
              In Arduino IDE, go to <strong>Boards Manager</strong> and install <code className="text-slate-200 font-mono">esp32 by Espressif Systems</code> (v2.0.x or v3.x).
            </p>
            <div className="text-[11px] text-slate-500 font-mono">
              Select Board: &quot;ESP32 Dev Module&quot;
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xs">2</span>
              Install Async Libraries
            </div>
            <p className="text-slate-400 leading-relaxed">
              Install the required asynchronous server dependencies from GitHub or Library Manager:
            </p>
            <ul className="list-disc list-inside text-[11px] text-cyan-300 font-mono space-y-0.5">
              <li>ESPAsyncWebServer</li>
              <li>AsyncTCP</li>
            </ul>
          </div>

          {/* Step 3 */}
          <div className="bg-[#0e1626] p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xs">3</span>
              Flash &amp; Open Dashboard
            </div>
            <p className="text-slate-400 leading-relaxed">
              Compile and upload the generated <code className="text-slate-200 font-mono">.ino</code> sketch. Open the Serial Monitor at <strong className="text-slate-200 font-mono">115200 baud</strong> to view the assigned IP address, then open it in any browser!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
