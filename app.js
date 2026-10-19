/* ============================================================
   js/app.js
   AquaMonitor IoT Dashboard – Entry Point & Inisialisasi App
   Tanggung jawab:
     - Inisialisasi mini chart saat DOM siap
     - Memulai koneksi MQTT
     - Mengelola Demo Mode (fallback jika MQTT tidak tersedia)
   Dependensi: config.js, ui.js, sensor.js, lamp.js, mqtt.js
   ============================================================ */

'use strict';

/* ============================================================
   INISIALISASI APLIKASI
============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  addLog('🚀 Dashboard diinisialisasi.', 'info');

  // Mulai koneksi MQTT
  connectMQTT();

});
