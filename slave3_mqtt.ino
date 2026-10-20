/* ============================================================
   SLAVE 3 – SPI Slave + WiFi + NTP + MQTT (EMQX Cloud)

   Data slave 1 & 2 diteruskan APA ADANYA (teks mentah, persis
   sama dengan yang tampil di Serial Monitor). Tidak ada penamaan
   atau parsing di ESP32; dashboard yang membuat kartunya sendiri
   dari data yang masuk.

   Library: PubSubClient (Nick O'Leary)

   Topik publish (non-retained):
     telur/slave/1     <- teks mentah dari slave 1
     telur/slave/2     <- teks mentah dari slave 2
     telur/slave/led   <- teks mentah respons LED (LED_NYALA / LED_MATI)
     telur/slave/time  <- jam ESP32 "HH:MM:SS" (tiap 5 detik, setelah NTP sinkron)
     telur/slave/status <- "online" / "offline" (retained, Last Will)
   Topik subscribe:
     telur/control/heater  ("ON" / "OFF") dari dashboard
   ============================================================ */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <strings.h>
#include <time.h>
#include "driver/spi_slave.h"

#define WIFI_SSID  "KOS KEJAWAN 24"
#define WIFI_PASS  "studenthousing"
#define GMT_OFFSET_SEC (7 * 3600)

#define MQTT_HOST  "v28c2407.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT  8883                    // MQTT TLS (dashboard: 8084 WebSocket)
#define MQTT_USER  "Telur-asin"
#define MQTT_PASS  "TELURASIN12345"
#define TOPIC_LAMP   "telur/control/heater"   // perintah ON/OFF dari dashboard
#define TOPIC_STATUS "telur/slave/status"

#define PIN_MOSI 23
#define PIN_MISO 19
#define PIN_SCLK 18
#define PIN_CS 5

#define FRAME_SIZE 64
#define HEADER     0xAA
#define HDR_READ   0xAB
#define HDR_TIME   0xBB
#define HDR_CMD    0xCC   // jawaban perintah lampu ke master

WORD_ALIGNED_ATTR uint8_t rxbuf[FRAME_SIZE];
WORD_ALIGNED_ATTR uint8_t txbuf[FRAME_SIZE];
uint8_t respbuf[FRAME_SIZE];
volatile bool pendingResp = false;

volatile bool lampCmdPending = false;
volatile bool lampCmdValue = false;

// Antrean task SPI -> loop() (yang mengirim ke MQTT)
struct OutMsg { uint8_t id; char data[64]; };   // id: 1, 2, atau 9 (LED)
QueueHandle_t outQ;

WiFiClientSecure netClient;
PubSubClient mqtt(netClient);
unsigned long lastReconnect = 0, lastTimePub = 0;

static void queueOut(uint8_t id, const String &payload) {
  OutMsg m;
  m.id = id;
  strncpy(m.data, payload.c_str(), sizeof(m.data) - 1);
  m.data[sizeof(m.data) - 1] = 0;
  xQueueSend(outQ, &m, 0);
}

static void buildTimeResp() {
  memset(respbuf, 0, FRAME_SIZE);
  respbuf[0] = HDR_TIME;
  time_t now = time(nullptr);
  if (now > 1700000000) {
    struct tm tm;
    localtime_r(&now, &tm);
    respbuf[1] = 1;
    respbuf[2] = tm.tm_hour;
    respbuf[3] = tm.tm_min;
    respbuf[4] = tm.tm_sec;
    respbuf[5] = tm.tm_mday;
    respbuf[6] = tm.tm_mon + 1;
    respbuf[7] = tm.tm_year - 100;
  } else {
    respbuf[1] = 0;
  }
}

// [0xCC, ada(0/1), nilai(1=ON,0=OFF)] – diambil master lewat "GET_CMD"
static void buildCmdResp() {
  memset(respbuf, 0, FRAME_SIZE);
  respbuf[0] = HDR_CMD;
  respbuf[1] = lampCmdPending ? 1 : 0;
  respbuf[2] = lampCmdValue ? 1 : 0;
  lampCmdPending = false;
}

void spiTask(void *pv) {
  spi_slave_transaction_t t;

  while (true) {
    memset(rxbuf, 0, FRAME_SIZE);
    if (pendingResp) memcpy(txbuf, respbuf, FRAME_SIZE);
    else             memset(txbuf, 0, FRAME_SIZE);

    memset(&t, 0, sizeof(t));
    t.length    = FRAME_SIZE * 8;
    t.rx_buffer = rxbuf;
    t.tx_buffer = txbuf;

    esp_err_t r = spi_slave_transmit(SPI3_HOST, &t, portMAX_DELAY);
    if (r != ESP_OK) continue;

    if (rxbuf[0] == HDR_READ) { pendingResp = false; continue; }
    if (rxbuf[0] != HEADER) continue;

    uint8_t id  = rxbuf[1];
    uint8_t len = rxbuf[2];
    if (len > FRAME_SIZE - 3) len = FRAME_SIZE - 3;

    String payload = "";
    for (int i = 0; i < len; i++) payload += (char)rxbuf[3 + i];
    payload.trim();

    if (id == 3 && payload == "GET_TIME") {
      buildTimeResp();
      pendingResp = true;
      Serial.printf("GET_TIME -> valid=%d %02d:%02d:%02d\n",
                    respbuf[1], respbuf[2], respbuf[3], respbuf[4]);
      continue;
    }

    if (id == 3 && payload == "GET_CMD") {
      buildCmdResp();
      pendingResp = true;
      Serial.printf("GET_CMD -> ada=%d nilai=%d\n", respbuf[1], respbuf[2]);
      continue;
    }

    if (payload.startsWith("LED_NYALA")) {
      Serial.println("======= Nyalakan LED =======");
      Serial.println(payload);
      Serial.println();
      queueOut(9, payload);
      continue;
    }
    if (payload.startsWith("LED_MATI")) {
      Serial.println("======= Matikan LED =======");
      Serial.println(payload);
      Serial.println();
      queueOut(9, payload);
      continue;
    }

    Serial.printf("==== Data Slave %d (Diterima SLAVE 3) ====\n", id);
    if (payload == "NO RESPON") Serial.printf("ID%d NO RESPON\n", id);
    else                        Serial.println(payload);
    Serial.println();

    // Teruskan teks yang sama persis ke MQTT (termasuk "NO RESPON")
    if (id == 1 || id == 2 || id == 4) queueOut(id, payload);
  }
}

