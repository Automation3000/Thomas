import { SerialLogMessage, SensorTelemetry } from '../types/esp32';

export interface WebSerialReaderCallbacks {
  onLog: (log: SerialLogMessage) => void;
  onTelemetryUpdate: (telemetry: Partial<SensorTelemetry>) => void;
  onConnectionChange: (connected: boolean, portInfo?: string) => void;
  onError: (error: string) => void;
}

export class WebSerialReaderService {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isReading: boolean = false;
  private isConnected: boolean = false;
  private textDecoder: TextDecoder = new TextDecoder();
  private textEncoder: TextEncoder = new TextEncoder();
  private lineBuffer: string = '';

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Request serial port and begin continuous streaming at target baud (default 115200)
   */
  public async connect(
    baudRate: number = 115200,
    callbacks: WebSerialReaderCallbacks
  ): Promise<void> {
    if (!WebSerialReaderService.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.');
    }

    try {
      // @ts-ignore
      this.port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x10c4 }, // CP2102
          { usbVendorId: 0x1a86 }, // CH340
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x303a }, // ESP32-S3/C3
        ]
      }).catch(async (e: any) => {
        if (e.name === 'NotFoundError') throw e;
        // @ts-ignore
        return await navigator.serial.requestPort();
      });

      if (!this.port) {
        throw new Error('No port selected.');
      }

      await this.port.open({
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 8192,
        flowControl: 'none',
      });

      this.isConnected = true;
      this.isReading = true;

      // Extract port info if available
      let portInfoStr = 'ESP32 USB Serial';
      try {
        const info = this.port.getInfo();
        if (info.usbVendorId) {
          portInfoStr = `USB VID: 0x${info.usbVendorId.toString(16).padStart(4, '0')} PID: 0x${(info.usbProductId || 0).toString(16).padStart(4, '0')}`;
        }
      } catch (e) {
        // ignore
      }

      callbacks.onConnectionChange(true, portInfoStr);
      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'SYS',
        hex: '--',
        ascii: `[SYS] Web Serial connected to ESP32 @ ${baudRate} baud (8N1)`,
        description: 'Web Serial Active',
      });

      // Start read loop
      this.startReadLoop(callbacks);

    } catch (err: any) {
      this.disconnect(callbacks);
      callbacks.onError(err.message || String(err));
      throw err;
    }
  }

  /**
   * Continuous read loop from port.readable stream
   */
  private async startReadLoop(callbacks: WebSerialReaderCallbacks) {
    while (this.port && this.port.readable && this.isReading) {
      try {
        this.reader = this.port.readable.getReader();
        while (this.isReading) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.handleIncomingChunk(value, callbacks);
          }
        }
      } catch (error: any) {
        if (this.isReading) {
          callbacks.onError(`Serial read error: ${error.message}`);
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch (e) {
            // ignore
          }
          this.reader = null;
        }
      }
    }
  }

  /**
   * Process raw bytes from ESP32
   */
  private handleIncomingChunk(bytes: Uint8Array, callbacks: WebSerialReaderCallbacks) {
    const textChunk = this.textDecoder.decode(bytes, { stream: true });
    this.lineBuffer += textChunk;

    // Process complete lines
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || ''; // keep trailing partial line

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Hex representation of raw line
      let hexStr = '';
      for (let i = 0; i < Math.min(line.length, 16); i++) {
        hexStr += line.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase() + ' ';
      }

      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'),
        direction: line.includes('[ERR') ? 'ERR' : 'RX',
        hex: hexStr.trim(),
        ascii: line,
        description: line.includes('[UART2]') ? 'Sensor UART Log' : line.includes('[WIFI]') ? 'Wi-Fi Status' : undefined,
      });

      // Parse real telemetry from ESP32 logs
      this.parseRealTelemetryFromSerial(line, callbacks);
    }
  }

  /**
   * Parse real numbers from ESP32 firmware output
   * Supported formats:
   *  1. "Echo: Flow=45.8%, Temp=24.3°C"
   *  2. "<SOH>01<STX>F045.8T024.3<ETX>"
   *  3. "FLOW:45.8,TEMP:24.3" or "{"flowPercent":45.8,"temperatureC":24.3}"
   */
  private parseRealTelemetryFromSerial(line: string, callbacks: WebSerialReaderCallbacks) {
    try {
      // Check for JSON string
      if (line.startsWith('{') && line.endsWith('}') && line.includes('flowPercent')) {
        const parsed = JSON.parse(line);
        callbacks.onTelemetryUpdate({
          flowPercent: typeof parsed.flowPercent === 'number' ? parsed.flowPercent : parseFloat(parsed.flowPercent),
          temperatureC: typeof parsed.temperatureC === 'number' ? parsed.temperatureC : parseFloat(parsed.temperatureC),
          temperatureF: typeof parsed.temperatureC === 'number' ? +(parsed.temperatureC * 1.8 + 32).toFixed(1) : undefined,
          connected: true,
          status: 'NORMAL',
          lastUpdatedMs: Date.now(),
          rawHexResponse: parsed.rawHex || '',
          rawAsciiResponse: parsed.rawAscii || '',
          uptimeSeconds: parsed.uptimeSeconds || 0,
        });
        return;
      }

      // Check for Flow & Temp format "Flow=45.8" or "Flow: 45.8"
      const flowMatch = line.match(/Flow[=:]\s*([0-9.]+)/i);
      const tempMatch = line.match(/Temp[=:]\s*([0-9.]+)/i);

      if (flowMatch || tempMatch) {
        const flow = flowMatch ? parseFloat(flowMatch[1]) : undefined;
        const temp = tempMatch ? parseFloat(tempMatch[1]) : undefined;

        callbacks.onTelemetryUpdate({
          ...(flow !== undefined && !isNaN(flow) ? { flowPercent: flow } : {}),
          ...(temp !== undefined && !isNaN(temp) ? { temperatureC: temp, temperatureF: +(temp * 1.8 + 32).toFixed(1) } : {}),
          connected: true,
          status: 'NORMAL',
          lastUpdatedMs: Date.now(),
        });
        return;
      }

      // Check for DTT31 format: F045.8T024.3
      const dtt31Match = line.match(/F([0-9]{3}\.?[0-9]?)T([0-9]{3}\.?[0-9]?)/);
      if (dtt31Match) {
        const flow = parseFloat(dtt31Match[1]);
        const temp = parseFloat(dtt31Match[2]);
        callbacks.onTelemetryUpdate({
          flowPercent: isNaN(flow) ? 0 : flow,
          temperatureC: isNaN(temp) ? 0 : temp,
          temperatureF: isNaN(temp) ? 32 : +(temp * 1.8 + 32).toFixed(1),
          connected: true,
          status: 'NORMAL',
          lastUpdatedMs: Date.now(),
        });
      }
    } catch (e) {
      // Non-fatal parse error
    }
  }

  /**
   * Send text or command bytes to ESP32 over serial
   */
  public async sendCommand(text: string, callbacks: WebSerialReaderCallbacks): Promise<void> {
    if (!this.port || !this.port.writable || !this.isConnected) {
      throw new Error('ESP32 Serial port is not connected.');
    }

    try {
      this.writer = this.port.writable.getWriter();
      const data = this.textEncoder.encode(text + '\r\n');
      await this.writer.write(data);

      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'TX',
        hex: Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
        ascii: text,
        description: 'User Command Transmitted over USB',
      });
    } catch (err: any) {
      callbacks.onError(`Failed to write to serial: ${err.message}`);
      throw err;
    } finally {
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {
          // ignore
        }
        this.writer = null;
      }
    }
  }

  /**
   * Send hardware reset pulse (toggle RTS/DTR)
   */
  public async hardwareReset(callbacks: WebSerialReaderCallbacks): Promise<void> {
    if (!this.port) return;
    try {
      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'SYS',
        hex: '--',
        ascii: '[SYS] Toggling RTS/DTR to Hardware Reset ESP32...',
        description: 'Hardware Reset',
      });

      await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise(r => setTimeout(r, 100));
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });

      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'SYS',
        hex: '--',
        ascii: '[SYS] ESP32 Hardware Reset completed.',
      });
    } catch (e: any) {
      callbacks.onError(`Reset error: ${e.message}`);
    }
  }

  /**
   * Disconnect port cleanly
   */
  public async disconnect(callbacks?: WebSerialReaderCallbacks): Promise<void> {
    this.isReading = false;
    this.isConnected = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (e) {
        // ignore
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {
        // ignore
      }
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        // ignore
      }
      this.port = null;
    }

    if (callbacks) {
      callbacks.onConnectionChange(false);
      callbacks.onLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        direction: 'SYS',
        hex: '--',
        ascii: '[SYS] Web Serial port disconnected.',
        description: 'Disconnected',
      });
    }
  }
}
