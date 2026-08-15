import { ProtocolCommand } from '../types/esp32';

/**
 * Endress+Hauser Flowphant T DTT31 Proprietary UART Frame Structure:
 * 
 * Frame Format:
 * [SOH 0x01] [ADDR '0' '1' (0x30, 0x31)] [STX 0x02] [DATA / CMD BYTES] [ETX 0x03] [BCC / CHECKSUM]
 * 
 * Checksum (BCC) Calculation:
 * XOR or modulo checksum across the byte stream starting from SOH or STX up to ETX.
 * Specifically for Endress+Hauser DTT31:
 * - Init "V": 0x01 ^ 0x30 ^ 0x31 ^ 0x02 ^ 0x56 ^ 0x03 = 0x55 ('U')
 * - Polling "R1000": 0x01 ^ 0x30 ^ 0x31 ^ 0x02 ^ 0x52 ^ 0x31 ^ 0x30 ^ 0x30 ^ 0x30 ^ 0x03 = 0x50 ('P')
 * - Learn Min "TFL20": 0x01 ^ 0x30 ^ 0x31 ^ 0x02 ^ 0x54 ^ 0x46 ^ 0x4C ^ 0x32 ^ 0x30 ^ 0x03 = 0x5F ('_')
 * - Learn Max "TFH80": 0x01 ^ 0x30 ^ 0x31 ^ 0x02 ^ 0x54 ^ 0x46 ^ 0x48 ^ 0x38 ^ 0x30 ^ 0x03 = 0x51 ('Q')
 * - Calib Exit "TFX": 0x01 ^ 0x30 ^ 0x31 ^ 0x02 ^ 0x54 ^ 0x46 ^ 0x58 ^ 0x03 = 0x49 ('I')
 */

export const PROTOCOL_COMMANDS: ProtocolCommand[] = [
  {
    id: 'init',
    name: 'Init / Wake-up Command',
    description: 'Queries device identity, model version, and initializes the UART session.',
    hexBytes: [0x01, 0x30, 0x31, 0x02, 0x56, 0x03, 0x55],
    asciiEquivalent: '<SOH>01<STX>V<ETX>U',
    expectedResponseExample: '01 30 31 02 44 54 54 33 31 2D 56 31 2E 30 32 03 4B  // DTT31-V1.02',
    functionCategory: 'system',
  },
  {
    id: 'poll',
    name: 'Live Polling Command (R1000)',
    description: 'Reads dynamic measurement register 1000 containing live Flow rate percentage and Temperature values.',
    hexBytes: [0x01, 0x30, 0x31, 0x02, 0x52, 0x31, 0x30, 0x30, 0x30, 0x03, 0x50],
    asciiEquivalent: '<SOH>01<STX>R1000<ETX>P',
    expectedResponseExample: '01 30 31 02 46 30 34 35 2E 32 54 30 32 34 2E 38 03 7C  // F045.2T024.8',
    functionCategory: 'read',
  },
  {
    id: 'learn_min',
    name: 'Learn Minimum Flow 20% (TFL20)',
    description: 'Teaches the sensor that current fluid speed represents the 20% lower boundary (Teach Flow Low).',
    hexBytes: [0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x4C, 0x32, 0x30, 0x03, 0x5F],
    asciiEquivalent: '<SOH>01<STX>TFL20<ETX>_',
    expectedResponseExample: '01 30 31 02 4F 4B 03 3E  // OK',
    functionCategory: 'calibration',
  },
  {
    id: 'learn_max',
    name: 'Learn Maximum Flow 80% (TFH80)',
    description: 'Teaches the sensor that current fluid speed represents the 80% upper boundary (Teach Flow High).',
    hexBytes: [0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x48, 0x38, 0x30, 0x03, 0x51],
    asciiEquivalent: '<SOH>01<STX>TFH80<ETX>Q',
    expectedResponseExample: '01 30 31 02 4F 4B 03 3E  // OK',
    functionCategory: 'calibration',
  },
  {
    id: 'calib_exit',
    name: 'Calibration Exit / Acknowledge (TFX)',
    description: 'Exits calibration routine, saves flash parameters, and clears the OK acknowledgement screen on sensor.',
    hexBytes: [0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x58, 0x03, 0x49],
    asciiEquivalent: '<SOH>01<STX>TFX<ETX>I',
    expectedResponseExample: '01 30 31 02 41 43 4B 03 27  // ACK',
    functionCategory: 'calibration',
  },
];

export function calculateDTT31BCC(bytes: number[]): number {
  let bcc = 0;
  for (const b of bytes) {
    bcc ^= b;
  }
  return bcc;
}

export function formatHexArray(bytes: number[]): string {
  return bytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ');
}

export function formatHexSpaced(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

export function bytesToAscii(bytes: number[]): string {
  return bytes
    .map(b => {
      if (b === 0x01) return '<SOH>';
      if (b === 0x02) return '<STX>';
      if (b === 0x03) return '<ETX>';
      if (b >= 32 && b <= 126) return String.fromCharCode(b);
      return `\\x${b.toString(16).padStart(2, '0')}`;
    })
    .join('');
}
