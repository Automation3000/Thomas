import { ESP32Config } from '../types/esp32';

export function generateArduinoInoCode(config: ESP32Config): string {
  return generateMainCpp(config);
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
upload_speed = 921600

; Required Libraries
lib_deps =
    https://github.com/me-no-dev/ESPAsyncWebServer.git
    https://github.com/me-no-dev/AsyncTCP.git
`;
}

export function generateDataIndexHtml(): string {
  return `<!-- 
  NOTE: This project uses a PROGMEM embedded WebApp to avoid file system (SPIFFS/LittleFS) overhead.
  The HTML, CSS, and JS below is identical to the rawliteral string found in the main C++ code.
-->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flowphant IoT Gateway</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 20px; }
        h1 { color: #00ffcc; text-align: center; border-bottom: 1px solid #333; padding-bottom: 15px; font-weight: 300; }
        .card { background: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        h2 { margin-top: 0; color: #fff; font-size: 1.2rem; margin-bottom: 15px; }
        .btn { background: #2a2a2a; color: #00ffcc; border: 1px solid #00ffcc; padding: 12px 15px; cursor: pointer; border-radius: 6px; font-weight: bold; transition: all 0.2s ease; width: 100%; }
        .btn:hover { background: #00ffcc; color: #121212; box-shadow: 0 0 10px rgba(0, 255, 204, 0.4); }
        .btn:active { transform: scale(0.98); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .config-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed #333; padding-bottom: 8px; }
        input[type=number] { background: #121212; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; width: 70px; text-align: center; }
        input[type=number]:focus { border-color: #00ffcc; outline: none; }
        textarea { width: 100%; height: 220px; background: #0a0a0a; color: #4af626; font-family: 'Courier New', Courier, monospace; border: 1px solid #333; padding: 12px; resize: none; box-sizing: border-box; border-radius: 4px; font-size: 0.9rem;}
        .save-btn { margin-top: 15px; background: #00ffcc; color: #121212; }
        .save-btn:hover { background: #00ccaa; color: #fff;}
    </style>
</head>
<body>
    <h1>Flowphant Controller</h1>
    <div class="card">
        <h2>Manual Triggers (Wi-Fi)</h2>
        <div class="grid">
            <button class="btn" onclick="triggerCmd(0)">INIT</button>
            <button class="btn" onclick="triggerCmd(1)">POLLING</button>
            <button class="btn" onclick="triggerCmd(2)">LEARN MIN</button>
            <button class="btn" onclick="triggerCmd(3)">LEARN MAX</button>
            <button class="btn" onclick="triggerCmd(4)">CALIB EXIT</button>
        </div>
    </div>
    <div class="card">
        <h2>Hardware Pin Mapping (GPIOs)</h2>
        <div id="gpio-list">Loading...</div>
        <button class="btn save-btn" onclick="saveGpio()">Save GPIO Mappings to Flash</button>
    </div>
    <div class="card">
        <h2>Live Serial Console (Sensor UART)</h2>
        <textarea id="console" readonly></textarea>
    </div>
    <script>
        const cmds = ["INIT", "POLLING", "LEARN_MIN", "LEARN_MAX", "CALIB_EXIT"];
        
        function triggerCmd(id) { 
            fetch('/trigger?id=' + id); 
        }
        
        function loadGpio() {
            fetch('/get_gpio').then(r=>r.json()).then(data => {
                let html = '';
                cmds.forEach((cmd, i) => {
                    let pin = data[i] !== -1 ? data[i] : '';
                    html += \`<div class="config-row"><span>Trigger <b>\${cmd}</b> on GPIO:</span><input type="number" id="pin\${i}" value="\${pin}" placeholder="None"></div>\`;
                });
                document.getElementById('gpio-list').innerHTML = html;
            });
        }

        function saveGpio() {
            for(let i=0; i<5; i++) {
                let val = document.getElementById('pin'+i).value;
                if(val === "") val = -1;
                fetch(\`/set_gpio?id=\${i}&pin=\${val}\`);
            }
            alert('Settings saved to Non-Volatile Memory. Hardware Interrupts updated.');
        }

        function pollConsole() {
            fetch('/console').then(r=>r.text()).then(txt => {
                let c = document.getElementById('console');
                if(c.value !== txt) {
                    c.value = txt;
                    c.scrollTop = c.scrollHeight;
                }
            });
        }

        window.onload = () => { 
            loadGpio(); 
            setInterval(pollConsole, 500); // Poll console twice a second 
        };
    </script>
</body>
</html>`;
}

export function generateMainCpp(config: ESP32Config): string {
  return `#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>

// ---------------------------------------------------------
// 1. CONSTANTS & COMMAND ARRAYS (ENDRESS+HAUSER FLOWPHANT)
// ---------------------------------------------------------
const uint8_t CMD_INIT[]       = {0x01, 0x30, 0x31, 0x02, 0x56, 0x03, 0x55};
const uint8_t CMD_POLLING[]    = {0x01, 0x30, 0x31, 0x02, 0x52, 0x31, 0x30, 0x30, 0x30, 0x03, 0x50};
const uint8_t CMD_LEARN_MIN[]  = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x4C, 0x32, 0x30, 0x03, 0x5F};
const uint8_t CMD_LEARN_MAX[]  = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x48, 0x38, 0x30, 0x03, 0x51};
const uint8_t CMD_CALIB_EXIT[] = {0x01, 0x30, 0x31, 0x02, 0x54, 0x46, 0x58, 0x03, 0x49};

const char* CMD_NAMES[] = {"INIT", "POLLING", "LEARN_MIN", "LEARN_MAX", "CALIB_EXIT"};
const int NUM_CMDS = 5;

// ---------------------------------------------------------
// 2. GLOBALS & STATE MANAGEMENT
// ---------------------------------------------------------
AsyncWebServer server(${config.webServerPort});
Preferences preferences;

// GPIO Mapping Array (Indices 0 to 4 correspond to the 5 commands)
int gpioMap[NUM_CMDS] = {-1, -1, -1, -1, -1};
const char* prefKeys[NUM_CMDS] = {"gpio_0", "gpio_1", "gpio_2", "gpio_3", "gpio_4"};

// Debounce state tracking for physical buttons
int buttonState[NUM_CMDS] = {HIGH, HIGH, HIGH, HIGH, HIGH};
int lastButtonRead[NUM_CMDS] = {HIGH, HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[NUM_CMDS] = {0, 0, 0, 0, 0};
const unsigned long debounceDelay = 50; // 50ms non-blocking debounce

// Web Console Buffer
String consoleLog = "System Initialized.\\n";
const int MAX_CONSOLE_LENGTH = 2000;

// UART Config
#define RX2_PIN ${config.rxPin}
#define TX2_PIN ${config.txPin}
#define BAUD_RATE ${config.baudRate}

// ---------------------------------------------------------
// 3. EMBEDDED WEB APP (HTML/CSS/JS in PROGMEM)
// ---------------------------------------------------------
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flowphant IoT Gateway</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 20px; }
        h1 { color: #00ffcc; text-align: center; border-bottom: 1px solid #333; padding-bottom: 15px; font-weight: 300; }
        .card { background: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
        h2 { margin-top: 0; color: #fff; font-size: 1.2rem; margin-bottom: 15px; }
        .btn { background: #2a2a2a; color: #00ffcc; border: 1px solid #00ffcc; padding: 12px 15px; cursor: pointer; border-radius: 6px; font-weight: bold; transition: all 0.2s ease; width: 100%; }
        .btn:hover { background: #00ffcc; color: #121212; box-shadow: 0 0 10px rgba(0, 255, 204, 0.4); }
        .btn:active { transform: scale(0.98); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .config-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed #333; padding-bottom: 8px; }
        input[type=number] { background: #121212; border: 1px solid #555; color: #fff; padding: 8px; border-radius: 4px; width: 70px; text-align: center; }
        input[type=number]:focus { border-color: #00ffcc; outline: none; }
        textarea { width: 100%; height: 220px; background: #0a0a0a; color: #4af626; font-family: 'Courier New', Courier, monospace; border: 1px solid #333; padding: 12px; resize: none; box-sizing: border-box; border-radius: 4px; font-size: 0.9rem;}
        .save-btn { margin-top: 15px; background: #00ffcc; color: #121212; }
        .save-btn:hover { background: #00ccaa; color: #fff;}
    </style>
</head>
<body>
    <h1>Flowphant Controller</h1>
    <div class="card">
        <h2>Manual Triggers (Wi-Fi)</h2>
        <div class="grid">
            <button class="btn" onclick="triggerCmd(0)">INIT</button>
            <button class="btn" onclick="triggerCmd(1)">POLLING</button>
            <button class="btn" onclick="triggerCmd(2)">LEARN MIN</button>
            <button class="btn" onclick="triggerCmd(3)">LEARN MAX</button>
            <button class="btn" onclick="triggerCmd(4)">CALIB EXIT</button>
        </div>
    </div>
    <div class="card">
        <h2>Hardware Pin Mapping (GPIOs)</h2>
        <div id="gpio-list">Loading...</div>
        <button class="btn save-btn" onclick="saveGpio()">Save GPIO Mappings to Flash</button>
    </div>
    <div class="card">
        <h2>Live Serial Console (Sensor UART)</h2>
        <textarea id="console" readonly></textarea>
    </div>
    <script>
        const cmds = ["INIT", "POLLING", "LEARN_MIN", "LEARN_MAX", "CALIB_EXIT"];
        
        function triggerCmd(id) { 
            fetch('/trigger?id=' + id); 
        }
        
        function loadGpio() {
            fetch('/get_gpio').then(r=>r.json()).then(data => {
                let html = '';
                cmds.forEach((cmd, i) => {
                    let pin = data[i] !== -1 ? data[i] : '';
                    html += \`<div class="config-row"><span>Trigger <b>\${cmd}</b> on GPIO:</span><input type="number" id="pin\${i}" value="\${pin}" placeholder="None"></div>\`;
                });
                document.getElementById('gpio-list').innerHTML = html;
            });
        }

        function saveGpio() {
            for(let i=0; i<5; i++) {
                let val = document.getElementById('pin'+i).value;
                if(val === "") val = -1;
                fetch(\`/set_gpio?id=\${i}&pin=\${val}\`);
            }
            alert('Settings saved to Non-Volatile Memory. Hardware Interrupts updated.');
        }

        function pollConsole() {
            fetch('/console').then(r=>r.text()).then(txt => {
                let c = document.getElementById('console');
                if(c.value !== txt) {
                    c.value = txt;
                    c.scrollTop = c.scrollHeight;
                }
            });
        }

        window.onload = () => { 
            loadGpio(); 
            setInterval(pollConsole, 500); // Poll console twice a second 
        };
    </script>
</body>
</html>
)rawliteral";

// ---------------------------------------------------------
// 4. HELPER FUNCTIONS
// ---------------------------------------------------------

void logToConsole(String txt) {
    consoleLog += txt + "\\n";
    if (consoleLog.length() > MAX_CONSOLE_LENGTH) {
        // Keep the newest chunk of the log if it overflows
        consoleLog = consoleLog.substring(consoleLog.length() - (MAX_CONSOLE_LENGTH / 2));
    }
}

void sendSensorCommand(int cmdIndex, String source) {
    const uint8_t* cmdData;
    size_t cmdLen = 0;
    
    switch (cmdIndex) {
        case 0: cmdData = CMD_INIT; cmdLen = sizeof(CMD_INIT); break;
        case 1: cmdData = CMD_POLLING; cmdLen = sizeof(CMD_POLLING); break;
        case 2: cmdData = CMD_LEARN_MIN; cmdLen = sizeof(CMD_LEARN_MIN); break;
        case 3: cmdData = CMD_LEARN_MAX; cmdLen = sizeof(CMD_LEARN_MAX); break;
        case 4: cmdData = CMD_CALIB_EXIT; cmdLen = sizeof(CMD_CALIB_EXIT); break;
        default: return;
    }

    // Send via UART
    Serial2.write(cmdData, cmdLen);
    
    // Log to USB Serial and Web Console
    String msg = "[" + source + "] -> Sent " + String(CMD_NAMES[cmdIndex]);
    Serial.println(msg);
    logToConsole(msg);
}

void configureGPIOs() {
    for (int i = 0; i < NUM_CMDS; i++) {
        if (gpioMap[i] >= 0) {
            pinMode(gpioMap[i], INPUT_PULLUP);
            logToConsole("Configured GPIO " + String(gpioMap[i]) + " for " + String(CMD_NAMES[i]));
        }
    }
}

// ---------------------------------------------------------
// 5. SETUP
// ---------------------------------------------------------
void setup() {
    // Init USB Serial (Debugging) & HardwareSerial2 (Sensor)
    Serial.begin(115200);
    Serial2.begin(BAUD_RATE, SERIAL_8N1, RX2_PIN, TX2_PIN);
    delay(1000);

    Serial.println("\\n--- Flowphant Gateway Booting ---");

    // Load Preferences (NVM)
    preferences.begin("flowphant", false);
    for (int i = 0; i < NUM_CMDS; i++) {
        gpioMap[i] = preferences.getInt(prefKeys[i], -1); // Default is -1 (disabled)
    }
    configureGPIOs();

    // Start Wi-Fi AP Mode
    WiFi.softAP("${config.apSsid || "Flowphant_Controller"}", "adminpassword");
    Serial.print("AP Started. IP Address: ");
    Serial.println(WiFi.softAPIP());
    logToConsole("Wi-Fi AP Started. IP: " + WiFi.softAPIP().toString());

    // --- Web Server Routes ---
    
    // 1. Serve the SPA
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send_P(200, "text/html", index_html);
    });

    // 2. Trigger Command API
    server.on("/trigger", HTTP_GET, [](AsyncWebServerRequest *request){
        if (request->hasParam("id")) {
            int id = request->getParam("id")->value().toInt();
            sendSensorCommand(id, "Web-UI");
            request->send(200, "text/plain", "OK");
        } else {
            request->send(400, "text/plain", "Bad Request");
        }
    });

    // 3. Get GPIO Mapping API (Returns JSON array)
    server.on("/get_gpio", HTTP_GET, [](AsyncWebServerRequest *request){
        String json = "[";
        for (int i = 0; i < NUM_CMDS; i++) {
            json += String(gpioMap[i]);
            if (i < NUM_CMDS - 1) json += ",";
        }
        json += "]";
        request->send(200, "application/json", json);
    });

    // 4. Set GPIO Mapping API
    server.on("/set_gpio", HTTP_GET, [](AsyncWebServerRequest *request){
        if (request->hasParam("id") && request->hasParam("pin")) {
            int id = request->getParam("id")->value().toInt();
            int pin = request->getParam("pin")->value().toInt();
            
            if (id >= 0 && id < NUM_CMDS) {
                gpioMap[id] = pin;
                preferences.putInt(prefKeys[id], pin); // Save to Flash
                if (pin >= 0) pinMode(pin, INPUT_PULLUP);
            }
            request->send(200, "text/plain", "OK");
        } else {
            request->send(400, "text/plain", "Bad Request");
        }
    });

    // 5. Console Output API
    server.on("/console", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(200, "text/plain", consoleLog);
    });

    server.begin();
    Serial.println("Async Web Server Started!");
}

// ---------------------------------------------------------
// 6. MAIN LOOP (Non-Blocking)
// ---------------------------------------------------------
void loop() {
    
    // A. Check Physical GPIO Buttons (Non-blocking Debounce)
    for (int i = 0; i < NUM_CMDS; i++) {
        if (gpioMap[i] >= 0) {
            int reading = digitalRead(gpioMap[i]);
            
            if (reading != lastButtonRead[i]) {
                lastDebounceTime[i] = millis();
            }

            if ((millis() - lastDebounceTime[i]) > debounceDelay) {
                if (reading != buttonState[i]) {
                    buttonState[i] = reading;
                    // Trigger strictly on the FALLING EDGE (Button Press)
                    if (buttonState[i] == LOW) { 
                        sendSensorCommand(i, "Hardware GPIO " + String(gpioMap[i]));
                    }
                }
            }
            lastButtonRead[i] = reading;
        }
    }

    // B. Check USB Serial for triggers (Windows/Mac Keyboard entry)
    if (Serial.available()) {
        char c = Serial.read();
        switch (c) {
            case 'I': case 'i': sendSensorCommand(0, "USB-Serial"); break;
            case 'P': case 'p': sendSensorCommand(1, "USB-Serial"); break;
            case 'M': case 'm': sendSensorCommand(2, "USB-Serial"); break;
            case 'X': case 'x': sendSensorCommand(3, "USB-Serial"); break;
            case 'C': case 'c': sendSensorCommand(4, "USB-Serial"); break;
        }
    }

    // C. Listen for incoming responses from the Sensor via UART
    if (Serial2.available()) {
        String hexStream = "";
        while (Serial2.available()) {
            uint8_t incomingByte = Serial2.read();
            if (incomingByte < 0x10) hexStream += "0"; // Pad single digits with 0
            hexStream += String(incomingByte, HEX) + " ";
        }
        
        hexStream.toUpperCase();
        logToConsole("[Sensor] <- " + hexStream);
        Serial.println("Received: " + hexStream);
    }
}
`;
}

export function generateReadmeMd(config: ESP32Config): string {
  return `# ESP32 Flowphant T DTT31 IoT Gateway

A standalone AP-mode IoT gateway providing an embedded, fast SPA WebApp to trigger UART commands and map physical GPIO push-buttons dynamically.

## Features
* **AP Mode Only:** Generates its own Wi-Fi (\`${config.apSsid || "Flowphant_Controller"}\`). No router needed.
* **PROGMEM WebApp:** HTML, CSS, and JS are embedded in the code. No SPIFFS/LittleFS upload required!
* **Dynamic GPIO Mapping:** Assign any physical push-button to any sensor command via the Web UI (saved securely to Non-Volatile Memory via \`Preferences.h\`).
* **Multi-Channel Triggers:** Trigger commands via Web UI, USB Serial Monitor, or Physical GPIO pins.
* **Non-Blocking Debounce:** Hardware interrupts and loops are safely debounced.

## Hardware Setup
* **RX Pin:** GPIO ${config.rxPin}
* **TX Pin:** GPIO ${config.txPin}
* **Baud Rate:** ${config.baudRate}
`;
}

export function generateModularHeader(): string {
  return `// (Modular header not needed for this PROGMEM AP-only project structure)`;
}
