/* 🚆 鐵路圖層 — 台鐵（TRA）／高鐵（THSR）車站，交通部 TDX 開放資料。
   TDX 目前沒有列車即時 GPS 位置（不像公車有即時定位），能做到的是「車站」
   層級的即時資訊：點站看台鐵的即時到離站看板（幾點到、誤點幾分）。高鐵
   TDX 沒有這麼即時的看板 API，這裡先誠實只放站點位置＋連去官網查詢。 */
(function () {
  const stations = new Map(); // "tra-1000" -> { id, name, lat, lon, kind, el, marker }
  let map = null;
  let visible = true;
  let cullUpdate = null;

  function cfg() { return CONAN.config.rail; }

  function stationEl(kind) {
    const emoji = kind === 'thsr' ? '🚄' : '🚆';
    const cls = kind === 'thsr' ? 'rail-icon thsr' : 'rail-icon';
    return CONAN.gl.el(`<div class="${cls}">${emoji}</div>`);
  }

  function stationName(item) {
    const n = item?.StationName;
    if (n && typeof n === 'object') return n.Zh_tw || n.En || '';
    return String(n || item?.StationID || '').trim();
  }

  function fmtHM(t) {
    return t ? String(t).slice(0, 5) : '–';
  }

  /** 台鐵即時到離站看板的一列 */
  function traRowHtml(r) {
    const delay = Number(r.DelayTime) || 0;
    const time = fmtHM(r.ScheduleArrivalTime || r.ScheduleDepartureTime);
    const dest = r.EndingStationName?.Zh_tw || r.EndingStationName || '';
    const delayHtml = delay > 0
      ? `<b style="color:var(--err)">誤點 ${delay} 分</b>`
      : '<b style="color:var(--ok)">準點</b>';
    return `<div class="kv"><span>${r.TrainNo || ''} → ${dest}</span><b>${time}　${delayHtml}</b></div>`;
  }

  async function loadTraBoard(boardEl, stationId) {
    try {
      const data = await CONAN.tdx.fetchJson(cfg().traLiveBoardUrl(stationId));
      const rows = Array.isArray(data) ? data : (data?.TrainLiveBoards || data?.LiveBoards || []);
      boardEl.innerHTML = rows.length
        ? rows.slice(0, 8).map(traRowHtml).join('')
        : '<p class="hint">目前沒有即時到離站資料。</p>';
    } catch (e) {
      boardEl.innerHTML = `<p class="hint">看板載入失敗：${e.message || '未知錯誤'}<br>
        <a href="https://www.railway.gov.tw/tra-tip-web/tip" target="_blank" rel="noopener">到台鐵官網查詢 →</a></p>`;
    }
  }

  function popupHtml(st) {
    return `<div class="popup">
      <h3>${st.kind === 'thsr' ? '🚄' : '🚆'} ${st.name}</h3>
      <div id="rail-board-${st.key}">
        ${st.kind === 'tra'
          ? '<p class="hint">載入即時看板中…</p>'
          : `<p class="hint">高鐵目前 TDX 尚無即時看板 API，僅提供車站位置。
              <a href="https://www.thsrc.com.tw/" target="_blank" rel="noopener">到高鐵官網查詢時刻 →</a></p>`}
      </div>
    </div>`;
  }

  function openStationPopup(st) {
    CONAN.gl.openPopup(map, st.lat, st.lon, popupHtml(st), {
      onOpen: (el) => {
        if (st.kind !== 'tra') return;
        const boardEl = el.querySelector(`#rail-board-${st.key}`);
        if (boardEl) loadTraBoard(boardEl, st.id);
      },
    });
  }

  function addStation(item, kind) {
    const id = String(item?.StationID || '').trim();
    const pos = item?.StationPosition || {};
    const lat = parseFloat(pos.PositionLat), lon = parseFloat(pos.PositionLon);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const key = `${kind}-${id}`;
    if (stations.has(key)) return false;
    const el = stationEl(kind);
    const st = { id, key, name: stationName(item), lat, lon, kind, el, marker: null };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openStationPopup(st);
    });
    if (visible) st.marker = CONAN.gl.addMarker(map, lat, lon, el);
    stations.set(key, st);
    return true;
  }

  function refreshStatus() {
    CONAN.ui.setStatus('rail', stations.size > 0 ? 'ok' : 'warn', stations.size);
  }

  async function loadTra() {
    const statusEl = document.getElementById('rail-tra-status');
    statusEl.textContent = '載入中…';
    try {
      const data = await CONAN.tdx.fetchJson(cfg().traStationUrl);
      const rows = Array.isArray(data) ? data : (data?.Stations || []);
      let added = 0;
      for (const item of rows) if (addStation(item, 'tra')) added++;
      statusEl.textContent = added > 0 ? `已載入 ${added} 站` : '無可用資料';
      refreshStatus();
      if (cullUpdate) cullUpdate();
    } catch (e) {
      statusEl.textContent = e.message || '載入失敗';
    }
  }

  async function loadThsr() {
    const statusEl = document.getElementById('rail-thsr-status');
    statusEl.textContent = '載入中…';
    try {
      const data = await CONAN.tdx.fetchJson(cfg().thsrStationUrl);
      const rows = Array.isArray(data) ? data : (data?.Stations || []);
      let added = 0;
      for (const item of rows) if (addStation(item, 'thsr')) added++;
      statusEl.textContent = added > 0 ? `已載入 ${added} 站` : '無可用資料';
      refreshStatus();
      if (cullUpdate) cullUpdate();
    } catch (e) {
      statusEl.textContent = e.message || '載入失敗';
    }
  }

  CONAN.rail = {
    init(m) {
      map = m;
      cullUpdate = CONAN.gl.wireHemisphereCulling(map, () => stations.values());
      return Promise.all([loadTra(), loadThsr()]);
    },
    setVisible(on) {
      visible = on;
      for (const st of stations.values()) {
        if (on && !st.marker) st.marker = CONAN.gl.addMarker(map, st.lat, st.lon, st.el);
        else if (!on && st.marker) { st.marker.remove(); st.marker = null; }
      }
      if (cullUpdate) cullUpdate();
    },
    /** 供搜尋功能用：依名稱找車站 */
    search(query, limit = 6) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const out = [];
      for (const st of stations.values()) {
        if (st.name.toLowerCase().includes(q)) {
          out.push({ id: st.key, name: `${st.kind === 'thsr' ? '🚄' : '🚆'} ${st.name}`, desc: st.kind === 'thsr' ? '高鐵' : '台鐵', lat: st.lat, lon: st.lon });
          if (out.length >= limit) break;
        }
      }
      return out;
    },
  };
})();
