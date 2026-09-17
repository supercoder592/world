/* ✈️ 飛機圖層 — 公開 ADS-B 匯流（adsb.lol / adsb.fi / airplanes.live / OpenSky），免金鑰。
   全球版：查詢中心與半徑跟著地圖目前視野走（像 Flightradar24 那樣），而不是
   鎖定台灣——把地球轉到任何地方、放大任何城市，都會查詢那裡的即時飛機。 */
(function () {
  const cfg = CONAN.config.adsb;
  const planes = new Map(); // hex -> { marker, el, trail, lastSeen, data }
  let map = null;
  let sourceIdx = 0;
  let visible = true;
  let showTrails = true;
  let queryCenter = CONAN.config.center; // [lat, lon]，隨地圖視野更新
  let queryRadiusNm = cfg.maxRadiusNm;
  let moveTimer = null;

  function altColor(alt) {
    if (alt == null || alt === 'ground') return '#9aa5b1';
    if (alt < 5000) return '#ff6b6b';
    if (alt < 15000) return '#ffd166';
    if (alt < 30000) return '#4ea1ff';
    return '#b18cff';
  }

  function planeSvg(track, alt) {
    const color = altColor(alt);
    const rot = Number.isFinite(track) ? track : 0;
    return `<svg width="26" height="26" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
      <path fill="${color}" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
    </svg>`;
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

  /** OpenSky states 陣列 → 與 ADS-B v2 相同的欄位（公尺/秒 → 英尺/節） */
  function parseOpenSky(data) {
    return (data.states || []).map((s) => ({
      hex: s[0],
      flight: (s[1] || '').trim(),
      lon: s[5],
      lat: s[6],
      alt_baro: s[8] ? 'ground' : (Number.isFinite(s[7]) ? s[7] * 3.28084 : null),
      gs: Number.isFinite(s[9]) ? s[9] * 1.94384 : null,
      track: Number.isFinite(s[10]) ? s[10] : null,
      squawk: s[14] || '',
    }));
  }

  /** 由地圖目前視野換算查詢中心與半徑（海里），夾在 [minRadiusNm, maxRadiusNm] 之間 */
  function updateQueryFromView() {
    const c = map.getCenter();
    const b = map.getBounds();
    const cornerNm = CONAN.geo.distanceNm(c.lat, c.lng, b.getNorth(), b.getEast());
    queryCenter = [c.lat, c.lng];
    queryRadiusNm = Math.min(cfg.maxRadiusNm, Math.max(cfg.minRadiusNm, cornerNm));
    const rangeEl = document.getElementById('adsb-range');
    if (rangeEl) rangeEl.textContent = `${Math.round(queryRadiusNm)} 海里內（跟隨地圖視野）`;
  }

  async function poll() {
    const [lat, lon] = queryCenter;
    const radius = queryRadiusNm;
    let lastErr = null;
    for (let i = 0; i < cfg.sources.length; i++) {
      const idx = (sourceIdx + i) % cfg.sources.length;
      const src = cfg.sources[idx];
      try {
        const res = await fetch(src.url(lat, lon, Math.round(radius)), { signal: CONAN.timeoutSignal(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sourceIdx = idx; // 記住成功的來源，下次優先
        update(src.format === 'opensky' ? parseOpenSky(data) : (data.ac || data.aircraft || []), lat, lon, radius);
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

  function update(list, queryLat, queryLon, radiusNm) {
    const now = Date.now();
    for (const ac of list) {
      if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
      let p = planes.get(ac.hex);
      if (!p) {
        const el = CONAN.gl.el(`<div class="plane-icon">${planeSvg(ac.track, ac.alt_baro)}</div>`);
        const hex = ac.hex;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = planes.get(hex);
          if (cur) CONAN.gl.openPopup(map, cur.data.lat, cur.data.lon, popupHtml(cur.data));
        });
        p = { el, marker: null, trail: [[ac.lat, ac.lon]], lastSeen: now, data: ac };
        if (visible) p.marker = CONAN.gl.addMarker(map, ac.lat, ac.lon, el);
        planes.set(ac.hex, p);
      } else {
        if (p.marker) p.marker.setLngLat([ac.lon, ac.lat]);
        p.el.innerHTML = planeSvg(ac.track, ac.alt_baro);
        const last = p.trail[p.trail.length - 1];
        if (!last || last[0] !== ac.lat || last[1] !== ac.lon) {
          p.trail.push([ac.lat, ac.lon]);
          if (p.trail.length > cfg.trailLength) p.trail.shift();
        }
        p.lastSeen = now;
        p.data = ac;
      }
    }
    // 移除過期，或（查詢範圍跟著地圖視野縮小/搬移後）已經落在查詢圈外的殘留標記
    const margin = radiusNm * 1.3;
    for (const [hex, p] of planes) {
      const tooOld = now - p.lastSeen > cfg.staleMs;
      const outOfRange = Number.isFinite(queryLat)
        && CONAN.geo.distanceNm(queryLat, queryLon, p.data.lat, p.data.lon) > margin;
      if (tooOld || outOfRange) {
        if (p.marker) p.marker.remove();
        planes.delete(hex);
      }
    }
    updateTrails();
  }

  function updateTrails() {
    const src = map.getSource('plane-trails');
    if (!src) return;
    if (!showTrails || !visible) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const features = [];
    for (const p of planes.values()) {
      if (p.trail.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { color: altColor(p.data.alt_baro) },
        geometry: { type: 'LineString', coordinates: p.trail.map(([la, lo]) => [lo, la]) },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }

  CONAN.aircraft = {
    init(m) {
      map = m;
      map.addSource('plane-trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'plane-trails',
        type: 'line',
        source: 'plane-trails',
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.5 },
      });
      updateQueryFromView();
      poll();
      setInterval(poll, cfg.intervalMs);
      // 使用者拖曳/縮放地圖後，等手停下來 900ms 再重新查詢（避免邊拖邊狂打 API）
      map.on('moveend', () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
          updateQueryFromView();
          poll();
        }, 900);
      });
    },
    setVisible(on) {
      visible = on;
      for (const p of planes.values()) {
        if (on && !p.marker) {
          p.marker = CONAN.gl.addMarker(map, p.data.lat, p.data.lon, p.el);
        } else if (!on && p.marker) {
          p.marker.remove();
          p.marker = null;
        }
      }
      updateTrails();
    },
    setTrails(on) {
      showTrails = on;
      updateTrails();
    },
  };
})();
