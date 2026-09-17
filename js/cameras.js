/* 📷 公開監視器圖層 — 國道（高公局開放資料）＋ 省道/縣市（TDX）＋ 使用者自訂
   以 MapLibre GeoJSON 聚合呈現；開放資料偶有壞座標（0,0 或缺值），一律過濾在台灣範圍外的點 */
(function () {
  const cfg = CONAN.config.cctv;
  const cams = new Map(); // id -> cam { id, name, desc, lat, lon, url, custom }
  let map = null;
  let customList = [];
  let activeSnapshotTimer = null;
  let activeHls = null;

  function inBounds(lat, lon) {
    const b = CONAN.config.taiwan.bounds, p = 1.5;
    return lat >= b.south - p && lat <= b.north + p && lon >= b.west - p && lon <= b.east + p;
  }

  function detectType(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('.m3u8')) return 'hls';
    if (u.startsWith('rtsp')) return 'link';                     // 瀏覽器播不了 RTSP
    if (u.includes('mjpg') || u.includes('mjpeg')) return 'mjpeg'; // 動態串流：設一次 src 即可
    if (u.includes('.jpg') || u.includes('.jpeg') || u.includes('snapshot')) return 'img';
    if (u.startsWith('http')) return 'tryimg';                   // 未知網址：先試著當影像嵌，失敗再退回連結
    return 'link';
  }

  function stopViewers() {
    clearInterval(activeSnapshotTimer);
    activeSnapshotTimer = null;
    if (activeHls) { activeHls.destroy(); activeHls = null; }
  }

  function popupHtml(cam) {
    const type = detectType(cam.url);
    let media = '';
    if (type === 'img' || type === 'mjpeg' || type === 'tryimg') {
      // referrerpolicy 是關鍵：多數政府影像主機會拒絕帶外站 Referer 的請求
      media = `<img class="cam-view" id="cam-live" alt="${cam.name}" referrerpolicy="no-referrer" src="">
        <p class="hint cam-fallback" id="cam-fallback" hidden>⚠️ 此來源阻擋內嵌，請點下方「開啟原始來源」觀看。</p>`;
    } else if (type === 'hls') {
      media = `<video class="cam-view" id="cam-live" muted autoplay playsinline></video>
        <p class="hint cam-fallback" id="cam-fallback" hidden>⚠️ 此來源阻擋內嵌，請點下方「預覽來源」。</p>`;
    } else {
      media = `<p class="hint">此監視器為外部網頁，點下方「預覽來源」在站內開啟。</p>`;
    }
    return `<div class="popup">
      <h3>📷 ${cam.name}</h3>
      ${cam.desc ? `<div class="kv"><span>位置</span><b>${cam.desc}</b></div>` : ''}
      ${media}
      <div class="cam-actions">
        <a href="#" data-preview="${cam.url}" data-title="${cam.name}">🔍 預覽來源</a>
        <a href="${cam.url}" target="_blank" rel="noopener">另開分頁 ↗</a>
        ${cam.custom ? `<a href="#" data-del="${cam.id}">🗑 刪除</a>` : ''}
      </div>
    </div>`;
  }

  function wirePopup(cam, popupEl) {
    stopViewers();
    const type = detectType(cam.url);
    const el = popupEl.querySelector('#cam-live');
    if (el) {
      const fallback = popupEl.querySelector('#cam-fallback');
      const showFallback = () => {
        stopViewers();
        el.hidden = true;
        if (fallback) fallback.hidden = false;
      };
      el.onerror = showFallback;
      // 有些伺服器擋內嵌時不回錯誤，而是回一張極小的佔位圖（例如 1x1 像素）或
      // 需登入的錯誤頁被誤判為圖檔——img 標籤視為「載入成功」但畫面其實是黑的、
      // 什麼都看不到。用實際像素尺寸抓出這種偽成功。
      el.onload = () => {
        if (el.naturalWidth > 0 && el.naturalWidth < 20 && el.naturalHeight < 20) showFallback();
      };
      // 逾時仍沒有任何回應（連 onload/onerror 都沒觸發）：多半是伺服器掛起或被擋在
      // 網路層，同樣退回備援訊息，不留著空白轉圈
      const loadTimeout = setTimeout(() => {
        if (!el.hidden && !el.complete) showFallback();
      }, 12000);
      el.addEventListener('load', () => clearTimeout(loadTimeout), { once: true });
      el.addEventListener('error', () => clearTimeout(loadTimeout), { once: true });

      if (type === 'img') {
        const refresh = () => {
          // 加上時間戳避免快取，取得最新快照
          const sep = cam.url.includes('?') ? '&' : '?';
          el.src = `${cam.url}${sep}t=${Date.now()}`;
        };
        refresh();
        activeSnapshotTimer = setInterval(refresh, cfg.snapshotRefreshMs);
      } else if (type === 'mjpeg' || type === 'tryimg') {
        // MJPEG 是連續串流，設定一次 src 讓它自己播，不需輪詢重載
        el.src = cam.url;
      } else if (type === 'hls') {
        if (window.Hls && Hls.isSupported()) {
          activeHls = new Hls({ maxBufferLength: 10 });
          activeHls.loadSource(cam.url);
          activeHls.attachMedia(el);
          activeHls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) showFallback(); });
        } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = cam.url;
        } else {
          showFallback();
        }
      }
    }
    const preview = popupEl.querySelector('[data-preview]');
    if (preview) {
      preview.addEventListener('click', (e) => {
        e.preventDefault();
        CONAN.ui.openLightbox(preview.dataset.preview, preview.dataset.title);
      });
    }
    const del = popupEl.querySelector('[data-del]');
    if (del) {
      del.addEventListener('click', (e) => {
        e.preventDefault();
        removeCustom(cam.id);
        if (CONAN.gl.activePopup) CONAN.gl.activePopup.remove();
      });
    }
  }

  /* ---------- GeoJSON 資料源 ---------- */
  function featureCollection() {
    return {
      type: 'FeatureCollection',
      features: [...cams.values()].map((c) => ({
        type: 'Feature',
        properties: { id: c.id, custom: c.custom ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      })),
    };
  }

  function refresh() {
    const src = map.getSource('cams');
    if (src) src.setData(featureCollection());
    CONAN.ui.setStatus('cameras', cams.size > 0 ? 'ok' : 'warn', cams.size);
  }

  /** 加入一支監視器（不重整資料源；批次加完請自行呼叫 refresh）。回傳是否成功。 */
  /** opts.global：國際監視器來源用，跳過台灣範圍濾網，只做基本座標合理性檢查 */
  function addCamera(cam, opts = {}) {
    if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lon)) return false;
    if (opts.global) {
      if (Math.abs(cam.lat) > 90 || Math.abs(cam.lon) > 180) return false;
    } else if (!inBounds(cam.lat, cam.lon)) {
      return false; // 過濾開放資料的壞座標（避免飄到非洲）
    }
    if (cams.has(cam.id)) return false;
    cams.set(cam.id, cam);
    return true;
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
      if (!url) continue;
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
    refresh();
    return added;
  }

  function extractTdxItems(data) {
    if (Array.isArray(data)) return data;
    return data.CCTVs || data.cctvs || [];
  }

  async function loadFreewayCctv() {
    const statusEl = document.getElementById('cctv-status');
    for (const url of cfg.sources) {
      try {
        const res = await fetch(url, { signal: CONAN.timeoutSignal(15000) });
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
    // 高公局主機失敗（常見原因：未開 CORS）→ 改走 TDX 國道端點備援
    try {
      const data = await CONAN.tdx.fetchJson(CONAN.config.tdx.freewayCctvUrl);
      const added = addMotcItems(extractTdxItems(data), 'fw', '國道');
      if (added > 0) {
        statusEl.textContent = `已載入 ${added} 支（TDX 備援）`;
        return;
      }
      statusEl.textContent = '無法載入（來源或 CORS 限制）';
    } catch (e) {
      statusEl.textContent = `無法載入：${e.message || 'CORS/網路限制'}`;
    }
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
      return added;
    } catch (e) {
      statusEl.textContent = `${label}：${e.message || '載入失敗'}`;
      return 0;
    }
  }

  /** 依序載入 22 縣市（不平行送出，避免匿名模式一次打爆額度／被限流） */
  async function loadAllCities(options, btn) {
    const statusEl = document.getElementById('city-status');
    if (btn) btn.disabled = true;
    let total = 0, done = 0;
    for (const opt of options) {
      done++;
      statusEl.textContent = `(${done}/${options.length}) ${opt.label} 載入中…`;
      total += await loadCity(opt.value, opt.label);
    }
    statusEl.textContent = `全部 22 縣市已處理，共新增 ${total} 支`;
    if (btn) btn.disabled = false;
  }

  /** 一開站就自動依序載入省道與全部縣市，不需手動點按鈕 */
  async function autoLoadAll() {
    await loadThb();
    const sel = document.getElementById('city-select');
    const options = [...sel.options].map((o) => ({ value: o.value, label: o.textContent }));
    await loadAllCities(options, document.getElementById('city-load-all'));
  }

  /* ---------- 使用者自訂監視器 ---------- */
  function loadCustom() {
    let list = [];
    try { list = JSON.parse(CONAN.store.get(CONAN.config.storageKeys.customCams)) || []; } catch { /* noop */ }
    for (const cam of list) {
      cam.custom = true;
      addCamera(cam);
    }
    return list;
  }

  function saveCustom() {
    CONAN.store.set(
      CONAN.config.storageKeys.customCams,
      JSON.stringify(customList.map(({ id, name, lat, lon, url }) => ({ id, name, lat, lon, url })))
    );
  }

  function removeCustom(id) {
    const idx = customList.findIndex((c) => c.id === id);
    if (idx < 0) return;
    customList.splice(idx, 1);
    cams.delete(id);
    saveCustom();
    refresh();
  }

  function initAddForm() {
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
      if (!addCamera(cam)) {
        alert('座標超出台灣周邊觀測範圍。');
        return;
      }
      customList.push(cam);
      saveCustom();
      refresh();
      map.easeTo({ center: [lon, lat], zoom: 13 });
      for (const id of ['cam-name', 'cam-lat', 'cam-lon', 'cam-url']) document.getElementById(id).value = '';
    });
  }

  CONAN.cameras = {
    init(m) {
      map = m;
      map.addSource('cams', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 46,
      });
      map.addLayer({
        id: 'cam-clusters',
        type: 'circle',
        source: 'cams',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4ea1ff',
          'circle-opacity': 0.8,
          'circle-radius': ['step', ['get', 'point_count'], 13, 50, 17, 300, 22],
          'circle-stroke-color': '#0d1117',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'cam-cluster-count',
        type: 'symbol',
        source: 'cams',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Semibold'],
        },
        paint: { 'text-color': '#08111e' },
      });
      map.addLayer({
        id: 'cam-points',
        type: 'circle',
        source: 'cams',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#172533',
          'circle-radius': 7,
          'circle-stroke-color': ['case', ['==', ['get', 'custom'], 1], '#ffd166', '#4ea1ff'],
          'circle-stroke-width': 1.5,
        },
      });

      map.on('click', 'cam-points', (e) => {
        const id = e.features[0].properties.id;
        const cam = cams.get(id);
        if (!cam) return;
        CONAN.gl.openPopup(map, cam.lat, cam.lon, popupHtml(cam), {
          onOpen: (el) => wirePopup(cam, el),
          onClose: stopViewers,
        });
      });
      map.on('click', 'cam-clusters', (e) => {
        const f = e.features[0];
        Promise.resolve(map.getSource('cams').getClusterExpansionZoom(f.properties.cluster_id))
          .then((z) => map.easeTo({
            center: f.geometry.coordinates,
            zoom: Number.isFinite(z) ? z : map.getZoom() + 2,
          }))
          .catch(() => { /* noop */ });
      });
      for (const layerId of ['cam-points', 'cam-clusters']) {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
      }

      customList = loadCustom();
      refresh();
      loadFreewayCctv();
      autoLoadAll(); // 開站自動載入省道＋全部縣市，不需手動點按鈕
      initAddForm();

      document.getElementById('thb-load').addEventListener('click', loadThb);
      document.getElementById('city-load').addEventListener('click', () => {
        const sel = document.getElementById('city-select');
        loadCity(sel.value, sel.options[sel.selectedIndex].textContent);
      });
      document.getElementById('city-load-all').addEventListener('click', (e) => {
        const sel = document.getElementById('city-select');
        const options = [...sel.options].map((o) => ({ value: o.value, label: o.textContent }));
        loadAllCities(options, e.target);
      });
    },
    setVisible(on) {
      const v = on ? 'visible' : 'none';
      for (const layerId of ['cam-clusters', 'cam-cluster-count', 'cam-points']) {
        map.setLayoutProperty(layerId, 'visibility', v);
      }
      if (!on) stopViewers();
    },
    /** 供 cameras-intl.js（國際監視器來源）加點用：跳過台灣範圍濾網 */
    addExternal(cam) {
      return addCamera(cam, { global: true });
    },
    refresh() {
      refresh();
    },
  };
})();
