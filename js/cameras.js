/* 📷 公開監視器圖層 — 國道（高公局開放資料）＋ 省道/縣市（TDX）＋ 使用者自訂 */
(function () {
  const cfg = CONAN.config.cctv;
  let layer = null;
  let camCount = 0;
  const seenIds = new Set(); // 跨來源去重
  let activeSnapshotTimer = null;
  let activeHls = null;

  function detectType(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('.m3u8')) return 'hls';
    if (u.includes('mjpg') || u.includes('mjpeg') || u.includes('.jpg') || u.includes('.jpeg') || u.includes('snapshot')) return 'img';
    return 'link';
  }

  function camIcon(custom) {
    return L.divIcon({
      className: '',
      html: `<div class="cam-icon${custom ? ' custom' : ''}">📷</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function stopViewers() {
    clearInterval(activeSnapshotTimer);
    activeSnapshotTimer = null;
    if (activeHls) { activeHls.destroy(); activeHls = null; }
  }

  function popupHtml(cam) {
    const type = detectType(cam.url);
    let media = '';
    if (type === 'img') {
      media = `<img class="cam-view" id="cam-live" alt="${cam.name}" src="">`;
    } else if (type === 'hls') {
      media = `<video class="cam-view" id="cam-live" muted autoplay playsinline></video>`;
    } else {
      media = `<p class="hint">此監視器為外部網頁，點下方連結開啟。</p>`;
    }
    return `<div class="popup">
      <h3>📷 ${cam.name}</h3>
      ${cam.desc ? `<div class="kv"><span>位置</span><b>${cam.desc}</b></div>` : ''}
      ${media}
      <div class="cam-actions">
        <a href="${cam.url}" target="_blank" rel="noopener">開啟原始來源 ↗</a>
        ${cam.custom ? `<a href="#" data-del="${cam.id}">🗑 刪除</a>` : ''}
      </div>
    </div>`;
  }

  function onPopupOpen(cam, popupEl) {
    stopViewers();
    const type = detectType(cam.url);
    const el = popupEl.querySelector('#cam-live');
    if (!el) return;
    if (type === 'img') {
      const refresh = () => {
        // 加上時間戳避免快取，取得最新快照
        const sep = cam.url.includes('?') ? '&' : '?';
        el.src = `${cam.url}${sep}t=${Date.now()}`;
      };
      refresh();
      activeSnapshotTimer = setInterval(refresh, cfg.snapshotRefreshMs);
    } else if (type === 'hls') {
      if (window.Hls && Hls.isSupported()) {
        activeHls = new Hls({ maxBufferLength: 10 });
        activeHls.loadSource(cam.url);
        activeHls.attachMedia(el);
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = cam.url;
      }
    }
    const del = popupEl.querySelector('[data-del]');
    if (del) {
      del.addEventListener('click', (e) => {
        e.preventDefault();
        removeCustom(cam.id);
      });
    }
  }

  function addCamera(cam) {
    if (cam.id) {
      if (seenIds.has(cam.id)) return null;
      seenIds.add(cam.id);
    }
    const marker = L.marker([cam.lat, cam.lon], { icon: camIcon(!!cam.custom) });
    marker.bindPopup(() => popupHtml(cam), { maxWidth: 340 });
    marker.on('popupopen', (e) => onPopupOpen(cam, e.popup.getElement()));
    marker.on('popupclose', stopViewers);
    marker.addTo(layer);
    cam.marker = marker;
    camCount++;
    CONAN.ui.setStatus('cameras', 'ok', camCount);
    return marker;
  }

  /* ---------- 高速公路局開放資料 ---------- */
  function tagText(node, name) {
    for (const el of node.children) {
      if (el.localName === name) return el.textContent.trim();
    }
    return '';
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const out = [];
    for (const node of doc.getElementsByTagName('CCTV')) {
      out.push({
        CCTVID: tagText(node, 'CCTVID'),
        VideoStreamURL: tagText(node, 'VideoStreamURL'),
        PositionLat: parseFloat(tagText(node, 'PositionLat')),
        PositionLon: parseFloat(tagText(node, 'PositionLon')),
        RoadName: tagText(node, 'RoadName'),
        RoadDirection: tagText(node, 'RoadDirection'),
        LocationMile: tagText(node, 'LocationMile'),
      });
    }
    return out;
  }

  /** 匯入 MOTC 標準格式（國道開放資料與 TDX 皆同）的 CCTV 清單，回傳成功加入的數量 */
  function addMotcItems(items, prefix, fallbackRoad) {
    let added = 0;
    for (const it of items) {
      const lat = parseFloat(it.PositionLat), lon = parseFloat(it.PositionLon);
      const url = it.VideoStreamURL || it.VideoImageURL || it.VideoURL || it.ImageURL;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !url) continue;
      const dir = { N: '北向', S: '南向', E: '東向', W: '西向' }[it.RoadDirection] || it.RoadDirection || '';
      const name = `${it.RoadName || it.SurveillanceDescription || fallbackRoad} ${it.LocationMile || ''} ${dir}`.trim();
      if (addCamera({
        id: `${prefix}-${it.CCTVID || `${lat},${lon}`}`,
        name,
        desc: it.CCTVID || '',
        lat, lon,
        url,
      })) added++;
    }
    return added;
  }

  async function loadFreewayCctv() {
    const statusEl = document.getElementById('cctv-status');
    for (const url of cfg.sources) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let items;
        if (url.endsWith('.json')) {
          const data = await res.json();
          items = data.CCTVs || data.cctvs || [];
        } else {
          items = parseXml(await res.text());
        }
        const added = addMotcItems(items, 'fw', '國道');
        if (added > 0) {
          statusEl.textContent = `已載入 ${added} 支`;
          return;
        }
        throw new Error('empty');
      } catch (e) {
        // 換下一個來源
      }
    }
    statusEl.textContent = '無法載入（來源或 CORS 限制）';
    CONAN.ui.setStatus('cameras', camCount > 0 ? 'ok' : 'warn', camCount);
  }

  /* ---------- TDX：省道 / 縣市 CCTV ---------- */
  function extractTdxItems(data) {
    if (Array.isArray(data)) return data;
    return data.CCTVs || data.cctvs || [];
  }

  async function loadThb() {
    const statusEl = document.getElementById('thb-status');
    statusEl.textContent = '載入中…';
    try {
      const data = await CONAN.tdx.fetchJson(CONAN.config.tdx.highwayCctvUrl);
      const added = addMotcItems(extractTdxItems(data), 'thb', '省道');
      statusEl.textContent = added > 0 ? `已載入 ${added} 支` : '來源無資料';
    } catch (e) {
      statusEl.textContent = e.message || '載入失敗';
    }
  }

  async function loadCity(city, label) {
    const statusEl = document.getElementById('city-status');
    statusEl.textContent = `${label} 載入中…`;
    try {
      const data = await CONAN.tdx.fetchJson(CONAN.config.tdx.cityCctvUrl(city));
      const added = addMotcItems(extractTdxItems(data), `city-${city}`, label);
      statusEl.textContent = added > 0 ? `${label}：已載入 ${added} 支` : `${label}：無資料（該縣市未提供）`;
    } catch (e) {
      statusEl.textContent = `${label}：${e.message || '載入失敗'}`;
    }
  }

  /* ---------- 使用者自訂監視器 ---------- */
  function loadCustom() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CONAN.config.storageKeys.customCams)) || []; } catch { /* noop */ }
    for (const cam of list) {
      cam.custom = true;
      addCamera(cam);
    }
    return list;
  }

  let customList = [];

  function saveCustom() {
    localStorage.setItem(
      CONAN.config.storageKeys.customCams,
      JSON.stringify(customList.map(({ id, name, lat, lon, url }) => ({ id, name, lat, lon, url })))
    );
  }

  function removeCustom(id) {
    const idx = customList.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [cam] = customList.splice(idx, 1);
    if (cam.marker) layer.removeLayer(cam.marker);
    camCount--;
    saveCustom();
    CONAN.ui.setStatus('cameras', 'ok', camCount);
  }

  function initAddForm(map) {
    document.getElementById('cam-add').addEventListener('click', () => {
      const name = document.getElementById('cam-name').value.trim();
      const lat = parseFloat(document.getElementById('cam-lat').value);
      const lon = parseFloat(document.getElementById('cam-lon').value);
      const url = document.getElementById('cam-url').value.trim();
      if (!name || !url || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        alert('請完整填寫名稱、經緯度與網址。');
        return;
      }
      const cam = { id: `custom-${Date.now()}`, name, lat, lon, url, custom: true };
      customList.push(cam);
      addCamera(cam);
      saveCustom();
      map.setView([lat, lon], 13);
      for (const id of ['cam-name', 'cam-lat', 'cam-lon', 'cam-url']) document.getElementById(id).value = '';
    });
  }

  CONAN.cameras = {
    init(map) {
      // 監視器可達數千支，優先使用聚合圖層
      layer = (L.markerClusterGroup
        ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 46, disableClusteringAtZoom: 14 })
        : L.layerGroup()
      ).addTo(map);
      customList = loadCustom();
      CONAN.ui.setStatus('cameras', camCount > 0 ? 'ok' : 'warn', camCount);
      loadFreewayCctv();
      initAddForm(map);

      document.getElementById('thb-load').addEventListener('click', loadThb);
      document.getElementById('city-load').addEventListener('click', () => {
        const sel = document.getElementById('city-select');
        loadCity(sel.value, sel.options[sel.selectedIndex].textContent);
      });
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else { map.removeLayer(layer); stopViewers(); }
    },
  };
})();
