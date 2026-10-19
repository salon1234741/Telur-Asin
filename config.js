/* ============================================================
   js/config.js
   AquaMonitor IoT Dashboard – Konfigurasi MQTT
   ============================================================

   ⚙️  UBAH NILAI DI BAWAH INI SESUAI KEBUTUHAN ANDA
   Tidak perlu menyentuh file lain untuk mengganti konfigurasi.
   ============================================================ */

const MQTT_CONFIG = {
  host: 'v28c2407.ala.asia-southeast1.emqxsl.com',   // Alamat host broker MQTT
  port: 8084,                // Port WebSocket (non-TLS: 8083 | TLS: 8084)
  useTLS: true,               // Ganti ke true untuk koneksi aman (wss://)
  clientId: "web_dashboard_" + Math.random().toString(16).substr(2, 8),
  username: "Telur-asin", // Username dari Access Control EMQX
  password: "TELURASIN12345",
  keepalive: 30,                  // Interval keepalive dalam detik

  // Topik Subscribe – teks mentah dari ESP32 (telur/slave/1, telur/slave/2, telur/slave/led)
  // Nama & jumlah parameter dibaca otomatis dari data yang masuk.
  topicSub: 'telur/slave/+',

  // Topik Publish – mengirimkan perintah kontrol lampu (string "ON" atau "OFF")
  topicLamp: 'akuarium/control/lampu',
};
