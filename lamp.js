/* ============================================================
   js/lamp.js
   AquaMonitor IoT Dashboard – Kontrol Lampu
   Tanggung jawab:
     - Sinkronisasi UI toggle lampu (ON/OFF)
     - Publish perintah ON/OFF ke topik MQTT
   Dependensi: ui.js (addLog, showToast), mqtt.js (mqttClient, isConnected)
   ============================================================ */

'use strict';

/* State lampu saat ini */
var lampOn = false;

/* ============================================================
   SINKRONISASI UI LAMPU
   on        : true = ON | false = OFF
   doPublish : true = kirim perintah ke broker MQTT
============================================================ */
function syncLampUI(on, doPublish) {
  lampOn = on;

  // Update toggle checkbox
  document.getElementById('lamp-toggle').checked = on;

  // Update teks status
  document.getElementById('lamp-text').textContent = on ? 'ON – Menyala' : 'OFF – Mati';

  // Tambah/hapus class animasi pada card
  var card = document.getElementById('lamp-card');
  if (on) {
    card.classList.add('lamp-on');
  } else {
    card.classList.remove('lamp-on');
  }

  // Publish ke MQTT jika diminta (dari klik toggle, bukan dari data sensor)
  if (doPublish) {
    publishLamp(on ? 'ON' : 'OFF');
  }
}

/* ============================================================
   HANDLER KLIK TOGGLE (dipanggil dari HTML onchange)
============================================================ */
function handleLampToggle(checked) {
  syncLampUI(checked, true);
}

/* ============================================================
   PUBLISH PERINTAH LAMPU KE MQTT
   Mengirimkan string "ON" atau "OFF" ke topik kontrol
============================================================ */
function publishLamp(cmd) {
  if (!mqttClient || !isConnected) {
    addLog('⚠️ Tidak terkoneksi – perintah tidak dikirim.', 'warn');
    showToast('Tidak terhubung ke broker MQTT', 'warn');
    return;
  }

  var msg = new Paho.MQTT.Message(cmd);
  msg.destinationName = MQTT_CONFIG.topicLamp;
  msg.qos = 1;
  mqttClient.send(msg);

  addLog('📤 Publish → ' + MQTT_CONFIG.topicLamp + ': "' + cmd + '"', 'info');
  showToast('Lampu ' + cmd, cmd === 'ON' ? 'success' : 'warn');
}
