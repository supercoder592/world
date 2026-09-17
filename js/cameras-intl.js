/* 🌍 國際監視器圖層 — 各國政府開放資料，皆免金鑰，開站自動載入
   （台灣以外目前沒有統一的全球監視器資料庫，只能逐一串接各國/各州市
   格式互異的開放資料。此檔涵蓋美國德州奧斯汀、加州、英國倫敦、加拿大
   安大略／卑詩省／卡加利、芬蘭、澳洲新南威爾斯、愛沙尼亞塔林、德國
   瓦倫多夫。標記加進與台灣監視器共用的同一個聚合圖層。） */
(function () {
  const cfg = CONAN.config.intlCctv;

  function setStatus(key, text) {
    const el = document.getElementById(`intl-status-${key}`);
    if (el) el.textContent = text;
  }

  /** Socrata rows.json 的欄位陣列 → 具名物件（fieldName 正規化為小寫底線） */
  function rowArrayToObject(row, columns) {
    const rec = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i] || {};
      const key = String(col.fieldName || col.name || `col_${i}`)
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (key) rec[key] = row[i];
    }
    return rec;
  }

  /** 容錯座標抽取：支援 WKT 字串、{lat,lon}/{latitude,longitude}、GeoJSON coordinates */
  function extractLatLon(value) {
    if (!value) return { lat: NaN, lon: NaN };
    if (typeof value === 'string') {
      const m = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(value);
      return m ? { lat: parseFloat(m[2]), lon: parseFloat(m[1]) } : { lat: NaN, lon: NaN };
    }
    if (typeof value !== 'object') return { lat: NaN, lon: NaN };
    const lat = parseFloat(value.latitude ?? value.lat ?? value.y ?? value.Latitude ?? value.Lat);
    const lon = parseFloat(value.longitude ?? value.lon ?? value.lng ?? value.x ?? value.Longitude ?? value.Lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
      return { lat: parseFloat(value.coordinates[1]), lon: parseFloat(value.coordinates[0]) };
    }
    return { lat: NaN, lon: NaN };
  }

  async function fetchJson(url, headers) {
    const res = await fetch(url, { headers, signal: CONAN.timeoutSignal(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ---------- Austin, TX（美國）：Socrata 開放資料 ---------- */
  async function fetchAustin() {
    const c = cfg.austin;
    const payload = await fetchJson(c.url, { Accept: 'application/json' });
    const columns = payload?.meta?.view?.columns || [];
    const rows = payload?.data || [];
    let added = 0;
    for (const row of rows) {
      if (added >= c.max) break;
      if (!Array.isArray(row)) continue;
      const rec = rowArrayToObject(row, columns);
      const id = rec.camera_id || rec.cameraid || rec.cam_id || rec.device_id || rec.intersection_id || rec.id;
      if (!id) continue;
      const status = String(rec.camera_status || '').trim().toUpperCase();
      if (status && status !== 'TURNED_ON') continue;
      const { lat, lon } = extractLatLon(rec.location ?? rec.coordinates ?? rec.the_geom ?? rec.point ?? rec.geocoded_column);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 30.02 || lat > 30.58 || lon < -98.12 || lon > -97.4) continue;
      const name = rec.camera_name || rec.location_name || rec.intersection_name || rec.location || rec.cross_street || rec.description || rec.name || `Austin Camera ${id}`;
      if (CONAN.cameras.addExternal({
        id: `austin-${id}`, name: `📍 ${name}`, desc: 'Austin, TX（美國）',
        lat, lon, url: `https://cctv.austinmobility.io/image/${encodeURIComponent(id)}.jpg`,
      })) added++;
    }
    return added;
  }

  /* ---------- 加州（美國）：Caltrans，四區平行抓取 ---------- */
  async function fetchCaltrans() {
    const c = cfg.caltrans;
    const settled = await Promise.allSettled(c.districts.map(async (d) => {
      const payload = await fetchJson(c.url(d), { Accept: 'application/json' });
      return { d, rows: payload?.data || [] };
    }));
    let added = 0;
    outer:
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      for (const row of r.value.rows) {
        if (added >= c.max) break outer;
        const cctv = row?.cctv;
        if (!cctv || String(cctv.inService).toLowerCase() !== 'true') continue;
        const loc = cctv.location || {};
        const lat = parseFloat(loc.latitude), lon = parseFloat(loc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const imageUrl = String(cctv.imageData?.static?.currentImageURL || '');
        if (!imageUrl.startsWith('https://cwwp2.dot.ca.gov/')) continue;
        const locName = String(loc.locationName || '').trim() || `Caltrans D${r.value.d}`;
        const id = `caltrans-d${r.value.d}-${lat.toFixed(4)},${lon.toFixed(4)}`;
        if (CONAN.cameras.addExternal({
          id, name: `📍 ${locName}`, desc: `Caltrans D${r.value.d}（美國加州）`, lat, lon, url: imageUrl,
        })) added++;
      }
    }
    return added;
  }

  /* ---------- 倫敦（英國）：TfL JamCam ---------- */
  async function fetchTfl() {
    const c = cfg.tfl;
    const places = await fetchJson(c.url, { Accept: 'application/json' });
    let added = 0;
    for (const place of Array.isArray(places) ? places : []) {
      if (added >= c.max) break;
      const props = {};
      for (const p of place?.additionalProperties || []) if (p?.key) props[p.key] = p.value;
      if (String(props.available).toLowerCase() !== 'true') continue;
      const lat = parseFloat(place?.lat), lon = parseFloat(place?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const imageUrl = String(props.imageUrl || '');
      if (!imageUrl.startsWith(c.imageOrigin)) continue;
      const rawId = String(place?.id || '').replace(/^JamCams_/, '');
      if (!rawId) continue;
      if (CONAN.cameras.addExternal({
        id: `tfl-${rawId}`, name: `📍 ${place?.commonName || `JamCam ${rawId}`}`,
        desc: '倫敦（英國）', lat, lon, url: imageUrl,
      })) added++;
    }
    return added;
  }

  /* ---------- 安大略（加拿大）：511on.ca ---------- */
  async function fetchOntario() {
    const c = cfg.ontario;
    const rows = await fetchJson(c.url, { Accept: 'application/json' });
    let added = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (added >= c.max) break;
      const id = String(row?.Id ?? row?.id ?? '').trim();
      if (!id) continue;
      const lat = parseFloat(row?.Latitude ?? row?.latitude), lon = parseFloat(row?.Longitude ?? row?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 41 || lat > 57.5 || lon < -95.6 || lon > -74) continue;
      const views = row?.Views || row?.views || [];
      const enabled = (Array.isArray(views) ? views : []).find(
        (v) => String(v?.Status || v?.status || '').trim().toLowerCase() === 'enabled'
      );
      if (!enabled) continue;
      let viewUrl = '';
      try {
        const u = new URL(String(enabled.Url || enabled.url || ''));
        const m = /^\/map\/Cctv\/([^/?#]+)$/.exec(u.pathname);
        const host = u.hostname.toLowerCase();
        if (m && u.protocol === 'https:' && (host === '511on.ca' || host.endsWith('.traveliq.co'))) {
          viewUrl = `${c.imageOrigin}${encodeURIComponent(decodeURIComponent(m[1]))}`;
        }
      } catch { /* 網址格式不對就跳過 */ }
      if (!viewUrl) continue;
      const label = String(row?.Location || row?.location || row?.Roadway || row?.roadway || `Ontario 511 Camera ${id}`).trim();
      if (CONAN.cameras.addExternal({
        id: `on-${id}`, name: `📍 ${label}`, desc: '安大略（加拿大）', lat, lon, url: viewUrl,
      })) added++;
    }
    return added;
  }

  /* ---------- 芬蘭：Fintraffic / Digitraffic 道路天氣攝影機 ---------- */
  async function fetchFintraffic() {
    const c = cfg.fintraffic;
    const payload = await fetchJson(c.url, { Accept: 'application/json', 'Digitraffic-User': c.digitrafficUser });
    const features = payload?.features || [];
    let added = 0;
    outer:
    for (const f of features) {
      const props = f?.properties || {};
      const stationId = String(props.id || '').trim();
      if (!stationId) continue;
      if (String(props.collectionStatus || '').toUpperCase() !== 'GATHERING') continue;
      const coords = f?.geometry?.coordinates;
      const lon = parseFloat(coords?.[0]), lat = parseFloat(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 59.5 || lat > 70.5 || lon < 19 || lon > 32) continue;
      const name = String(props.name || stationId).replace(/_/g, ' ');
      for (const preset of props.presets || []) {
        if (added >= c.max) break outer;
        if (preset?.inCollection !== true) continue;
        const presetId = String(preset?.id || '').trim();
        if (!/^C\d{7}$/.test(presetId) || !presetId.startsWith(stationId)) continue;
        if (CONAN.cameras.addExternal({
          id: `fi-${presetId.toLowerCase()}`, name: `📍 ${name}`, desc: '芬蘭',
          lat, lon, url: `${c.imageOrigin}${presetId}.jpg`,
        })) added++;
      }
    }
    return added;
  }

  /* ---------- 卑詩省（加拿大）：DriveBC ---------- */
  async function fetchDriveBc() {
    const c = cfg.drivebc;
    const rows = await fetchJson(c.url, { Accept: 'application/json' });
    let added = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (added >= c.max) break;
      if (row?.is_on !== true || row?.should_appear !== true) continue;
      if (!Number.isFinite(row.id) || row.id <= 0) continue;
      const coords = row.location?.coordinates; // GeoJSON：[lon, lat]
      const lon = parseFloat(coords?.[0]), lat = parseFloat(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 48 || lat > 60.5 || lon < -139.5 || lon > -114) continue;
      const name = String(row.name || '').trim() || `DriveBC camera ${row.id}`;
      if (CONAN.cameras.addExternal({
        id: `drivebc-${row.id}`, name: `📍 ${name}`, desc: '卑詩省（加拿大）',
        lat, lon, url: c.imageUrl(row.id),
      })) added++;
    }
    return added;
  }

  /* ---------- 新南威爾斯（澳洲）：Live Traffic NSW ---------- */
  async function fetchNsw() {
    const c = cfg.nsw;
    const body = await fetchJson(c.url, { Accept: 'application/json' });
    const features = body?.features || [];
    let added = 0;
    for (const f of features) {
      if (added >= c.max) break;
      const id = String(f?.id || '').trim();
      if (!id) continue;
      const coords = f?.geometry?.coordinates;
      const lon = typeof coords?.[0] === 'number' ? coords[0] : NaN;
      const lat = typeof coords?.[1] === 'number' ? coords[1] : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < -38 || lat > -28 || lon < 140.9 || lon > 159.2) continue;
      const props = f?.properties || {};
      const url = String(props.href || '').trim();
      if (!url.startsWith(c.imageOrigin)) continue;
      const view = String(props.view || '').trim();
      const title = String(props.title || '').trim();
      const label = (view && view.length <= 140 && !/[\r\n]/.test(view)) ? view : (title || `NSW ${id}`);
      if (CONAN.cameras.addExternal({
        id: `nsw-${id}`, name: `📍 ${label}`, desc: '新南威爾斯（澳洲）', lat, lon, url,
      })) added++;
    }
    return added;
  }

  /* ---------- 卡加利（加拿大）：Open Calgary ---------- */
  async function fetchCalgary() {
    const c = cfg.calgary;
    const rows = await fetchJson(c.url, { Accept: 'application/json' });
    let added = 0;
    const seen = new Set();
    for (const rec of Array.isArray(rows) ? rows : []) {
      if (added >= c.max) break;
      const coords = rec?.point?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = parseFloat(coords[0]), lat = parseFloat(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 50.8 || lat > 51.25 || lon < -114.4 || lon > -113.8) continue;
      const raw = String(rec?.camera_url?.url ?? '').trim();
      if (!raw) continue;
      let url;
      try { url = new URL(raw); url.protocol = 'https:'; } catch { continue; }
      const imageUrl = url.toString();
      if (!imageUrl.startsWith(c.imageOrigin)) continue;
      const m = /loc(\d+)\.jpg$/i.exec(url.pathname);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const id = `calgary-${m[1]}`;
      const name = String(rec?.camera_location || rec?.camera_url?.description || `Calgary Camera ${m[1]}`).trim();
      if (CONAN.cameras.addExternal({
        id, name: `📍 ${name}`, desc: '卡加利（加拿大）', lat, lon, url: imageUrl,
      })) added++;
    }
    return added;
  }

  /* ---------- 塔林（愛沙尼亞）／瓦倫多夫（德國）：
     取自 God's Eye View 專案公開 repo 的策展清單 ---------- */
  async function fetchCuratedList(key) {
    const c = cfg[key];
    const rows = await fetchJson(c.url);
    let added = 0;
    for (const item of Array.isArray(rows) ? rows : []) {
      if (added >= c.max) break;
      const id = String(item?.id ?? '').trim();
      const lat = typeof item?.lat === 'number' ? item.lat : NaN;
      const lon = typeof item?.lon === 'number' ? item.lon : NaN;
      const url = String(item?.url || item?.snapshotUrl || '').trim();
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || !url) continue;
      if (CONAN.cameras.addExternal({
        id: `${key}-${id}`, name: `📍 ${item?.name || id}`,
        desc: item?.city || key, lat, lon, url,
      })) added++;
    }
    return added;
  }

  const SOURCES = [
    { key: 'austin', label: 'Austin, TX（美國）', fetch: fetchAustin },
    { key: 'caltrans', label: '加州（美國）', fetch: fetchCaltrans },
    { key: 'tfl', label: '倫敦（英國）', fetch: fetchTfl },
    { key: 'ontario', label: '安大略（加拿大）', fetch: fetchOntario },
    { key: 'fintraffic', label: '芬蘭', fetch: fetchFintraffic },
    { key: 'drivebc', label: '卑詩省（加拿大）', fetch: fetchDriveBc },
    { key: 'nsw', label: '新南威爾斯（澳洲）', fetch: fetchNsw },
    { key: 'calgary', label: '卡加利（加拿大）', fetch: fetchCalgary },
    { key: 'tallinn', label: '塔林（愛沙尼亞）', fetch: () => fetchCuratedList('tallinn') },
    { key: 'warendorf', label: '瓦倫多夫（德國）', fetch: () => fetchCuratedList('warendorf') },
  ];

  function buildPanel() {
    const list = document.getElementById('intl-cctv-list');
    if (!list) return;
    list.innerHTML = SOURCES.map((s) =>
      `<div class="kv"><span>${s.label}</span><b id="intl-status-${s.key}">待命…</b></div>`
    ).join('');
  }

  async function runSource(s) {
    setStatus(s.key, '載入中…');
    try {
      const n = await s.fetch();
      CONAN.cameras.refresh();
      setStatus(s.key, n > 0 ? `已載入 ${n} 支` : '無可用資料');
    } catch (e) {
      setStatus(s.key, e.message || '載入失敗（CORS/網路限制）');
    }
  }

  CONAN.camerasIntl = {
    init() {
      buildPanel();
      // 全部來源各自獨立、平行載入，一個失敗不影響其他國家
      Promise.allSettled(SOURCES.map(runSource));
    },
  };
})();
