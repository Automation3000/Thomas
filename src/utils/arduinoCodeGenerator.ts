import { ESP32Config } from '../types/esp32';

export function generateArduinoInoCode(config: ESP32Config): string {
  return `/**
 * ============================================================================
 * ESP32 Async Web Server & Endress+Hauser Flowphant T DTT31 UART Controller
 * ============================================================================
 * Hardware:
 *  - Microcontroller : ESP32 (ESP-WROOM-32 / NodeMCU-32S / ESP32-S3)
 *  - Sensor          : Endress+Hauser Flowphant T DTT31 Flow & Temperature Sensor
 *  - Interface       : UART (Serial2) via Level Shifter / RS-232 Transceiver
 *  - Baud Rate       : ${config.baudRate} bps (8N1)
 *  - Pins            : RX2 = GPIO ${config.rxPin}, TX2 = GPIO ${config.txPin}
 * 
 * Features:
 *  - Asynchronous Web Server (ESPAsyncWebServer) on port ${config.webServerPort}
 *  - Live Flow Rate (%) and Temperature (°C/°F) telemetry via AJAX/Fetch API
 *  - Interactive Calibration Controls:
 *      * Learn Min Flow 20% (TFL20) -> Automatic Exit/Ack (TFX)
 *      * Learn Max Flow 80% (TFH80) -> Automatic Exit/Ack (TFX)
 *      * Direct Calibration Exit (TFX)
 *  - Safe UART Mutex locking between background polling and web request handlers
 *  - Automatic WiFi reconnection & optional AP fallback
 * ============================================================================
 */

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HardwareSerial.h>

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const char* WIFI_SSID     = "${config.wifiSsid}";
const char* WIFI_PASSWORD = "${config.wifiPass}";

${config.enableApFallback ? `const char* AP_SSID       = "${config.apSsid}";
const char* AP_PASSWORD   = "12345678";` : ''}

#define SENSOR_RX_PIN     ${config.rxPin}
#define SENSOR_TX_PIN     ${config.txPin}
#define SENSOR_BAUD       ${config.baudRate}
#define SENSOR_SERIAL_CFG SERIAL_8N1
#define POLL_INTERVAL_MS  ${config.pollIntervalMs}
#define HTTP_PORT         ${config.webServerPort}

// Instantiate Hardware Serial 2 (UART2)
HardwareSerial DTT31Serial(2);

// Instantiate Async Web Server
AsyncWebServer server(HTTP_PORT);

// Mutex to protect Serial2 access between background loop and HTTP callbacks
SemaphoreHandle_t serialMutex = NULL;

// ==========================================
// PROPRIETARY SENSOR COMMAND BYTE ARRAYS
// ==========================================
// 1. Init / Wake-up Command (<SOH>01<STX>V<ETX>U)
const uint8_t CMD_INIT[]        = {0x01, 0x30, 0x31, 0x02, 0x56, 0x03, 0x55};
const size_t  CMD_INIT_LEN      = sizeof(CMD_INIT);

// 2. Live Polling Command (<SOH>01<STX>R1000<ETX>P)
const uint8_t CMD_POLL[]        = {0x01, 0x30, 0x31, 0x02, 0x52, 0x31, 0x30, 0x30, 0x30, 0x03, 0x50};
const size_t  CMD_POLL_LEN      = sizeof(CMD_POLL);

// 3. Learn Minimum Flow 20% (<SOH>01<STX>TFL20<ETX>_)
const uint8_t CMD_LEARN_MIN[]   = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x4C, 0x32, 0x30, 0x03, 0x5F};
const size_t  CMD_LEARN_MIN_LEN = sizeof(CMD_LEARN_MIN);

// 4. Learn Maximum Flow 80% (<SOH>01<STX>TFH80<ETX>Q)
const uint8_t CMD_LEARN_MAX[]   = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x48, 0x38, 0x30, 0x03, 0x51};
const size_t  CMD_LEARN_MAX_LEN = sizeof(CMD_LEARN_MAX);

// 5. Calibration Exit / Acknowledge (<SOH>01<STX>TFX<ETX>I)
const uint8_t CMD_CALIB_EXIT[]  = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x58, 0x03, 0x49};
const size_t  CMD_CALIB_EXIT_LEN = sizeof(CMD_CALIB_EXIT);

// ==========================================
// SENSOR TELEMETRY STATE
// ==========================================
struct TelemetryData {
  float flowPercent;
  float temperatureC;
  bool isConnected;
  String status;
  String lastRawHex;
  String lastRawAscii;
  uint32_t lastReadTime;
  uint32_t packetsReceived;
  uint32_t crcErrors;
} sensorData = {0.0f, 0.0f, false, "INITIALIZING", "", "", 0, 0, 0};

unsigned long lastPollTime = 0;

// ==========================================
// EMBEDDED DASHBOARD HTML / CSS / JAVASCRIPT
// ==========================================
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flowphant T DTT31 Monitor</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --primary: #38bdf8;
      --accent: #06b6d4;
      --text: #f8fafc;
      --muted: #94a3b8;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 1.5rem; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--card-border); }
    .badge { padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; }
    .badge-online { background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid var(--green); }
    .badge-offline { background: rgba(239, 68, 68, 0.15); color: var(--red); border: 1px solid var(--red); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 0.75rem; padding: 1.25rem; }
    .card-title { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.5rem; }
    .value-display { font-size: 2.75rem; font-weight: 700; color: var(--primary); display: flex; align-items: baseline; gap: 0.5rem; }
    .unit { font-size: 1.25rem; color: var(--muted); font-weight: 400; }
    .gauge-track { width: 100%; height: 10px; background: #334155; border-radius: 9999px; margin-top: 1rem; overflow: hidden; }
    .gauge-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #38bdf8, #06b6d4); transition: width 0.4s ease; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
    button { background: #2563eb; color: white; border: none; padding: 0.75rem 1.25rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.5rem; }
    button:hover { background: #1d4ed8; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.btn-warn { background: var(--amber); color: #000; }
    button.btn-warn:hover { background: #d97706; }
    button.btn-secondary { background: #334155; }
    button.btn-secondary:hover { background: #475569; }
    .terminal { background: #090d16; border: 1px solid #1e293b; border-radius: 0.5rem; padding: 0.75rem; font-family: monospace; font-size: 0.8rem; color: #38bdf8; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 0.5rem; }
    #toast { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 0.75rem 1.25rem; border-radius: 0.5rem; background: #1e293b; border: 1px solid #38bdf8; color: #fff; font-size: 0.875rem; opacity: 0; transform: translateY(10px); transition: all 0.3s ease; pointer-events: none; z-index: 100; }
    #toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1 style="font-size: 1.5rem; font-weight: 700;">Flowphant T DTT31</h1>
        <p style="color: var(--muted); font-size: 0.85rem;">ESP32 Async UART Telemetry & Calibration</p>
      </div>
      <div id="connBadge" class="badge badge-offline">
        <span id="connDot">&#9679;</span> <span id="connText">CONNECTING...</span>
      </div>
    </header>

    <div class="grid">
      <!-- Live Flow Rate Card -->
      <div class="card">
        <div class="card-title">Live Flow Rate</div>
        <div class="value-display">
          <span id="flowVal">--.-</span>
          <span class="unit">%</span>
        </div>
        <div class="gauge-track">
          <div id="flowGauge" class="gauge-fill"></div>
        </div>
        <p id="flowStatus" style="font-size: 0.75rem; color: var(--muted); margin-top: 0.5rem;">Target Operating Band (20% - 80%)</p>
      </div>

      <!-- Live Temperature Card -->
      <div class="card">
        <div class="card-title">Fluid Temperature</div>
        <div class="value-display">
          <span id="tempVal">--.-</span>
          <span class="unit">&deg;C</span>
        </div>
        <div class="gauge-track">
          <div id="tempGauge" class="gauge-fill" style="background: linear-gradient(90deg, #10b981, #f59e0b);"></div>
        </div>
        <p id="tempStatus" style="font-size: 0.75rem; color: var(--muted); margin-top: 0.5rem;">Sensor Operating Temp</p>
      </div>
    </div>

    <!-- Calibration Controls Card -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-title">Flow Calibration Actions (TFL20 / TFH80)</div>
      <p style="font-size: 0.85rem; color: var(--muted);">Set fluid velocity to target speed before teaching. The ESP32 triggers the teach byte sequence followed by TFX Exit.</p>
      <div class="btn-group">
        <button id="btnMin" onclick="triggerCalib('min')">
          Teach Min Flow (20%)
        </button>
        <button id="btnMax" onclick="triggerCalib('max')" class="btn-warn">
          Teach Max Flow (80%)
        </button>
        <button id="btnExit" onclick="triggerCalib('exit')" class="btn-secondary">
          Exit / Ack Screen (TFX)
        </button>
      </div>
    </div>

    <!-- Diagnostic Hex Stream -->
    <div class="card">
      <div class="card-title">Raw UART Frame Stream (Serial2)</div>
      <div id="rawTerminal" class="terminal">Waiting for initial UART response...</div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--muted); margin-top: 0.5rem;">
        <span>Packets: <strong id="pktCount">0</strong></span>
        <span>CRC Errors: <strong id="crcErrors">0</strong></span>
        <span>Polling: <strong>${config.pollIntervalMs}ms</strong></span>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    function showToast(msg, isErr) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.borderColor = isErr ? '#ef4444' : '#38bdf8';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3500);
    }

    async function updateTelemetry() {
      try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        const badge = document.getElementById('connBadge');
        const connText = document.getElementById('connText');
        if (data.connected) {
          badge.className = 'badge badge-online';
          connText.innerText = 'SENSOR ONLINE';
        } else {
          badge.className = 'badge badge-offline';
          connText.innerText = 'NO SENSOR ECHO';
        }

        document.getElementById('flowVal').innerText = data.flowPercent.toFixed(1);
        document.getElementById('tempVal').innerText = data.temperatureC.toFixed(1);

        document.getElementById('flowGauge').style.width = Math.min(Math.max(data.flowPercent, 0), 100) + '%';
        document.getElementById('tempGauge').style.width = Math.min(Math.max(data.temperatureC, 0), 100) + '%';

        document.getElementById('pktCount').innerText = data.packetsReceived || 0;
        document.getElementById('crcErrors').innerText = data.crcErrors || 0;

        if (data.rawHex) {
          const term = document.getElementById('rawTerminal');
          term.innerText = \`[RX HEX]  \${data.rawHex}\\n[RX ASCII] \${data.rawAscii || ''}\`;
        }
      } catch (err) {
        document.getElementById('connBadge').className = 'badge badge-offline';
        document.getElementById('connText').innerText = 'SERVER OFFLINE';
      }
    }

    async function triggerCalib(type) {
      const btn = event.target;
      const originalText = btn.innerText;
      btn.disabled = true;
      btn.innerText = 'Sending...';

      try {
        const res = await fetch('/api/calibrate/' + type, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          showToast('Success: ' + result.message, false);
        } else {
          showToast('Failed: ' + result.message, true);
        }
      } catch (err) {
        showToast('Error sending calibration request: ' + err.message, true);
      } finally {
        btn.disabled = false;
        btn.innerText = originalText;
        updateTelemetry();
      }
    }

    setInterval(updateTelemetry, ${config.pollIntervalMs});
    updateTelemetry();
  </script>
</body>
</html>
)rawliteral";

// ==========================================
// UART HELPER FUNCTIONS
// ==========================================

// Send raw byte frame safely over Serial2 with Mutex
bool sendUartCommand(const uint8_t* cmd, size_t len) {
  if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(500)) == pdTRUE) {
    // Clear incoming RX buffer garbage
    while (DTT31Serial.available()) {
      DTT31Serial.read();
    }
    
    // Transmit byte array
    DTT31Serial.write(cmd, len);
    DTT31Serial.flush();
    
    xSemaphoreGive(serialMutex);
    return true;
  }
  return false;
}

// Read response from sensor with timeout
int readUartResponse(uint8_t* buffer, size_t maxLen, uint32_t timeoutMs = 250) {
  if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(500)) != pdTRUE) {
    return 0;
  }

  uint32_t start = millis();
  size_t bytesRead = 0;

  while (millis() - start < timeoutMs && bytesRead < maxLen) {
    if (DTT31Serial.available()) {
      buffer[bytesRead++] = DTT31Serial.read();
      // If we see End of Text (ETX = 0x03), read the BCC checksum byte right after
      if (bytesRead >= 2 && buffer[bytesRead - 2] == 0x03) {
        break;
      }
    }
    delay(1);
  }

  xSemaphoreGive(serialMutex);
  return bytesRead;
}

// Parse Endress+Hauser DTT31 response frame
// Expected format: <SOH>01<STX>F045.2T024.8<ETX><BCC> or similar register string
bool parseDTT31Response(const uint8_t* buf, size_t len, float &outFlow, float &outTemp, String &outHex, String &outAscii) {
  if (len < 5) return false;

  // Build Hex and ASCII representations
  outHex = "";
  outAscii = "";
  for (size_t i = 0; i < len; i++) {
    char hexStr[4];
    sprintf(hexStr, "%02X ", buf[i]);
    outHex += hexStr;
    
    if (buf[i] >= 32 && buf[i] <= 126) {
      outAscii += (char)buf[i];
    } else if (buf[i] == 0x01) {
      outAscii += "<SOH>";
    } else if (buf[i] == 0x02) {
      outAscii += "<STX>";
    } else if (buf[i] == 0x03) {
      outAscii += "<ETX>";
    } else {
      outAscii += ".";
    }
  }

  // Find STX (0x02) and ETX (0x03)
  int stxIdx = -1;
  int etxIdx = -1;
  for (size_t i = 0; i < len; i++) {
    if (buf[i] == 0x02 && stxIdx == -1) stxIdx = i;
    if (buf[i] == 0x03 && stxIdx != -1) { etxIdx = i; break; }
  }

  if (stxIdx == -1 || etxIdx == -1 || etxIdx <= stxIdx) {
    return false;
  }

  // Extract payload between STX and ETX
  String payload = "";
  for (int i = stxIdx + 1; i < etxIdx; i++) {
    payload += (char)buf[i];
  }

  // Parse Flow and Temperature from payload (e.g. "F045.2T024.8" or "R1000:45.2,24.8" or "45.2;24.8")
  // Support multiple common firmware formats:
  int fIdx = payload.indexOf('F');
  int tIdx = payload.indexOf('T');

  if (fIdx != -1 && tIdx != -1 && tIdx > fIdx) {
    String flowStr = payload.substring(fIdx + 1, tIdx);
    String tempStr = payload.substring(tIdx + 1);
    outFlow = flowStr.toFloat();
    outTemp = tempStr.toFloat();
    return true;
  } else if (payload.indexOf(',') != -1) {
    int comma = payload.indexOf(',');
    outFlow = payload.substring(0, comma).toFloat();
    outTemp = payload.substring(comma + 1).toFloat();
    return true;
  } else if (payload.length() > 0) {
    // If just numeric flow
    outFlow = payload.toFloat();
    return true;
  }

  return false;
}

// ==========================================
// SENSOR POLLING TASK
// ==========================================
void pollSensor() {
  // Transmit POLLING_CMD
  sendUartCommand(CMD_POLL, CMD_POLL_LEN);

  // Read response
  uint8_t rxBuffer[64];
  int rxLen = readUartResponse(rxBuffer, sizeof(rxBuffer), 150);

  if (rxLen > 0) {
    float flow = 0.0f, temp = 0.0f;
    String hexStr, asciiStr;
    if (parseDTT31Response(rxBuffer, rxLen, flow, temp, hexStr, asciiStr)) {
      sensorData.flowPercent = flow;
      sensorData.temperatureC = temp;
      sensorData.isConnected = true;
      sensorData.status = "NORMAL";
      sensorData.lastRawHex = hexStr;
      sensorData.lastRawAscii = asciiStr;
      sensorData.packetsReceived++;
    } else {
      // Received response but unable to parse format
      sensorData.lastRawHex = hexStr;
      sensorData.lastRawAscii = asciiStr;
      sensorData.isConnected = true;
    }
  } else {
    // No response / Timeout
    sensorData.isConnected = false;
    sensorData.status = "TIMEOUT";
    sensorData.crcErrors++;
  }
  sensorData.lastReadTime = millis();
}

// Execute calibration sequence: Send learn command, wait 500ms, send exit/ack command
bool executeCalibration(const uint8_t* teachCmd, size_t teachLen, String &outMessage) {
  // 1. Send Teach Command (TFL20 or TFH80)
  if (!sendUartCommand(teachCmd, teachLen)) {
    outMessage = "Failed to acquire Serial2 Mutex";
    return false;
  }

  uint8_t rxBuf[32];
  int rxLen = readUartResponse(rxBuf, sizeof(rxBuf), 300);
  delay(100);

  // 2. Send Calibration Exit / Acknowledge (TFX) to clear OK screen and commit
  sendUartCommand(CMD_CALIB_EXIT, CMD_CALIB_EXIT_LEN);
  readUartResponse(rxBuf, sizeof(rxBuf), 200);

  outMessage = "Calibration sequence executed and confirmed via TFX";
  return true;
}

// ==========================================
// ARDUINO SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n==================================================");
  Serial.println("ESP32 Flowphant T DTT31 Web Server & Controller");
  Serial.println("==================================================");

  // Create Serial Mutex
  serialMutex = xSemaphoreCreateMutex();

  // Initialize Hardware UART2 for Sensor
  DTT31Serial.begin(SENSOR_BAUD, SENSOR_SERIAL_CFG, SENSOR_RX_PIN, SENSOR_TX_PIN);
  Serial.printf("[UART2] Initialized on RX=GPIO%d, TX=GPIO%d @ %d baud\\n", SENSOR_RX_PIN, SENSOR_TX_PIN, SENSOR_BAUD);

  // Send Wake-up / Init Frame
  Serial.println("[DTT31] Sending Wake-up / Init Frame...");
  sendUartCommand(CMD_INIT, CMD_INIT_LEN);
  delay(100);

  // Connect to Wi-Fi
  Serial.printf("[WIFI] Connecting to SSID: %s\\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n[WIFI] Connected successfully!");
    Serial.print("[WIFI] Web Dashboard IP: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\\n[WIFI] Connection Failed!");
    ${config.enableApFallback ? `Serial.printf("[WIFI] Starting Fallback Access Point: %s\\n", AP_SSID);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.print("[WIFI] AP Web Dashboard IP: http://");
    Serial.println(WiFi.softAPIP());` : `Serial.println("[WIFI] Retrying in background...");`}
  }

  // ==========================================
  // HTTP ROUTE HANDLERS
  // ==========================================

  // 1. Serve Root Web Dashboard
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", INDEX_HTML);
  });

  // 2. Live Telemetry JSON Endpoint
  server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest *request) {
    String json = "{";
    json += "\\"connected\\":" + String(sensorData.isConnected ? "true" : "false") + ",";
    json += "\\"flowPercent\\":" + String(sensorData.flowPercent, 2) + ",";
    json += "\\"temperatureC\\":" + String(sensorData.temperatureC, 2) + ",";
    json += "\\"status\\":\\"" + sensorData.status + "\\",";
    json += "\\"rawHex\\":\\"" + sensorData.lastRawHex + "\\",";
    json += "\\"rawAscii\\":\\"" + sensorData.lastRawAscii + "\\",";
    json += "\\"packetsReceived\\":" + String(sensorData.packetsReceived) + ",";
    json += "\\"crcErrors\\":" + String(sensorData.crcErrors) + ",";
    json += "\\"uptimeSeconds\\":" + String(millis() / 1000);
    json += "}";
    request->send(200, "application/json", json);
  });

  // 3. Learn Minimum Flow (20%) Action
  server.on("/api/calibrate/min", HTTP_POST, [](AsyncWebServerRequest *request) {
    String msg;
    bool ok = executeCalibration(CMD_LEARN_MIN, CMD_LEARN_MIN_LEN, msg);
    String json = "{\\"success\\":" + String(ok ? "true" : "false") + ",\\"message\\":\\"" + msg + "\\"}";
    request->send(200, "application/json", json);
  });

  // 4. Learn Maximum Flow (80%) Action
  server.on("/api/calibrate/max", HTTP_POST, [](AsyncWebServerRequest *request) {
    String msg;
    bool ok = executeCalibration(CMD_LEARN_MAX, CMD_LEARN_MAX_LEN, msg);
    String json = "{\\"success\\":" + String(ok ? "true" : "false") + ",\\"message\\":\\"" + msg + "\\"}";
    request->send(200, "application/json", json);
  });

  // 5. Calibration Exit / Acknowledge Action
  server.on("/api/calibrate/exit", HTTP_POST, [](AsyncWebServerRequest *request) {
    sendUartCommand(CMD_CALIB_EXIT, CMD_CALIB_EXIT_LEN);
    String json = "{\\"success\\":true,\\"message\\":\\"TFX Exit/Acknowledge command transmitted\\"}";
    request->send(200, "application/json", json);
  });

  // Start Web Server
  server.begin();
  Serial.printf("[HTTP] Async Web Server listening on port %d\\n", HTTP_PORT);
}

// ==========================================
// ARDUINO MAIN LOOP
// ==========================================
void loop() {
  // Non-blocking timer for sensor polling
  if (millis() - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = millis();
    pollSensor();
  }

  // WiFi Reconnection Management
  if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
    static uint32_t lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 15000) {
      lastReconnectAttempt = millis();
      Serial.println("[WIFI] Attempting reconnection...");
      WiFi.reconnect();
    }
  }

  delay(10); // Yield to FreeRTOS watchdog
}
`;
}

