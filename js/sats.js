/* 🛰️ 衛星圖層 — CelesTrak TLE（免金鑰）＋ satellite.js 瀏覽器端 SGP4 軌道推算 */
(function () {
  const cfg = CONAN.config.sats;
  const satrecs = []; // { name, satrec }
  const markers = new Map(); // name -> marker
  let layer = null;
  let timer = null;

  function satIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="sat-icon">🛰️</div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function inRegion(lat, lon) {
    const b = CONAN.config.bounds, p = cfg.pad;
    return lat >= b.south - p && lat <= b.north + p && lon >= b.west - p && lon <= b.east + p;
  }

  function setStatus(text, cls) {
    document.getElementById('sat-status').textContent = text;
    CONAN.ui.setStatus('sats', cls, markers.size);
  }

  /** 取 TLE：優先用 localStorage 快取（6 小時），過期才打 CelesTrak */
  async function fetchTle(group) {
    const key = `conan.tle.${group}`;
    try {
      const cached = JSON.parse(CONAN.store.get(key));
      if (cached && Date.now() - cached.at < cfg.tleCacheMs && cached.text) return cached.text;
    } catch { /* noop */ }
    const res = await fetch(cfg.tleUrl(group), { signal: CONAN.timeoutSignal(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    CONAN.store.set(key, JSON.stringify({ at: Date.now(), text }));
    return text;
  }

  function parseTle(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name = (lines[i] || '').trim();
      const l1 = lines[i + 1], l2 = lines[i + 2];
      if (!l1 || !l2 || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
      try {
        const satrec = satellite.twoline2satrec(l1, l2);
        satrecs.push({ name, satrec });
      } catch { /* 壞掉的 TLE 跳過 */ }
    }
  }

  function propagate() {
    const now = new Date();
    const gmst = satellite.gstime(now);
    const seen = new Set();
    for (const { name, satrec } of satrecs) {
      let gd;
      try {
        const pv = satellite.propagate(satrec, now);
        if (!pv || !pv.position) continue;
        gd = satellite.eciToGeodetic(pv.position, gmst);
      } catch { continue; }
      const lat = satellite.degreesLat(gd.latitude);
      const lon = satellite.degreesLong(gd.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inRegion(lat, lon)) continue;
      seen.add(name);
      const altKm = gd.height;
      let m = markers.get(name);
      if (!m) {
        m = L.marker([lat, lon], { icon: satIcon() });
        m.bindPopup('', { maxWidth: 300 });
        m.addTo(layer);
        markers.set(name, m);
      } else {
        m.setLatLng([lat, lon]);
      }
      m.getPopup().setContent(`<div class="popup">
        <h3>🛰️ ${name}</h3>
        <div class="kv"><span>高度</span><b>${Number.isFinite(altKm) ? Math.round(altKm).toLocaleString() + ' km' : '–'}</b></div>
        <div class="kv"><span>星下點</span><b>${lat.toFixed(2)}, ${lon.toFixed(2)}</b></div>
        <div class="kv"><span>推算時間</span><b>${now.toLocaleTimeString('zh-TW')}</b></div>
        <a href="https://www.n2yo.com/?s=${encodeURIComponent(name)}" target="_blank" rel="noopener">在 N2YO 追查 →</a>
      </div>`);
    }
    // 移出範圍的撤下
    for (const [name, m] of markers) {
      if (!seen.has(name)) {
        layer.removeLayer(m);
        markers.delete(name);
      }
    }
    setStatus(`追蹤 ${satrecs.length} 枚，頭頂 ${markers.size} 枚`, 'ok');
  }

  async function load() {
    if (typeof satellite === 'undefined') {
      setStatus('軌道推算套件（satellite.js）載入失敗', 'err');
      return;
    }
    setStatus('下載軌道資料…', 'warn');
    let okAny = false, lastErr = null;
    for (const g of cfg.groups) {
      try {
        parseTle(await fetchTle(g));
        okAny = true;
      } catch (e) { lastErr = e; }
    }
    if (!okAny) {
      setStatus(`TLE 下載失敗：${(lastErr && lastErr.message) || 'CORS/網路限制'}`, 'err');
      return;
    }
    propagate();
    timer = setInterval(propagate, cfg.propagateMs);
  }

  CONAN.sats = {
    init(map) {
      layer = L.layerGroup().addTo(map);
      load();
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else map.removeLayer(layer);
    },
  };
})();
