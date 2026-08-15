export interface SensorTelemetry {
  flowPercent: number;
  temperatureC: number;
  temperatureF: number;
  connected: boolean;
  status: 'NORMAL' | 'CALIBRATING' | 'WARNING' | 'ERROR' | 'OFFLINE';
  lastUpdatedMs: number;
  rawHexResponse: string;
  rawAsciiResponse: string;
  packetCount: number;
  errorCount: number;
  rssi: number;
  freeHeap: number;
  uptimeSeconds: number;
}

export interface ESP32Config {
  wifiSsid: string;
  wifiPass: string;
  rxPin: number;
  txPin: number;
  baudRate: number;
  pollIntervalMs: number;
  deviceAddress: string;
  webServerPort: number;
  enableApFallback: boolean;
  apSsid: string;
  tempUnit: 'C' | 'F';
}

export interface ProtocolCommand {
  id: string;
  name: string;
  description: string;
  hexBytes: number[];
  asciiEquivalent: string;
  expectedResponseExample: string;
  functionCategory: 'system' | 'read' | 'calibration';
}

export interface SerialLogMessage {
  id: string;
  timestamp: string;
  direction: 'TX' | 'RX' | 'SYS' | 'ERR';
  hex: string;
  ascii: string;
  description?: string;
}

export interface CalibrationStep {
  step: number;
  title: string;
  commandName: string;
  hexBytes: number[];
  status: 'pending' | 'active' | 'success' | 'failed';
  message: string;
}
