/* ============================================================
   js/ui.js
   AquaMonitor IoT Dashboard – UI Helper Functions
   Tanggung jawab:
     - Toast notification
     - Activity log
     - Status badge MQTT
     - Render nilai sensor (value, chip, progress bar)
     - Mini sparkline chart
   ============================================================ */

'use strict';

/* ---- Jumlah data riwayat untuk mini sparkline chart ---- */
const HISTORY_LEN = 10;
const history = {
  suhu_air    : [],
  suhu_udara  : [],
  kadar_garam : [],
};

/* ============================================================
   UTILITY: Format waktu saat ini
============================================================ */
function timeNow() {
  return new Date().toLocaleTimeString('id-ID', {
    hour  : '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/* ============================================================
   TOAST NOTIFICATION
============================================================ */
function showToast(msg, type) {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span>' + (icons[type] || 'ℹ️') + '</span><span>' + msg + '</span>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(function () {
    el.classList.add('out');
    el.addEventListener('animationend', function () { el.remove(); });
  }, 3500);
}

/* ============================================================
   ACTIVITY LOG
============================================================ */
function addLog(msg, type) {
  type = type || '';
  var box = document.getElementById('log-container');
  var row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML =
    '<span class="log-time">' + timeNow() + '</span>' +
    '<span class="log-msg ' + type + '">' + msg + '</span>';
  box.insertBefore(row, box.firstChild);
  // Batasi jumlah entri log agar tidak memenuhi memori
  while (box.children.length > 40) {
    box.removeChild(box.lastChild);
  }
}

function clearLog() {
  document.getElementById('log-container').innerHTML = '';
  addLog('Log dibersihkan.', '');
}

/* ============================================================
   MQTT STATUS BADGE
   state: 'connecting' | 'connected' | 'disconnected'
============================================================ */
function setStatus(state) {
  var badge  = document.getElementById('mqtt-status-badge');
  var text   = document.getElementById('mqtt-status-text');
  badge.className = state;
  var labels = {
    connecting  : 'Menghubungkan...',
    connected   : 'Terhubung',
    disconnected: 'Terputus',
  };
  text.textContent = labels[state] || state;
}

/* ============================================================
   LAST UPDATE TIMESTAMP
============================================================ */
function markUpdate() {
  var el = document.getElementById('last-update');
  el.style.display = 'block';
  el.textContent = '🕐 ' + timeNow();
}

/* ============================================================
   STATUS CHIP (Normal / Sedang / Tinggi)
============================================================ */
function setChip(id, value, okMax, warnMax) {
  var chip = document.getElementById(id);
  chip.classList.remove('skeleton', 'ok', 'warn', 'danger');
  if (value <= okMax) {
    chip.textContent = 'Normal';
    chip.classList.add('ok');
  } else if (value <= warnMax) {
    chip.textContent = 'Sedang';
    chip.classList.add('warn');
  } else {
    chip.textContent = 'Tinggi';
    chip.classList.add('danger');
  }
}

/* ============================================================
   RENDER NILAI SENSOR (dengan animasi flash)
============================================================ */
function renderVal(id, value, decimals) {
  decimals = (decimals !== undefined) ? decimals : 1;
  var el = document.getElementById(id);
  el.classList.remove('skeleton');
  el.textContent = parseFloat(value).toFixed(decimals);
  el.classList.add('updating');
  el.addEventListener('animationend', function () {
    el.classList.remove('updating');
  }, { once: true });
}

/* ============================================================
   MINI SPARKLINE CHART
============================================================ */
function initChart(id) {
  var box = document.getElementById(id);
  box.innerHTML = '';
  for (var i = 0; i < HISTORY_LEN; i++) {
    var bar = document.createElement('div');
    bar.className = 'mini-bar';
    bar.style.height = '4px';
    box.appendChild(bar);
  }
}

function updateChart(id, vals) {
  var bars = document.getElementById(id).querySelectorAll('.mini-bar');
  if (!vals.length) return;
  var max   = Math.max.apply(null, vals.concat([1]));
  var min   = Math.min.apply(null, vals);
  var range = max - min || 1;
  bars.forEach(function (bar, i) {
    var v = (vals[i] !== undefined) ? vals[i] : min;
    bar.style.height = Math.max(4, ((v - min) / range * 90) + 4) + 'px';
  });
}

function pushHist(key, val) {
  history[key].push(val);
  if (history[key].length > HISTORY_LEN) history[key].shift();
}
