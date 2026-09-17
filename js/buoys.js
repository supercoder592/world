/* 🌊 海象浮標圖層 — 中央氣象署開放資料 O-B0075-001（需免費授權碼，僅存於 localStorage） */
(function () {
  const cfg = CONAN.config.cwa;
  const buoys = new Map(); // id -> { marker, el, st }
  let map = null;
  let visible = true;
  let timer = null;

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
        const key2 = st.id || st.name;
        let b = buoys.get(key2);
        if (!b) {
          const el = CONAN.gl.el('<div class="buoy-icon">🌊</div>');
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const cur = buoys.get(key2);
            if (cur) CONAN.gl.openPopup(map, cur.st.lat, cur.st.lon, popupHtml(cur.st), { maxWidth: '300px' });
          });
          b = { el, marker: null, st };
          if (visible) b.marker = CONAN.gl.addMarker(map, st.lat, st.lon, el);
          buoys.set(key2, b);
        } else {
          b.st = st;
          if (b.marker) b.marker.setLngLat([st.lon, st.lat]);
        }
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
    init(m) {
      map = m;
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
      CONAN.ui.markLoaded('buoys'); // 有沒有金鑰都算「這一步跑過了」
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
    setVisible(on) {
      visible = on;
      for (const b of buoys.values()) {
        if (on && !b.marker) b.marker = CONAN.gl.addMarker(map, b.st.lat, b.st.lon, b.el);
        else if (!on && b.marker) { b.marker.remove(); b.marker = null; }
      }
    },
  };
})();
