/* ============================================================
   js/sensor.js – Kartu sensor DINAMIS
   Tidak ada nama parameter yang ditetapkan di sini. Setiap
   pasangan "nama:nilai" / "nama=nilai" / JSON yang diterima dari
   ESP32 menjadi satu kartu, dengan nama & nilai persis seperti
   di Serial Monitor.
   Topik: telur/slave/1, telur/slave/2 (data) dan telur/slave/led
   ============================================================ */
'use strict';

var COLORS = ['card-suhu-air', 'card-suhu-udara', 'card-ketinggian', 'card-garam'];
var cardCount = 0;
var cards = {};   // id kartu -> {el, slave, vals[]}

/* Uraikan teks mentah menjadi [[nama, nilai], ...] */
function parsePairs(raw) {
  var out = [];
  raw = raw.trim();
  if (raw.charAt(0) === '{') {
    try {
      var o = JSON.parse(raw);
      Object.keys(o).forEach(function (k) { out.push([k, String(o[k])]); });
      return out;
    } catch (e) { /* bukan JSON valid, lanjut */ }
  }
  raw.split(/[,;|\n\r]+/).forEach(function (tok) {
    tok = tok.trim();
    if (!tok) return;
    var multi = tok.match(/[A-Za-z_][\w.]*\s*[:=]\s*-?\d/g);
    if (multi && multi.length > 1) {            // "T:28.5 H:70" (dipisah spasi)
      var re = /([A-Za-z_][\w.]*)\s*[:=]\s*(-?\d+(?:[.,]\d+)?[^\s]*)/g, m;
      while ((m = re.exec(tok))) out.push([m[1], m[2]]);
      return;
    }
    var p = tok.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
    if (p) out.push([p[1].trim(), p[2].trim()]);
    else out.push(['Data ' + (out.length + 1), tok]);
  });
  return out;
}

function iconFor(name) {
  var n = name.toLowerCase();
  if (/udara|hum|lembab/.test(n)) return '🌤️';
  if (/garam|salin|salt/.test(n)) return '🧂';
  if (/tinggi|level|air/.test(n) && !/suhu|temp/.test(n)) return '💧';
  if (/suhu|temp/.test(n)) return '🌡️';
  return '📟';
}

function getCard(slave, name) {
  var id = 's' + slave + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (cards[id]) return cards[id];

  var empty = document.getElementById('sensor-empty');
  if (empty) empty.remove();

  var el = document.createElement('article');
  el.className = 'sensor-card ' + COLORS[cardCount++ % COLORS.length];
  el.innerHTML =
    '<div class="card-header">' +
      '<div class="card-icon-wrap" aria-hidden="true"></div>' +
      '<span class="card-status-chip ok"></span>' +
    '</div>' +
    '<p class="card-label"></p>' +
    '<div class="card-value-row">' +
      '<span class="card-value">—</span><span class="card-unit"></span>' +
    '</div>' +
    '<div class="mini-chart" aria-hidden="true"></div>';
  el.querySelector('.card-icon-wrap').textContent = iconFor(name);
  el.querySelector('.card-label').textContent = name;           // nama dari ESP32
  el.querySelector('.card-status-chip').textContent = 'Slave ' + slave;
  document.getElementById('sensor-grid').appendChild(el);

  var chart = el.querySelector('.mini-chart');
  chart.id = 'chart-' + id;
  initChart(chart.id);
  return (cards[id] = { el: el, vals: [] });
}

function setSlaveState(slave, noResp) {
  Object.keys(cards).forEach(function (id) {
    if (id.indexOf('s' + slave + '_') !== 0) return;
    var chip = cards[id].el.querySelector('.card-status-chip');
    chip.classList.remove('ok', 'danger');
    chip.classList.add(noResp ? 'danger' : 'ok');
    chip.textContent = noResp ? 'No Respon' : 'Slave ' + slave;
  });
}

function processData(topic, raw) {
  var tail = topic.split('/').pop();

  /* Respons LED -> sinkron toggle lampu */
  if (tail === 'led') {
    syncLampUI(/NYALA|ON/i.test(raw), false);
    markUpdate();
    return;
  }
  if (tail !== '1' && tail !== '2') return;

  if (/^\s*NO RESPON\s*$/i.test(raw)) {
    setSlaveState(tail, true);
    markUpdate();
    return;
  }

  parsePairs(raw).forEach(function (kv) {
    var card = getCard(tail, kv[0]);
    var mm = kv[1].match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
    var valEl = card.el.querySelector('.card-value');
    valEl.textContent = mm ? mm[1] : kv[1];                      // persis seperti diterima
    card.el.querySelector('.card-unit').textContent = mm ? mm[2] : '';
    if (mm) {
      card.vals.push(parseFloat(mm[1].replace(',', '.')));
      if (card.vals.length > HISTORY_LEN) card.vals.shift();
      updateChart(card.el.querySelector('.mini-chart').id, card.vals);
    }
  });
  setSlaveState(tail, false);
  markUpdate();
}
