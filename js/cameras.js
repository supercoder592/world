/* 📷 公開監視器圖層 — 高速公路局開放資料 CCTV（免金鑰）＋ 使用者自訂監視器 */
(function () {
  const cfg = CONAN.config.cctv;
  let layer = null;
  let camCount = 0;
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
        let added = 0;
        for (const it of items) {
          const lat = parseFloat(it.PositionLat), lon = parseFloat(it.PositionLon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !it.VideoStreamURL) continue;
          const dir = { N: '北向', S: '南向', E: '東向', W: '西向' }[it.RoadDirection] || it.RoadDirection || '';
          addCamera({
            id: `fw-${it.CCTVID}`,
            name: `${it.RoadName || '國道'} ${it.LocationMile || ''} ${dir}`.trim(),
            desc: it.CCTVID,
            lat, lon,
            url: it.VideoStreamURL,
          });
          added++;
        }
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
      layer = L.layerGroup().addTo(map);
      customList = loadCustom();
      CONAN.ui.setStatus('cameras', camCount > 0 ? 'ok' : 'warn', camCount);
      loadFreewayCctv();
      initAddForm(map);
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else { map.removeLayer(layer); stopViewers(); }
    },
  };
})();
