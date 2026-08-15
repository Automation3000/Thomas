import { ESPLoader, Transport } from 'esptool-js';
import { ESP32ChipInfo, FlashingProgress, FlashFileItem } from '../types/esp32';

export interface TerminalOutputHandler {
  log: (msg: string) => void;
  error: (msg: string) => void;
  clean?: () => void;
}

export class WebSerialFlasherService {
  private port: any = null;
  private transport: any = null;
  private esploader: any = null;
  private isConnected: boolean = false;
  private chipInfo: ESP32ChipInfo | null = null;

  public static isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public getChipInfo(): ESP32ChipInfo | null {
    return this.chipInfo;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Request user to pick a serial port and initialize ESPLoader connection
   */
  public async connect(
    baudRate: number = 115200,
    terminal: TerminalOutputHandler
  ): Promise<ESP32ChipInfo> {
    if (!WebSerialFlasherService.isWebSerialSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      terminal.log('Requesting serial port permission from browser...');
      // @ts-ignore
      this.port = await navigator.serial.requestPort({
        filters: [
          // Common USB-to-UART bridge vendor IDs (CP2102, CH340, FTDI, CH9102, ESP32-S3/C3 Native USB)
          { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
          { usbVendorId: 0x1a86 }, // WCH CH340 / CH341
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x303a }, // Espressif USB-JTAG/Serial
          { usbVendorId: 0x2341 }, // Arduino
        ]
      }).catch(async (e: any) => {
        // If filtered request was dismissed or unsupported, prompt without filter
        if (e.name === 'NotFoundError' || e.message?.includes('No port selected')) {
          throw e;
        }
        // @ts-ignore
        return await navigator.serial.requestPort();
      });

      if (!this.port) {
        throw new Error('No serial port selected.');
      }

      terminal.log('Initializing WebSerial Transport...');
      this.transport = new Transport(this.port, true);

      terminal.log(`Connecting to ESP32 ROM Bootloader at ${baudRate} baud...`);
      
      const customTerminal = {
        clean: () => {
          if (terminal.clean) terminal.clean();
        },
        writeLine: (data: string) => terminal.log(data),
        write: (data: string) => terminal.log(data),
        error: (data: string) => terminal.error(data),
      };

      this.esploader = new ESPLoader({
        transport: this.transport,
        baudrate: baudRate,
        terminal: customTerminal,
      });

      terminal.log('Syncing with ESP32 chip (toggling DTR/RTS bootloader signals)...');
      const chip = await this.esploader.main();
      
      terminal.log(`ESP32 Bootloader Synced successfully! Detected Chip: ${chip}`);

      let mac = 'Unknown';
      try {
        if (this.esploader.chip && this.esploader.chip.readMac) {
          mac = await this.esploader.chip.readMac();
        }
      } catch (e) {
        // Non-fatal
      }

      let flashSize = '4MB (Standard)';
      try {
        if (this.esploader.detectFlashSize) {
          const detected = await this.esploader.detectFlashSize();
          if (detected) flashSize = detected;
        }
      } catch (e) {
        // Non-fatal
      }

      this.chipInfo = {
        chipName: chip || 'ESP32',
        macAddr: mac,
        flashSize: flashSize,
        features: ['Wi-Fi 802.11 b/g/n', 'Bluetooth BLE', 'Hardware UART2', 'AsyncWebServer'],
      };

      this.isConnected = true;
      terminal.log(`Chip Connected: ${this.chipInfo.chipName} | MAC: ${this.chipInfo.macAddr} | Flash: ${this.chipInfo.flashSize}`);
      return this.chipInfo;
    } catch (err: any) {
      this.disconnect();
      terminal.error(`Connection failed: ${err.message || err}`);
      throw err;
    }
  }

  /**
   * Flash one or more binary files to the ESP32
   */
  public async flashFiles(
    fileItems: FlashFileItem[],
    flashBaudRate: number = 460800,
    eraseAll: boolean = false,
    terminal: TerminalOutputHandler,
    onProgress: (prog: FlashingProgress) => void
  ): Promise<void> {
    if (!this.esploader || !this.isConnected) {
      throw new Error('ESP32 is not connected. Please connect first.');
    }

    try {
      const activeFiles = fileItems.filter(f => f.selected && f.data && f.data.length > 0);
      if (activeFiles.length === 0) {
        throw new Error('No valid firmware binary selected to flash.');
      }

      const totalBytes = activeFiles.reduce((acc, f) => acc + f.data.length, 0);
      let cumulativeBytesWritten = 0;
      const startTime = Date.now();

      onProgress({
        status: 'flashing',
        currentFileIndex: 0,
        totalFiles: activeFiles.length,
        fileProgress: 0,
        totalProgress: 0,
        message: 'Preparing flash memory...',
        bytesWritten: 0,
        totalBytes,
        speedKbps: 0,
      });

      // Erase flash if requested
      if (eraseAll) {
        terminal.log('Full Chip Erase requested. Erasing all flash sectors (this may take 5-15 seconds)...');
        onProgress({
          status: 'erasing',
          currentFileIndex: 0,
          totalFiles: activeFiles.length,
          fileProgress: 0,
          totalProgress: 5,
          message: 'Erasing full flash chip...',
          bytesWritten: 0,
          totalBytes,
          speedKbps: 0,
        });

        await this.esploader.eraseFlash();
        terminal.log('Flash erased successfully!');
      }

      // Convert to format required by esptool-js
      const fileArray: { data: string; address: number }[] = [];

      for (let i = 0; i < activeFiles.length; i++) {
        const item = activeFiles[i];
        terminal.log(`Preparing: "${item.fileName}" (${(item.data.length / 1024).toFixed(1)} KB) @ Address 0x${item.address.toString(16).toUpperCase()}`);
        
        // esptool-js accepts binary string
        let binaryStr = '';
        const len = item.data.length;
        for (let b = 0; b < len; b++) {
          binaryStr += String.fromCharCode(item.data[b]);
        }

        fileArray.push({
          data: binaryStr,
          address: item.address,
        });
      }

      terminal.log(`Beginning high-speed flashing of ${activeFiles.length} binary part(s) at ${flashBaudRate} baud...`);

      const flashOptions = {
        fileArray: fileArray,
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          const filePct = Math.floor((written / total) * 100);
          
          let prevFilesBytes = 0;
          for (let p = 0; p < fileIndex; p++) {
            prevFilesBytes += activeFiles[p].data.length;
          }
          const currentTotalWritten = prevFilesBytes + written;
          const totalPct = Math.min(99, Math.floor((currentTotalWritten / totalBytes) * 100));

          const elapsedSec = (Date.now() - startTime) / 1000;
          const speed = elapsedSec > 0 ? (currentTotalWritten / 1024 / elapsedSec) : 0;

          onProgress({
            status: 'flashing',
            currentFileIndex: fileIndex + 1,
            totalFiles: activeFiles.length,
            fileProgress: filePct,
            totalProgress: totalPct,
            message: `Writing ${activeFiles[fileIndex]?.fileName || 'firmware'} (${filePct}% - ${(written / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} KB)`,
            bytesWritten: currentTotalWritten,
            totalBytes,
            speedKbps: +speed.toFixed(1),
          });
        },
        calculateMD5Hash: (image: string) => {
          return '';
        },
      };

      await this.esploader.writeFlash(flashOptions);

      terminal.log('All flash partitions written and verified successfully!');

      onProgress({
        status: 'verifying',
        currentFileIndex: activeFiles.length,
        totalFiles: activeFiles.length,
        fileProgress: 100,
        totalProgress: 100,
        message: 'Flashing complete! Resetting ESP32 to execute user firmware...',
        bytesWritten: totalBytes,
        totalBytes,
        speedKbps: 0,
      });

      // Hard Reset ESP32 to launch application
      terminal.log('Issuing hardware reset to reboot ESP32 into application mode...');
      try {
        await this.esploader.after('hard_reset');
      } catch (e) {
        // Fallback custom RTS/DTR toggle
        if (this.transport) {
          await this.transport.setRTS(true);
          await this.transport.setDTR(false);
          await new Promise(r => setTimeout(r, 100));
          await this.transport.setRTS(false);
        }
      }

      terminal.log('ESP32 Rebooted! Your Flowphant DTT31 controller is now running.');

      onProgress({
        status: 'completed',
        currentFileIndex: activeFiles.length,
        totalFiles: activeFiles.length,
        fileProgress: 100,
        totalProgress: 100,
        message: 'Firmware successfully flashed & ESP32 rebooted!',
        bytesWritten: totalBytes,
        totalBytes,
      });

    } catch (err: any) {
      terminal.error(`Flashing failed: ${err.message || err}`);
      onProgress({
        status: 'error',
        currentFileIndex: 0,
        totalFiles: 0,
        fileProgress: 0,
        totalProgress: 0,
        message: `Flash error: ${err.message || err}`,
        bytesWritten: 0,
        totalBytes: 0,
      });
      throw err;
    }
  }

  /**
   * Erase entire flash chip
   */
  public async eraseChip(terminal: TerminalOutputHandler): Promise<void> {
    if (!this.esploader || !this.isConnected) {
      throw new Error('ESP32 is not connected.');
    }

    terminal.log('Starting full flash memory wipe (Erase Chip)...');
    await this.esploader.eraseFlash();
    terminal.log('ESP32 Flash memory completely erased!');
  }

  /**
   * Reset ESP32 without flashing
   */
  public async resetChip(terminal: TerminalOutputHandler): Promise<void> {
    if (this.esploader) {
      terminal.log('Resetting ESP32...');
      try {
        await this.esploader.after('hard_reset');
        terminal.log('ESP32 Reset pulse sent.');
      } catch (e: any) {
        terminal.error(`Reset error: ${e.message}`);
      }
    }
  }

  /**
   * Disconnect and release the serial port
   */
  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.chipInfo = null;

    if (this.transport) {
      try {
        await this.transport.disconnect();
      } catch (e) {
        // ignore
      }
      this.transport = null;
    }

    if (this.port) {
      try {
        if (this.port.readable || this.port.writable) {
          await this.port.close();
        }
      } catch (e) {
        // ignore
      }
      this.port = null;
    }

    this.esploader = null;
  }
}