static void onMqttMessage(char *topic, byte *payload, unsigned int len) {
  char msg[16] = {0};
  if (len >= sizeof(msg)) len = sizeof(msg) - 1;
  memcpy(msg, payload, len);
  Serial.printf("MQTT <- [%s] %s\n", topic, msg);

  if (strcmp(topic, TOPIC_LAMP) != 0) return;
  if      (strcasecmp(msg, "ON")  == 0) lampCmdValue = true;
  else if (strcasecmp(msg, "OFF") == 0) lampCmdValue = false;
  else return;
  lampCmdPending = true;
}

static void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (lastReconnect != 0 && millis() - lastReconnect < 5000) return;
  lastReconnect = millis();

  String cid = "esp32_slave3_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.printf("MQTT connect %s:%d ... ", MQTT_HOST, MQTT_PORT);

  if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS, TOPIC_STATUS, 0, true, "offline")) {
    Serial.println("OK");
    mqtt.publish(TOPIC_STATUS, "online", true);
    mqtt.subscribe(TOPIC_LAMP);
  } else {
    Serial.printf("gagal, rc=%d\n", mqtt.state());
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Slave 3 Siap");

  outQ = xQueueCreate(16, sizeof(OutMsg));

  spi_bus_config_t buscfg = {};
  buscfg.mosi_io_num     = PIN_MOSI;
  buscfg.miso_io_num     = PIN_MISO;
  buscfg.sclk_io_num     = PIN_SCLK;
  buscfg.quadwp_io_num   = -1;
  buscfg.quadhd_io_num   = -1;
  buscfg.max_transfer_sz = FRAME_SIZE;

  spi_slave_interface_config_t slvcfg = {};
  slvcfg.mode         = 0;
  slvcfg.spics_io_num = PIN_CS;
  slvcfg.queue_size   = 3;
  slvcfg.flags        = 0;

  gpio_set_pull_mode((gpio_num_t)PIN_MOSI, GPIO_PULLUP_ONLY);
  gpio_set_pull_mode((gpio_num_t)PIN_SCLK, GPIO_PULLUP_ONLY);
  gpio_set_pull_mode((gpio_num_t)PIN_CS,   GPIO_PULLUP_ONLY);

  esp_err_t ret = spi_slave_initialize(SPI3_HOST, &buscfg, &slvcfg, SPI_DMA_CH_AUTO);
  if (ret != ESP_OK) {
    Serial.printf("SPI slave init gagal: %d\n", ret);
    while (1) delay(1000);
  }

  xTaskCreate(spiTask, "spiTask", 6144, NULL, 5, NULL);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(GMT_OFFSET_SEC, 0, "pool.ntp.org", "time.google.com");

  netClient.setInsecure();   // TLS tanpa verifikasi sertifikat (lihat setCACert untuk verifikasi)
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(30);
  mqtt.setBufferSize(256);

  Serial.println("ESP32 SPI slave siap");
}

void loop() {
  if (!mqtt.connected()) {
    connectMqtt();
    delay(10);
    return;
  }
  mqtt.loop();

  OutMsg m;
  while (xQueueReceive(outQ, &m, 0) == pdTRUE) {
    const char *topic = (m.id == 1) ? "telur/slave/1"
                      : (m.id == 2) ? "telur/slave/2"
                      : (m.id == 4) ? "telur/slave/siklus"
                                    : "telur/sl   ave/led";
    bool ok = mqtt.publish(topic, m.data);
    Serial.printf("MQTT -> %s [%s] %s\n", ok ? "OK" : "GAGAL", topic, m.data);
  }

  // Kirim jam ESP32 (hasil NTP) agar dashboard menampilkan waktu yang sama
  if (millis() - lastTimePub >= 5000) {
    lastTimePub = millis();
    time_t now = time(nullptr);
    if (now > 1700000000) {
      struct tm tm;
      localtime_r(&now, &tm);
      char tb[12];
      snprintf(tb, sizeof(tb), "%02d:%02d:%02d", tm.tm_hour, tm.tm_min, tm.tm_sec);
      mqtt.publish("telur/slave/time", tb);
    }
  }
  delay(10);
}
