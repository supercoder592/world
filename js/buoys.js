/* 🌊 海象浮標圖層 — 中央氣象署開放資料 O-B0075-001（需免費授權碼，僅存於 localStorage） */
(function () {
  const cfg = CONAN.config.cwa;
  const buoys = new Map(); // stationId -> marker
  let layer = null;
  let timer = null;

  function buoyIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="buoy-icon">🌊</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  /** CWA 的值可能是字串、數字或缺測代碼（None / -99 / -999…），統一整理 */
  function val(x, unit = '') {
    if (x == null) return '–';
    if (typeof x === 'object') x = x.Value != null ? x.Value : x.value;
    if (x == null) return '–';
    const s = String(x).trim();
    if (!s || s === 'None' || s === 'null' || s === '-') return '–';
    const n = parseFloat(s);
    if (Number.isFinite(n) && n <= -90) return '–';
    return unit ? `${s} ${unit}` : s;
  }

  function popupHtml(st) {
    const e = st.elements || {};
    return `<div class="popup">
      <h3>🌊 ${st.name}</h3>
      <div class="kv"><span>測站代碼</span><b>${st.id}</b></div>
      <div class="kv"><span>浪高</span><b>${val(e.WaveHeight, 'm')}</b></div>
      <div class="kv"><span>波向</span><b>${val(e.WaveDirection)}</b></div>
      <div class="kv"><span>波週期</span><b>${val(e.WavePeriod, 's')}</b></div>
      <div class="kv"><span>海溫</span><b>${val(e.SeaTemperature, '°C')}</b></div>
      <div class="kv"><span>氣溫</span><b>${val(e.AirTemperature, '°C')}</b></div>
      <div class="kv"><span>風速</span><b>${val(e.WindSpeed, 'm/s')}</b></div>
      <div class="kv"><span>風向</span><b>${val(e.WindDirection)}</b></div>
      <div class="kv"><span>潮位</span><b>${val(e.TideHeight, 'm')}</b></div>
      <div class="kv"><span>觀測時間</span><b>${st.time || '–'}</b></div>
      <a href="https://www.cwa.gov.tw/V8/C/M/OM/index.html" target="_blank" rel="noopener">氣象署海象觀測 →</a>
    </div>`;
  }

  function setCwaStatus(text, cls) {
    document.getElementById('cwa-status').textContent = text;
    CONAN.ui.setStatus('buoys', cls, buoys.size);
  }

  /** 逐站解析：欄位大小寫與巢狀結構做防禦性處理 */
  function parseStations(data) {
    const rec = data.records || data.Records || {};
    const obs = rec.SeaSurfaceObs || rec.seaSurfaceObs || {};
    const locs = obs.Location || obs.location || [];
    const out = [];
    for (const loc of locs) {
      const s = loc.Station || loc.station || {};
      const lat = parseFloat(s.StationLatitude ?? s.latitude);
      const lon = parseFloat(s.StationLongitude ?? s.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const times = (loc.StationObsTimes && (loc.StationObsTimes.StationObsTime || loc.StationObsTimes.stationObsTime)) || [];
      const latest = times.length ? times[times.length - 1] : {};
      out.push({
        id: s.StationID || s.stationID || '',
        name: s.StationName || s.stationName || '未知測站',
        lat, lon,
        time: latest.DateTime || latest.dateTime || '',
        elements: latest.WeatherElements || latest.weatherElements || {},
      });
    }
    return out;
  }

  async function load(key) {
    setCwaStatus('載入中…', 'warn');
    try {
      const res = await fetch(cfg.buoyUrl(key), { signal: CONAN.timeoutSignal(20000) });
      if (res.status === 401 || res.status === 403) throw new Error('授權碼無效');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success === 'false' || data.success === false) throw new Error(data.message || '授權碼無效');
      const stations = parseStations(data);
      if (!stations.length) throw new Error('來源無測站資料');

      for (const st of stations) {
        let m = buoys.get(st.id || st.name);
        if (!m) {
          m = L.marker([st.lat, st.lon], { icon: buoyIcon() });
          m.addTo(layer);
          buoys.set(st.id || st.name, m);
        } else {
          m.setLatLng([st.lat, st.lon]);
        }
        m.unbindPopup();
        m.bindPopup(popupHtml(st), { maxWidth: 300 });
      }
      setCwaStatus(`已載入 ${buoys.size} 站`, 'ok');
      document.getElementById('cwa-updated').textContent = new Date().toLocaleTimeString('zh-TW');
    } catch (e) {
      setCwaStatus(e.message === 'TimeoutError' ? '連線逾時' : (e.message || '載入失敗'), 'err');
    }
  }

  function start(key) {
    clearInterval(timer);
    load(key);
    timer = setInterval(() => load(key), cfg.refreshMs);
  }

  CONAN.buoys = {
    init(map) {
      layer = L.layerGroup().addTo(map);
      const keyInput = document.getElementById('cwa-key');
      const panel = document.getElementById('cwa-panel');
      const saved = CONAN.store.get(CONAN.config.storageKeys.cwaKey);
      CONAN.ui.setSourceVisible('buoys', !!saved);
      if (saved) {
        keyInput.value = saved;
        panel.open = true;
        start(saved);
      } else {
        setCwaStatus('未設定金鑰', 'warn');
      }
      document.getElementById('cwa-connect').addEventListener('click', () => {
        const key = keyInput.value.trim();
        if (!key) {
          CONAN.store.del(CONAN.config.storageKeys.cwaKey);
          clearInterval(timer);
          CONAN.ui.setSourceVisible('buoys', false);
          setCwaStatus('未設定金鑰', 'warn');
          return;
        }
        CONAN.store.set(CONAN.config.storageKeys.cwaKey, key);
        CONAN.ui.setSourceVisible('buoys', true);
        start(key);
      });
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else map.removeLayer(layer);
    },
  };
})();
