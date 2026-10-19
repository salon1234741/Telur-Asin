/* ============================================================
   js/mqtt.js
   AquaMonitor IoT Dashboard – Koneksi & Manajemen MQTT
   Tanggung jawab:
     - Membangun koneksi ke broker via WebSocket (Paho)
     - Subscribe ke topik telemetri sensor
     - Callback koneksi terputus & auto-reconnect
     - Callback pesan masuk → teruskan ke sensor.js
   Dependensi: config.js, ui.js (addLog, showToast, setStatus),
               sensor.js (processData)
   ============================================================ */

'use strict';

/* State koneksi – dibaca oleh lamp.js dan app.js */
var mqttClient = null;
var isConnected = false;

/* ============================================================
   CALLBACK: Koneksi Terputus
============================================================ */
function onConnLost(resp) {
  isConnected = false;
  setStatus('disconnected');
  addLog('🔴 Koneksi terputus: ' + (resp.errorMessage || 'unknown'), 'error');
  showToast('Koneksi MQTT terputus. Mencoba ulang...', 'error');
  // Auto-reconnect setelah 5 detik
  setTimeout(connectMQTT, 5000);
}

/* ============================================================
   CALLBACK: Pesan Masuk
============================================================ */
function onMsgArrived(msg) {
  // Abaikan pesan retained (data lama yang tersimpan di broker)
  if (msg.retained) return;
  var topic = msg.destinationName;
  var payload = msg.payloadString;
  addLog('📨 [' + topic + '] ' + payload, '');
  processData(topic, payload);
}

/* ============================================================
   KONEKSI KE BROKER MQTT
============================================================ */
function connectMQTT() {
  try {
    setStatus('connecting');
    addLog('🔄 Menghubungkan ke ' + MQTT_CONFIG.host + ':' + MQTT_CONFIG.port + '...', 'info');

    mqttClient = new Paho.MQTT.Client(
      MQTT_CONFIG.host,
      Number(MQTT_CONFIG.port),
      MQTT_CONFIG.clientId
    );

    mqttClient.onConnectionLost = onConnLost;
    mqttClient.onMessageArrived = onMsgArrived;

    mqttClient.connect({
      useSSL: MQTT_CONFIG.useTLS,
      userName: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      keepAliveInterval: MQTT_CONFIG.keepalive,
      timeout: 10,

      onSuccess: function () {
        isConnected = true;
        setStatus('connected');
        addLog('✅ Berhasil terhubung ke broker MQTT!', 'success');
        showToast('Terhubung ke broker MQTT', 'success');

        // Subscribe ke topik telemetri sensor
        mqttClient.subscribe(MQTT_CONFIG.topicSub, {
          qos: 1,
          onSuccess: function () {
            addLog('✅ Subscribe → ' + MQTT_CONFIG.topicSub, 'success');
          },
          onFailure: function (e) {
            addLog('❌ Gagal subscribe: ' + e.errorMessage, 'error');
          },
        });
      },

      onFailure: function (e) {
        isConnected = false;
        setStatus('disconnected');
        addLog('❌ Gagal terhubung: ' + e.errorMessage, 'error');
        showToast('Gagal terhubung ke broker', 'error');
        // Coba lagi setelah 8 detik
        setTimeout(connectMQTT, 8000);
      },
    });
  } catch (e) {
    isConnected = false;
    setStatus('disconnected');
    addLog('❌ Error MQTT: ' + e.message, 'error');
  }
}
