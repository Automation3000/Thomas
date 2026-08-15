export type ConnectionMode = 'disconnected' | 'usb_serial' | 'wifi_network' | 'simulated_demo';

export interface SensorTelemetry {
  flowPercent: number;
  temperatureC: number;
  temperatureF: number;
  connected: boolean;
  status: 'NORMAL' | 'CALIBRATING' | 'WARNING' | 'ERROR' | 'OFFLINE' | 'DISCONNECTED';
  lastUpdatedMs: number;
  rawHexResponse: string;
  rawAsciiResponse: string;
  packetCount: number;
  errorCount: number;
  rssi: number;
  freeHeap: number;
  uptimeSeconds: number;
  source?: ConnectionMode;
}

export interface ESP32ChipInfo {
  chipName: string;
  macAddr: string;
  features?: string[];
  flashSize?: string;
  crystalFreq?: string;
}

export interface FlashFileItem {
  address: number;
  fileName: string;
  data: Uint8Array;
  size: number;
  selected: boolean;
}

export interface FlashingProgress {
  status: 'idle' | 'connecting' | 'connected' | 'erasing' | 'flashing' | 'verifying' | 'completed' | 'error';
  currentFileIndex: number;
  totalFiles: number;
  fileProgress: number;
  totalProgress: number;
  message: string;
  bytesWritten: number;
  totalBytes: number;
  speedKbps?: number;
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
  espIpAddress?: string;
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