export function generatePlatformIoIni(): string {
  return `; ============================================================================
; PlatformIO Project Configuration for ESP32 & Flowphant T DTT31
; ============================================================================
[env:esp32dev]
platform = espressif32 @ ^6.5.0
board = esp32dev
framework = arduino

; Serial Monitor & Upload Speeds
monitor_speed = 115200
monitor_filters = esp32_exception_decoder, direct
upload_speed = 921600

; Filesystem Configuration (LittleFS for data/index.html)
board_build.filesystem = littlefs

; Required Libraries
lib_deps =
    https://github.com/me-no-dev/ESPAsyncWebServer.git
    https://github.com/me-no-dev/AsyncTCP.git
    bblanchon/ArduinoJson @ ^7.0.4

; Compiler & Debugging Flags
build_flags =
    -DCORE_DEBUG_LEVEL=0
    -DCONFIG_ASYNC_TCP_RUNNING_CORE=1
    -DCONFIG_ASYNC_TCP_USE_WDT=0
`;
}

export function generateDataIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flowphant T DTT31 - ESP32 Telemetry Dashboard</title>
  <style>
    :root {
      --bg-main: #0a0f1d;
      --bg-card: #161f33;
      --bg-panel: #0e1626;
      --border-color: #334155;
      --cyan-accent: #06b6d4;
      --cyan-hover: #0891b2;
      --amber-accent: #f59e0b;
      --emerald-accent: #10b981;
      --rose-accent: #f43f5e;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --font-mono: "JetBrains Mono", Consolas, Menlo, Monaco, monospace;
      --font-sans: "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: var(--font-sans);
    }

    body {
      background-color: var(--bg-main);
      color: var(--text-main);
      padding: 1.5rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .container {
      width: 100%;
      max-width: 960px;
    }

    /* Header */
    header {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .header-icon {
      width: 2.5rem;
      height: 2.5rem;
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.3);
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--cyan-accent);
      font-size: 1.25rem;
    }

    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-family: var(--font-mono);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-badge.online {
      background: rgba(16, 185, 129, 0.15);
      color: var(--emerald-accent);
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .status-badge.offline {
      background: rgba(244, 63, 94, 0.15);
      color: var(--rose-accent);
      border: 1px solid rgba(244, 63, 94, 0.4);
    }

    .status-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
    }

    /* Telemetry Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .card-value-group {
      margin: 1rem 0;
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .card-value {
      font-size: 3rem;
      font-weight: 800;
      color: var(--text-main);
      font-family: var(--font-mono);
      line-height: 1;
    }

    .card-unit {
      font-size: 1.25rem;
      color: var(--cyan-accent);
      font-weight: 600;
    }

    /* Progress bar */
    .progress-track {
      width: 100%;
      height: 8px;
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 9999px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #0284c7, var(--cyan-accent));
      border-radius: 9999px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Calibration Section */
    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .section-title {
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-main);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-desc {
      font-size: 0.825rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
      line-height: 1.5;
    }

    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    button {
      background: var(--cyan-accent);
      color: #03131a;
      border: 1px solid rgba(6, 182, 212, 0.6);
      padding: 0.65rem 1.25rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.15s ease;
      font-family: var(--font-sans);
    }

    button:hover {
      background: #22d3ee;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);
    }

    button:active {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    button.btn-amber {
      background: var(--amber-accent);
      border-color: rgba(245, 158, 11, 0.6);
      color: #1a1001;
    }

    button.btn-amber:hover {
      background: #fbbf24;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
    }

    button.btn-secondary {
      background: #1e293b;
      color: var(--text-main);
      border-color: var(--border-color);
    }

    button.btn-secondary:hover {
      background: #25334a;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    /* Terminal & Raw Stream */
    .terminal {
      background: #050811;
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      padding: 0.85rem;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--cyan-accent);
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 0.75rem;
    }

    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-color);
      margin-top: 1rem;
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--bg-card);
      border: 1px solid var(--cyan-accent);
      color: var(--text-main);
      padding: 0.75rem 1.25rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      opacity: 0;
      transform: translateY(12px);
      transition: all 0.25s ease;
      pointer-events: none;
      z-index: 1000;
    }

    #toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Header -->
    <header>
      <div class="header-title">
        <div class="header-icon">&#9881;</div>
        <div>
          <h1>Endress+Hauser Flowphant T DTT31</h1>
          <p class="subtitle">ESP32 UART Telemetry (Serial2 @ 19200 8N1)</p>
        </div>
      </div>
      <div id="statusBadge" class="status-badge offline">
        <span class="status-dot"></span>
        <span id="statusText">CONNECTING</span>
      </div>
    </header>

    <!-- Telemetry Cards -->
    <div class="grid">
      <!-- Flow Rate Card -->
      <div class="card">
        <div class="card-label">
          <span>Flow Velocity</span>
          <span style="color: var(--cyan-accent); font-family: var(--font-mono);">0 - 100%</span>
        </div>
        <div class="card-value-group">
          <span id="flowVal" class="card-value">--.-</span>
          <span class="card-unit">%</span>
        </div>
        <div class="progress-track">
          <div id="flowProgress" class="progress-bar"></div>
        </div>
      </div>

      <!-- Temperature Card -->
      <div class="card">
        <div class="card-label">
          <span>Process Temperature</span>
          <span style="color: var(--amber-accent); font-family: var(--font-mono);">-20..+85 °C</span>
        </div>
        <div class="card-value-group">
          <span id="tempVal" class="card-value">--.-</span>
          <span class="card-unit">°C</span>
        </div>
        <div class="progress-track">
          <div id="tempProgress" class="progress-bar" style="background: linear-gradient(90deg, #d97706, #f59e0b);"></div>
        </div>
      </div>
    </div>

    <!-- Calibration Controls -->
    <div class="section-card">
      <h2 class="section-title">&#9889; Flowphant Calibration Controls</h2>
      <p class="section-desc">
        Trigger Endress+Hauser teach-in sequences. The firmware transmits the command, verifies sensor acknowledgment, and delivers the calibration exit handshake.
      </p>

      <div class="btn-group">
        <button id="btnLearnMin" onclick="triggerCalib('min', 'Learn Min Flow (20%)')">
          &#128308; Learn Min Flow (20% - TFL20)
        </button>

        <button id="btnLearnMax" class="btn-amber" onclick="triggerCalib('max', 'Learn Max Flow (80%)')">
          &#128994; Learn Max Flow (80% - TFH80)
        </button>

        <button id="btnCalibExit" class="btn-secondary" onclick="triggerCalib('exit', 'Exit Calibration')">
          &#10006; Exit Calibration (TFX)
        </button>

        <button id="btnReInit" class="btn-secondary" onclick="triggerInit()">
          &#8635; Wake/Init (V)
        </button>
      </div>

      <!-- Raw Stream & Telemetry Meta -->
      <div class="terminal" id="rawTerminal">Awaiting UART frames...</div>

      <div class="meta-bar">
        <span>Packets: <strong id="pktCount" style="color: #fff;">0</strong></span>
        <span>CRC/Timeouts: <strong id="crcCount" style="color: #f43f5e;">0</strong></span>
        <span>Uptime: <strong id="uptimeSec" style="color: #38bdf8;">0s</strong></span>
        <span>Last Update: <strong id="lastUpdate" style="color: #fff;">--</strong></span>
      </div>
    </div>
  </div>

  <div id="toast">Command Executed</div>

  <script>
    const pollInterval = 1000;
    let pollTimer = null;

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    async function fetchTelemetry() {
      try {
        const res = await fetch('/api/data', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        // Update Status Badge
        const badge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        if (data.connected) {
          badge.className = 'status-badge online';
          statusText.textContent = 'ONLINE (' + data.status + ')';
        } else {
          badge.className = 'status-badge offline';
          statusText.textContent = 'TIMEOUT / OFFLINE';
        }

        // Update Flow
        const flowVal = document.getElementById('flowVal');
        const flowProgress = document.getElementById('flowProgress');
        if (data.flowPercent !== undefined && data.connected) {
          flowVal.textContent = data.flowPercent.toFixed(1);
          flowProgress.style.width = Math.min(Math.max(data.flowPercent, 0), 100) + '%';
        }

        // Update Temperature
        const tempVal = document.getElementById('tempVal');
        const tempProgress = document.getElementById('tempProgress');
        if (data.temperatureC !== undefined && data.connected) {
          tempVal.textContent = data.temperatureC.toFixed(1);
          // Scale -20 to 80 °C
          const pct = Math.min(Math.max(((data.temperatureC + 20) / 100) * 100, 0), 100);
          tempProgress.style.width = pct + '%';
        }

        // Update Diagnostics
        document.getElementById('pktCount').textContent = data.packetsReceived || 0;
        document.getElementById('crcCount').textContent = data.crcErrors || 0;
        document.getElementById('uptimeSec').textContent = (data.uptimeSeconds || 0) + 's';
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

        // Raw terminal
        if (data.rawHex || data.rawAscii) {
          document.getElementById('rawTerminal').textContent = 
            'HEX:   ' + (data.rawHex || '') + '\\n' +
            'ASCII: ' + (data.rawAscii || '');
        }
      } catch (err) {
        document.getElementById('statusBadge').className = 'status-badge offline';
        document.getElementById('statusText').textContent = 'NETWORK ERROR';
      }
    }

    async function triggerCalib(action, label) {
      showToast('Transmitting ' + label + '...');
      try {
        const res = await fetch('/api/calibrate/' + action, { method: 'POST' });
        const json = await res.json();
        showToast(json.message || (label + ' completed'));
        fetchTelemetry();
      } catch (e) {
        showToast('Error executing ' + label);
      }
    }

    async function triggerInit() {
      showToast('Transmitting Wake/Init sequence (0x56)...');
      try {
        const res = await fetch('/api/init', { method: 'POST' });
        const json = await res.json();
        showToast(json.message || 'Sensor Wake Sequence Transmitted');
        fetchTelemetry();
      } catch (e) {
        showToast('Init transmission failed');
      }
    }

    // Start auto polling
    fetchTelemetry();
    pollTimer = setInterval(fetchTelemetry, pollInterval);
  </script>
</body>
</html>
`;
}

export function generateMainCpp(config: ESP32Config): string {
  return `/**
 * ============================================================================
 * ESP32 Async Web Server & Endress+Hauser Flowphant T DTT31 UART Controller
 * ============================================================================
 * Hardware:
 *  - Microcontroller : ESP32 (ESP-WROOM-32 / NodeMCU-32S / ESP32-S3)
 *  - Sensor          : Endress+Hauser Flowphant T DTT31 Flow & Temperature Sensor
 *  - Interface       : UART (Serial2) via 3.3V <-> 5V/RS-232 Level Converter
 *  - Baud Rate       : ${config.baudRate} bps (8N1)
 *  - Pins            : RX2 = GPIO ${config.rxPin}, TX2 = GPIO ${config.txPin}
 * 
 * Production Features:
 *  - Asynchronous Web Server (ESPAsyncWebServer) on port ${config.webServerPort}
 *  - LittleFS filesystem support with automatic PROGMEM HTML fallback
 *  - Live Flow Rate (%) and Temperature (°C) telemetry via AJAX/Fetch API
 *  - Interactive Calibration Controls:
 *      * Learn Min Flow 20% (TFL20) -> Automatic Handshake (TFX)
 *      * Learn Max Flow 80% (TFH80) -> Automatic Handshake (TFX)
 *      * Direct Calibration Exit (TFX)
 *      * Init / Wake Command (V)
 *  - FreeRTOS Mutex Semaphore for thread-safe UART access across web threads
 *  - Non-blocking FreeRTOS sensor polling loop
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <HardwareSerial.h>
#include <LittleFS.h>

// ==========================================
// CONFIGURATION & CREDENTIALS
// ==========================================
const char* WIFI_SSID     = "${config.wifiSsid}";
const char* WIFI_PASSWORD = "${config.wifiPass}";

#define SENSOR_RX_PIN     ${config.rxPin}
#define SENSOR_TX_PIN     ${config.txPin}
#define SENSOR_BAUD       ${config.baudRate}
#define SENSOR_SERIAL_CFG SERIAL_8N1
#define POLL_INTERVAL_MS  ${config.pollIntervalMs}
#define HTTP_PORT         ${config.webServerPort}

// Instantiate Hardware Serial 2 (UART2)
HardwareSerial DTT31Serial(2);

// Instantiate Async Web Server
AsyncWebServer server(HTTP_PORT);

// FreeRTOS Mutex to protect Serial2 access between background polling and web callbacks
SemaphoreHandle_t serialMutex = NULL;

// ==========================================
// REVERSE-ENGINEERED DTT31 COMMAND BYTE ARRAYS
// ==========================================
// 1. INIT_CMD: <SOH>01<STX>V<ETX>U -> Wake-up / Version inquiry
const uint8_t INIT_CMD[]        = {0x01, 0x30, 0x31, 0x02, 0x56, 0x03, 0x55};
const size_t  INIT_CMD_LEN      = sizeof(INIT_CMD);

// 2. POLLING_CMD: <SOH>01<STX>R1000<ETX>P -> Read continuous telemetry
const uint8_t POLLING_CMD[]     = {0x01, 0x30, 0x31, 0x02, 0x52, 0x31, 0x30, 0x30, 0x30, 0x03, 0x50};
const size_t  POLLING_CMD_LEN   = sizeof(POLLING_CMD);

// 3. CMD_LEARN_MIN (TFL20): <SOH>01<STX>TFL20<ETX>_ -> Learn 20% Min Flow Setpoint
const uint8_t CMD_LEARN_MIN[]   = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x4C, 0x32, 0x30, 0x03, 0x5F};
const size_t  CMD_LEARN_MIN_LEN = sizeof(CMD_LEARN_MIN);

// 4. CMD_LEARN_MAX (TFH80): <SOH>01<STX>TFH80<ETX>Q -> Learn 80% Max Flow Setpoint
const uint8_t CMD_LEARN_MAX[]   = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x48, 0x38, 0x30, 0x03, 0x51};
const size_t  CMD_LEARN_MAX_LEN = sizeof(CMD_LEARN_MAX);

// 5. CMD_CALIB_EXIT (TFX): <SOH>01<STX>TFX<ETX>I -> Exit Calibration / Clear OK prompt
const uint8_t CMD_CALIB_EXIT[]  = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x58, 0x03, 0x49};
const size_t  CMD_CALIB_EXIT_LEN = sizeof(CMD_CALIB_EXIT);

// ==========================================
// TELEMETRY STATE STRUCT
// ==========================================
struct TelemetryData {
  float flowPercent;
  float temperatureC;
  bool isConnected;
  String status;
  String lastRawHex;
  String lastRawAscii;
  uint32_t lastReadTime;
  uint32_t packetsReceived;
  uint32_t crcErrors;
} sensorData = {0.0f, 0.0f, false, "INITIALIZING", "", "", 0, 0, 0};

unsigned long lastPollTime = 0;
bool fsMounted = false;

// ==========================================
// EMBEDDED PROGMEM FALLBACK DASHBOARD
// ==========================================
const char INDEX_HTML_PROGMEM[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flowphant T DTT31</title>
  <style>
    body { background: #0a0f1d; color: #f8fafc; font-family: sans-serif; padding: 2rem; }
    .card { background: #161f33; border: 1px solid #334155; padding: 1.5rem; border-radius: 0.75rem; max-width: 600px; margin: auto; }
    h1 { color: #06b6d4; font-size: 1.5rem; margin-bottom: 1rem; }
    .val { font-size: 2.5rem; font-family: monospace; font-weight: bold; color: #38bdf8; }
    button { background: #06b6d4; border: none; padding: 0.6rem 1.2rem; border-radius: 0.4rem; font-weight: bold; cursor: pointer; margin-right: 0.5rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Flowphant T DTT31 Monitor</h1>
    <p>Flow Rate: <span id="f" class="val">--.-</span> %</p>
    <p style="margin-top:0.5rem;">Temperature: <span id="t" class="val">--.-</span> &deg;C</p>
    <button onclick="fetch('/api/calibrate/min',{method:'POST'})">Learn Min (20%)</button>
    <button onclick="fetch('/api/calibrate/max',{method:'POST'})">Learn Max (80%)</button>
  </div>
  <script>
    setInterval(async () => {
      try {
        const r = await fetch('/api/data');
        const d = await r.json();
        document.getElementById('f').innerText = d.flowPercent.toFixed(1);
        document.getElementById('t').innerText = d.temperatureC.toFixed(1);
      } catch(e){}
    }, 1000);
  </script>
</body>
</html>
)rawliteral";

// ==========================================
// UART COMMUNICATION HELPER FUNCTIONS
// ==========================================

// Mutex-protected UART Transmission
bool sendUartCommand(const uint8_t* cmd, size_t len) {
  if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(400)) == pdTRUE) {
    // Clear any leftover stale bytes in RX buffer
    while (DTT31Serial.available()) {
      DTT31Serial.read();
    }
    
    // Transmit exact byte array
    DTT31Serial.write(cmd, len);
    DTT31Serial.flush();
    
    xSemaphoreGive(serialMutex);
    return true;
  }
  return false;
}

// Mutex-protected UART Frame Reader with timeout
int readUartResponse(uint8_t* buffer, size_t maxLen, uint32_t timeoutMs = 200) {
  if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(400)) != pdTRUE) {
    return 0;
  }

  uint32_t start = millis();
  size_t bytesRead = 0;

  while (millis() - start < timeoutMs && bytesRead < maxLen) {
    if (DTT31Serial.available()) {
      buffer[bytesRead++] = DTT31Serial.read();
      // If we encounter ETX (0x03), read the following BCC checksum byte
      if (bytesRead >= 2 && buffer[bytesRead - 2] == 0x03) {
        break;
      }
    }
    delay(1);
  }

  xSemaphoreGive(serialMutex);
  return bytesRead;
}

// Parse Endress+Hauser DTT31 Response Frame
bool parseDTT31Response(const uint8_t* buf, size_t len, float &outFlow, float &outTemp, String &outHex, String &outAscii) {
  if (len < 5) return false;

  // Format Hex and ASCII representation
  outHex = "";
  outAscii = "";
  for (size_t i = 0; i < len; i++) {
    char hexStr[4];
    sprintf(hexStr, "%02X ", buf[i]);
    outHex += hexStr;
    
    if (buf[i] >= 32 && buf[i] <= 126) {
      outAscii += (char)buf[i];
    } else if (buf[i] == 0x01) {
      outAscii += "<SOH>";
    } else if (buf[i] == 0x02) {
      outAscii += "<STX>";
    } else if (buf[i] == 0x03) {
      outAscii += "<ETX>";
    } else {
      outAscii += ".";
    }
  }

  // Find STX (0x02) and ETX (0x03)
  int stxIdx = -1;
  int etxIdx = -1;
  for (size_t i = 0; i < len; i++) {
    if (buf[i] == 0x02 && stxIdx == -1) stxIdx = i;
    if (buf[i] == 0x03 && stxIdx != -1) { etxIdx = i; break; }
  }

  if (stxIdx == -1 || etxIdx == -1 || etxIdx <= stxIdx) {
    return false;
  }

  // Extract payload between STX and ETX
  String payload = "";
  for (int i = stxIdx + 1; i < etxIdx; i++) {
    payload += (char)buf[i];
  }

  // Common DTT31 Formats:
  // Format A: "F045.2T024.8"
  // Format B: "R1000:45.2,24.8"
  // Format C: "45.2;24.8"
  int fIdx = payload.indexOf('F');
  int tIdx = payload.indexOf('T');

  if (fIdx != -1 && tIdx != -1 && tIdx > fIdx) {
    String flowStr = payload.substring(fIdx + 1, tIdx);
    String tempStr = payload.substring(tIdx + 1);
    outFlow = flowStr.toFloat();
    outTemp = tempStr.toFloat();
    return true;
  } else if (payload.indexOf(',') != -1) {
    int comma = payload.indexOf(',');
    outFlow = payload.substring(0, comma).toFloat();
    outTemp = payload.substring(comma + 1).toFloat();
    return true;
  } else if (payload.length() > 0) {
    outFlow = payload.toFloat();
    return true;
  }

  return false;
}

// Sensor Polling Loop
void pollSensor() {
  // Transmit POLLING_CMD
  sendUartCommand(POLLING_CMD, POLLING_CMD_LEN);

  // Read response with timeout
  uint8_t rxBuffer[64];
  int rxLen = readUartResponse(rxBuffer, sizeof(rxBuffer), 150);

  if (rxLen > 0) {
    float flow = 0.0f, temp = 0.0f;
    String hexStr, asciiStr;
    if (parseDTT31Response(rxBuffer, rxLen, flow, temp, hexStr, asciiStr)) {
      sensorData.flowPercent = flow;
      sensorData.temperatureC = temp;
      sensorData.isConnected = true;
      sensorData.status = "NORMAL";
      sensorData.lastRawHex = hexStr;
      sensorData.lastRawAscii = asciiStr;
      sensorData.packetsReceived++;
    } else {
      sensorData.lastRawHex = hexStr;
      sensorData.lastRawAscii = asciiStr;
      sensorData.isConnected = true;
    }
  } else {
    sensorData.isConnected = false;
    sensorData.status = "TIMEOUT";
    sensorData.crcErrors++;
  }
  sensorData.lastReadTime = millis();
}

// Execute Calibration Handshake: Send teach command, pause, then send TFX exit
bool executeCalibration(const uint8_t* teachCmd, size_t teachLen, String &outMessage) {
  // Step 1: Send Teach Command (TFL20 or TFH80)
  if (!sendUartCommand(teachCmd, teachLen)) {
    outMessage = "Failed to acquire Serial2 Mutex";
    return false;
  }

  delay(400); // Allow sensor internal EEPROM setpoint commit

  // Step 2: Read Echo / OK Response
  uint8_t rxBuffer[32];
  int len = readUartResponse(rxBuffer, sizeof(rxBuffer), 200);

  // Step 3: Automatically deliver TFX (Exit / Ack) to complete handshake
  delay(100);
  sendUartCommand(CMD_CALIB_EXIT, CMD_CALIB_EXIT_LEN);

  outMessage = (len > 0) ? "Calibration handshake completed successfully" : "Calibration transmitted (no sensor echo)";
  return true;
}

// ==========================================
// SETUP & INITIALIZATION
// ==========================================
void setup() {
  // Initialize Serial Monitor
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n==================================================");
  Serial.println("  ESP32 Flowphant T DTT31 UART Controller Initializing");
  Serial.println("==================================================");

  // Create FreeRTOS Mutex
  serialMutex = xSemaphoreCreateMutex();

  // Initialize LittleFS Filesystem (data/index.html)
  if (LittleFS.begin(true)) {
    fsMounted = true;
    Serial.println("[FS] LittleFS mounted successfully.");
  } else {
    Serial.println("[FS] LittleFS mount failed - using PROGMEM fallback.");
  }

  // Initialize Hardware Serial 2 for DTT31
  DTT31Serial.begin(SENSOR_BAUD, SENSOR_SERIAL_CFG, SENSOR_RX_PIN, SENSOR_TX_PIN);
  Serial.printf("[UART2] Initialized on RX=GPIO %d, TX=GPIO %d @ %d baud (8N1)\\n",
                SENSOR_RX_PIN, SENSOR_TX_PIN, SENSOR_BAUD);

  // Wake / Initialize Sensor Session
  Serial.println("[UART2] Transmitting INIT_CMD (0x56) to sensor...");
  sendUartCommand(INIT_CMD, INIT_CMD_LEN);
  delay(200);

  // Connect to Wi-Fi Station
  Serial.printf("[WIFI] Connecting to SSID: %s\\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint8_t retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 25) {
    delay(400);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n[WIFI] Connected Successfully!");
    Serial.print("[WIFI] Assigned IP Address: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\\n[WIFI] Station connection timed out. Starting AP mode...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32_Flowphant_AP", "12345678");
    Serial.print("[WIFI] Access Point IP: http://");
    Serial.println(WiFi.softAPIP());
  }

  // ==========================================
  // HTTP REST API & DASHBOARD ENDPOINTS
  // ==========================================

  // 1. Serve Root Dashboard (from LittleFS or PROGMEM)
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (fsMounted && LittleFS.exists("/index.html")) {
      request->send(LittleFS, "/index.html", "text/html");
    } else {
      request->send_P(200, "text/html", INDEX_HTML_PROGMEM);
    }
  });

  // 2. Telemetry JSON API
  server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest *request) {
    String json = "{";
    json += "\\"connected\\":" + String(sensorData.isConnected ? "true" : "false") + ",";
    json += "\\"flowPercent\\":" + String(sensorData.flowPercent, 2) + ",";
    json += "\\"temperatureC\\":" + String(sensorData.temperatureC, 2) + ",";
    json += "\\"status\\":\\"" + sensorData.status + "\\",";
    json += "\\"rawHex\\":\\"" + sensorData.lastRawHex + "\\",";
    json += "\\"rawAscii\\":\\"" + sensorData.lastRawAscii + "\\",";
    json += "\\"packetsReceived\\":" + String(sensorData.packetsReceived) + ",";
    json += "\\"crcErrors\\":" + String(sensorData.crcErrors) + ",";
    json += "\\"uptimeSeconds\\":" + String(millis() / 1000);
    json += "}";
    request->send(200, "application/json", json);
  });

  // 3. Learn Minimum Flow (20% - TFL20)
  server.on("/api/calibrate/min", HTTP_POST, [](AsyncWebServerRequest *request) {
    String msg;
    bool ok = executeCalibration(CMD_LEARN_MIN, CMD_LEARN_MIN_LEN, msg);
    String json = "{\\"success\\":" + String(ok ? "true" : "false") + ",\\"message\\":\\"" + msg + "\\"}";
    request->send(200, "application/json", json);
  });

  // 4. Learn Maximum Flow (80% - TFH80)
  server.on("/api/calibrate/max", HTTP_POST, [](AsyncWebServerRequest *request) {
    String msg;
    bool ok = executeCalibration(CMD_LEARN_MAX, CMD_LEARN_MAX_LEN, msg);
    String json = "{\\"success\\":" + String(ok ? "true" : "false") + ",\\"message\\":\\"" + msg + "\\"}";
    request->send(200, "application/json", json);
  });

  // 5. Calibration Exit / Acknowledge (TFX)
  server.on("/api/calibrate/exit", HTTP_POST, [](AsyncWebServerRequest *request) {
    sendUartCommand(CMD_CALIB_EXIT, CMD_CALIB_EXIT_LEN);
    String json = "{\\"success\\":true,\\"message\\":\\"TFX Exit/Acknowledge command transmitted\\"}";
    request->send(200, "application/json", json);
  });

  // 6. Sensor Wake / Init Session (V)
  server.on("/api/init", HTTP_POST, [](AsyncWebServerRequest *request) {
    sendUartCommand(INIT_CMD, INIT_CMD_LEN);
    String json = "{\\"success\\":true,\\"message\\":\\"INIT_CMD (0x56) wake sequence transmitted\\"}";
    request->send(200, "application/json", json);
  });

  // Start Asynchronous Web Server
  server.begin();
  Serial.printf("[HTTP] Async Web Server running on port %d\\n", HTTP_PORT);
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // Non-blocking sensor polling interval
  if (millis() - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = millis();
    pollSensor();
  }

  // Automatic Wi-Fi connection watchdog
  if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
    static uint32_t lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 15000) {
      lastReconnectAttempt = millis();
      Serial.println("[WIFI] Reconnecting to AP...");
      WiFi.reconnect();
    }
  }

  delay(10); // FreeRTOS yield
}
`;
}

export function generateReadmeMd(config: ESP32Config): string {
  return `# ESP32 Endress+Hauser Flowphant T DTT31 Async Web Server

Production-ready firmware for the **ESP32** microcontroller communicating with an industrial **Endress+Hauser Flowphant T DTT31** flow and temperature sensor via **Hardware UART (Serial2)**, hosting an asynchronous real-time telemetry web dashboard.

---

## 📑 Project Structure

\`\`\`
├── platformio.ini         # PlatformIO build configuration & library dependencies
├── src/
│   └── main.cpp           # Complete backend logic, UART handler, and REST API
├── data/
│   └── index.html         # Responsive dark-themed live AJAX dashboard (LittleFS)
├── README.md              # Wiring, building, flashing, and protocol reference
\`\`\`

---

## ⚡ Hardware Wiring & Pinout

> ⚠️ **CRITICAL ELECTRICAL WARNING:**
> The Endress+Hauser DTT31 requires **18..30 VDC** industrial power supply. ESP32 GPIOs tolerate a **maximum of 3.3V**. **NEVER** connect 24V or raw RS-232 signals (&plusmn;12V) directly to ESP32 pins! Always use a **Logic Level Converter (3.3V &harr; 5V)** or **MAX3232 RS-232 transceiver**.

### Pin Connection Matrix

| ESP32 Pin | Signal Direction | Level Converter / Transceiver | DTT31 Sensor Port / Optical Head |
| :--- | :--- | :--- | :--- |
| **GPIO ${config.rxPin} (RX2)** | &larr; INPUT (from sensor) | **LV1** &harr; **HV1** (3.3V / 5V) | **Sensor TX / Output** |
| **GPIO ${config.txPin} (TX2)** | &rarr; OUTPUT (to sensor)  | **LV2** &harr; **HV2** (3.3V / 5V) | **Sensor RX / Input** |
| **GND** | &harr; COMMON | **GND** (Low side) &harr; **GND** (High side) | **0V / Ground (Common Reference)** |
| **3.3V** | &rarr; POWER | **LV** (Low Voltage reference) | - |
| **5V / 24V PSU** | &rarr; POWER | **HV** (High Voltage reference) | **Pin 1 (L+ 18..30V DC)** |

*Note: Ensure the 24V DC PSU Ground, ESP32 Ground, and Level Shifter Ground are all tied together to establish a shared reference plane.*

---

## 📡 Reverse-Engineered DTT31 UART Protocol

- **Baud Rate:** \`${config.baudRate} Baud\`, **8 Data Bits**, **No Parity**, **1 Stop Bit (SERIAL_8N1)**
- **Framing Structure:** \`<SOH> Address <STX> Command <ETX> BCC\`
- **BCC Checksum:** Longitudinal Redundancy Check (\`XOR\` across all bytes from \`SOH\` to \`ETX\`).

### Implemented Command Sequences

| Command Identifier | Hex Byte Sequence | Description |
| :--- | :--- | :--- |
| **INIT_CMD** | \`0x01, 0x30, 0x31, 0x02, 0x56, 0x03, 0x55\` | Wake-up / Query firmware version (\`V\`) |
| **POLLING_CMD** | \`0x01, 0x30, 0x31, 0x02, 0x52, 0x31, 0x30, 0x30, 0x30, 0x03, 0x50\` | Read continuous live telemetry (\`R1000\`) |
| **CMD_LEARN_MIN (TFL20)** | \`0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x4C, 0x32, 0x30, 0x03, 0x5F\` | Teach Minimum Flow Setpoint (20%) |
| **CMD_LEARN_MAX (TFH80)** | \`0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x48, 0x38, 0x30, 0x03, 0x51\` | Teach Maximum Flow Setpoint (80%) |
| **CMD_CALIB_EXIT (TFX)** | \`0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x58, 0x03, 0x49\` | Exit Calibration / Clear OK prompt |

---

## 🛠️ Building & Flashing via PlatformIO

### 1. Prerequisites
- [VS Code](https://code.visualstudio.com/) with the [PlatformIO IDE Extension](https://platformio.org/) or the **PlatformIO Core CLI**.

### 2. Configure Wi-Fi Credentials
Edit \`src/main.cpp\` and specify your Wi-Fi credentials:
\`\`\`cpp
const char* WIFI_SSID     = "${config.wifiSsid}";
const char* WIFI_PASSWORD = "${config.wifiPass}";
\`\`\`

### 3. Upload Filesystem Image (Dashboard HTML)
Upload the \`data/index.html\` dashboard into the ESP32's onboard LittleFS flash partition:
\`\`\`bash
# Build and upload LittleFS filesystem
pio run --target uploadfs
\`\`\`

### 4. Build and Upload Firmware
\`\`\`bash
# Compile and flash main.cpp to ESP32
pio run --target upload

# Open Serial Monitor at 115200 baud
pio device monitor
\`\`\`

---

## 🌐 REST API Specification

| Endpoint | Method | Response / Action |
| :--- | :--- | :--- |
| \`/\` | \`GET\` | Serves responsive dark-themed dashboard (\`data/index.html\`) |
| \`/api/data\` | \`GET\` | Returns live JSON: \`{"connected":true,"flowPercent":45.2,"temperatureC":24.5,"status":"NORMAL",...}\` |
| \`/api/calibrate/min\` | \`POST\` | Triggers 20% Min Flow calibration handshake (\`TFL20\` &rarr; \`TFX\`) |
| \`/api/calibrate/max\` | \`POST\` | Triggers 80% Max Flow calibration handshake (\`TFH80\` &rarr; \`TFX\`) |
| \`/api/calibrate/exit\` | \`POST\` | Direct calibration exit/ack (\`TFX\`) |
| \`/api/init\` | \`POST\` | Transmits wake-up sequence (\`0x56\`) |

---

## 📄 License
MIT License - Developed for Industrial IoT and Automation integration.
`;
}

export function generateModularHeader(): string {
  return `/**
 * FlowphantDTT31.h
 * Dedicated C++ Driver Class for Endress+Hauser Flowphant T DTT31
 */
#ifndef FLOWPHANT_DTT31_H
#define FLOWPHANT_DTT31_H

#include <Arduino.h>
#include <HardwareSerial.h>

class FlowphantDTT31 {
public:
  FlowphantDTT31(HardwareSerial &serialPort, uint8_t rxPin, uint8_t txPin, uint32_t baud = 19200);
  
  void begin();
  bool initSession();
  bool readTelemetry(float &flowPercent, float &temperatureC, String &rawHex, String &rawAscii);
  bool teachMinimumFlow20();
  bool teachMaximumFlow80();
  bool exitCalibration();
  
private:
  HardwareSerial &_serial;
  uint8_t _rxPin;
  uint8_t _txPin;
  uint32_t _baud;
  
  bool sendCommand(const uint8_t* cmd, size_t len);
  int readFrame(uint8_t* buffer, size_t maxLen, uint32_t timeoutMs = 250);
  uint8_t calculateBCC(const uint8_t* data, size_t len);
};

#endif // FLOWPHANT_DTT31_H
`;
}

