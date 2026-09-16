/* ✈️ 飛機圖層 — 公開 ADS-B 匯流（adsb.lol / adsb.fi / airplanes.live），免金鑰 */
(function () {
  const cfg = CONAN.config.adsb;
  const planes = new Map(); // hex -> { marker, trail, trailLine, lastSeen, data }
  let layer = null;
  let trailLayer = null;
  let timer = null;
  let sourceIdx = 0;
  let showTrails = true;

  function altColor(alt) {
    if (alt == null || alt === 'ground') return '#9aa5b1';
    if (alt < 5000) return '#ff6b6b';
    if (alt < 15000) return '#ffd166';
    if (alt < 30000) return '#4ea1ff';
    return '#b18cff';
  }

  function planeIcon(track, alt) {
    const color = altColor(alt);
    const rot = Number.isFinite(track) ? track : 0;
    return L.divIcon({
      className: 'plane-icon',
      html: `<svg width="26" height="26" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
        <path fill="${color}" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
      </svg>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function fmtAlt(a) {
    if (a === 'ground') return '地面';
    return Number.isFinite(a) ? `${Math.round(a).toLocaleString()} ft` : '–';
  }

  function popupHtml(ac) {
    const callsign = (ac.flight || '').trim() || '(無呼號)';
    return `<div class="popup">
      <h3>✈️ ${callsign}</h3>
      <div class="kv"><span>機型</span><b>${ac.t || '–'}</b></div>
      <div class="kv"><span>註冊號</span><b>${ac.r || '–'}</b></div>
      <div class="kv"><span>ICAO hex</span><b>${ac.hex}</b></div>
      <div class="kv"><span>高度</span><b>${fmtAlt(ac.alt_baro)}</b></div>
      <div class="kv"><span>地速</span><b>${Number.isFinite(ac.gs) ? Math.round(ac.gs) + ' kt' : '–'}</b></div>
      <div class="kv"><span>航向</span><b>${Number.isFinite(ac.track) ? Math.round(ac.track) + '°' : '–'}</b></div>
      <div class="kv"><span>Squawk</span><b>${ac.squawk || '–'}</b></div>
      <a href="https://globe.adsbexchange.com/?icao=${ac.hex}" target="_blank" rel="noopener">在 ADS-B Exchange 追查 →</a>
    </div>`;
  }

  async function poll() {
    const { center } = CONAN.config;
    let lastErr = null;
    for (let i = 0; i < cfg.sources.length; i++) {
      const idx = (sourceIdx + i) % cfg.sources.length;
      const src = cfg.sources[idx];
      try {
        const res = await fetch(src.url(center[0], center[1], cfg.radiusNm), { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sourceIdx = idx; // 記住成功的來源，下次優先
        update(data.ac || data.aircraft || []);
        CONAN.ui.setStatus('aircraft', 'ok', planes.size);
        document.getElementById('adsb-source').textContent = src.name;
        document.getElementById('adsb-updated').textContent = new Date().toLocaleTimeString('zh-TW');
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    CONAN.ui.setStatus('aircraft', 'err', planes.size);
    document.getElementById('adsb-source').textContent = `連線失敗（${lastErr && lastErr.name === 'TimeoutError' ? '逾時' : '網路/CORS'}）`;
  }

  function update(list) {
    const now = Date.now();
    for (const ac of list) {
      if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
      const pos = [ac.lat, ac.lon];
      let p = planes.get(ac.hex);
      if (!p) {
        const marker = L.marker(pos, { icon: planeIcon(ac.track, ac.alt_baro) });
        marker.bindPopup(() => popupHtml(p.data), { className: 'dark-popup' });
        marker.addTo(layer);
        p = { marker, trail: [pos], trailLine: null, lastSeen: now, data: ac };
        planes.set(ac.hex, p);
      } else {
        p.marker.setLatLng(pos);
        p.marker.setIcon(planeIcon(ac.track, ac.alt_baro));
        const last = p.trail[p.trail.length - 1];
        if (!last || last[0] !== pos[0] || last[1] !== pos[1]) {
          p.trail.push(pos);
          if (p.trail.length > cfg.trailLength) p.trail.shift();
        }
        p.lastSeen = now;
        p.data = ac;
      }
      // 航跡
      if (showTrails && p.trail.length > 1) {
        if (p.trailLine) {
          p.trailLine.setLatLngs(p.trail);
        } else {
          p.trailLine = L.polyline(p.trail, {
            color: altColor(ac.alt_baro), weight: 1.5, opacity: 0.5,
          }).addTo(trailLayer);
        }
      }
    }
    // 移除過期
    for (const [hex, p] of planes) {
      if (now - p.lastSeen > cfg.staleMs) {
        layer.removeLayer(p.marker);
        if (p.trailLine) trailLayer.removeLayer(p.trailLine);
        planes.delete(hex);
      }
    }
  }

  CONAN.aircraft = {
    init(map) {
      layer = L.layerGroup().addTo(map);
      trailLayer = L.layerGroup().addTo(map);
      poll();
      timer = setInterval(poll, cfg.intervalMs);
    },
    setVisible(on, map) {
      if (on) { layer.addTo(map); if (showTrails) trailLayer.addTo(map); }
      else { map.removeLayer(layer); map.removeLayer(trailLayer); }
    },
    setTrails(on, map) {
      showTrails = on;
      if (on) {
        if (document.getElementById('layer-aircraft').checked) trailLayer.addTo(map);
      } else {
        map.removeLayer(trailLayer);
        trailLayer.clearLayers();
        for (const p of planes.values()) p.trailLine = null;
      }
    },
  };
})();
