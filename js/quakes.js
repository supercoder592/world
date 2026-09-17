/* 🌏 地震圖層 — USGS 全球即時地震（免金鑰），過濾台灣周邊 */
(function () {
  const cfg = CONAN.config.quakes;
  let layer = null;
  let count = 0;

  function magColor(m) {
    if (m >= 6) return '#f85149';
    if (m >= 5) return '#ff8c42';
    if (m >= 4) return '#ffd166';
    return '#9aa5b1';
  }

  function inRegion(lat, lon) {
    const b = CONAN.config.bounds, p = cfg.pad;
    return lat >= b.south - p && lat <= b.north + p && lon >= b.west - p && lon <= b.east + p;
  }

  function popupHtml(f, depth) {
    const p = f.properties;
    return `<div class="popup">
      <h3>🌏 M${p.mag != null ? p.mag.toFixed(1) : '?'} 地震</h3>
      <div class="kv"><span>位置</span><b>${p.place || '–'}</b></div>
      <div class="kv"><span>深度</span><b>${Number.isFinite(depth) ? depth.toFixed(0) + ' km' : '–'}</b></div>
      <div class="kv"><span>時間</span><b>${new Date(p.time).toLocaleString('zh-TW')}</b></div>
      <a href="${p.url}" target="_blank" rel="noopener">USGS 事件頁 →</a>
    </div>`;
  }

  async function load() {
    const statusEl = document.getElementById('quake-status');
    try {
      const res = await fetch(cfg.url, { signal: CONAN.timeoutSignal(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      layer.clearLayers();
      count = 0;
      for (const f of data.features || []) {
        const [lon, lat, depth] = f.geometry.coordinates;
        if (!inRegion(lat, lon)) continue;
        const mag = f.properties.mag || 0;
        L.circleMarker([lat, lon], {
          radius: Math.max(4, mag * 2.4),
          color: magColor(mag),
          weight: 1.5,
          fillColor: magColor(mag),
          fillOpacity: 0.35,
        }).bindPopup(popupHtml(f, depth), { maxWidth: 300 }).addTo(layer);
        count++;
      }
      statusEl.textContent = `近 7 天 ${count} 起`;
      CONAN.ui.setStatus('quakes', 'ok', count);
    } catch (e) {
      statusEl.textContent = e.message || '載入失敗';
      CONAN.ui.setStatus('quakes', 'err', count);
    }
  }

  CONAN.quakes = {
    init(map) {
      layer = L.layerGroup().addTo(map);
      load();
      setInterval(load, cfg.refreshMs);
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else map.removeLayer(layer);
    },
  };
})();
