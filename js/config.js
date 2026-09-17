/* 太平洋浮標「柯南」 — 全域設定 */
window.CONAN = window.CONAN || {};

CONAN.config = {
  // 地圖初始視野：台灣全島＋周邊海域（首頁預設落點，非資料涵蓋範圍上限）
  center: [23.7, 121.0],
  zoom: 6,

  // 「回台灣」：CCTV 濾網範圍 + 導覽列的回台灣按鈕共用
  taiwan: {
    center: [23.7, 121.0],
    zoom: 8,
    bounds: { south: 20.5, west: 117.5, north: 26.8, east: 123.5 },
  },

  // ADS-B 公開匯流 API（皆免金鑰、支援 CORS、回傳格式相同；依序自動備援，
  // 同站兩種路徑寫法都列入以防 API 改版）。全球版：查詢中心與半徑跟著地圖
  // 目前視野走（見 aircraft.js updateQueryFromView），不再鎖定台灣。
  adsb: {
    sources: [
      { name: 'adsb.lol',       url: (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}` },
      { name: 'adsb.lol',       url: (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}` },
      { name: 'adsb.fi',        url: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}` },
      { name: 'airplanes.live', url: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}` },
      { // 最後備援：OpenSky 匿名模式（歐洲學術網路，較少被擋；每日次數有限、更新較慢）
        name: 'OpenSky',
        format: 'opensky',
        url: (lat, lon, nm) => {
          const b = CONAN.geo.bboxFromCenterRadius(lat, lon, nm);
          return `https://opensky-network.org/api/states/all?lamin=${b.south}&lomin=${b.west}&lamax=${b.north}&lomax=${b.east}`;
        },
      },
    ],
    maxRadiusNm: 250,       // API 單次查詢半徑上限（海里）
    minRadiusNm: 20,        // 放大到街道層級時仍維持的最小查詢半徑
    intervalMs: 10000,      // 輪詢間隔
    staleMs: 60000,         // 超過此時間未更新即移除
    trailLength: 25,        // 航跡保留點數
  },

  // AIS 船舶：aisstream.io WebSocket（需使用者自備免費金鑰）。全球版：訂閱整個
  // 地球的邊界框，船隻量會非常大，靠 maxShips 上限保護效能。
  ais: {
    wsUrl: 'wss://stream.aisstream.io/v0/stream',
    globalBounds: { south: -90, west: -180, north: 90, east: 180 },
    staleMs: 15 * 60 * 1000, // AIS 回報頻率低，15 分鐘未更新才移除
    maxShips: 3000,
  },

  // 高速公路局開放資料 CCTV（免金鑰）。若瀏覽器端因 CORS 失敗則優雅降級。
  cctv: {
    sources: [
      'https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml',
      'https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.json',
    ],
    snapshotRefreshMs: 2000, // 快照影像重整間隔
  },

  // 交通部 TDX（省道 / 縣市 CCTV）。無金鑰時以匿名模式呼叫（每日次數有限）。
  tdx: {
    tokenUrl: 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    highwayCctvUrl: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Highway?%24format=JSON',
    freewayCctvUrl: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Freeway?%24format=JSON',
    cityCctvUrl: (city) => `https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/${city}?%24format=JSON`,
  },

  // 國際監視器（各國政府開放資料，皆免金鑰）。座標、快照網址直接取自各官方
  // API；不做姿態/朝向推算（本站不需要 3D 相機姿態，只需要點位＋影像）。
  // 監視器圖層是原生 GL 聚合圖層渲染（不是逐一 DOM 元素），上萬個點也不影響
  // 效能，所以 max 只當「防禦性上限」（擋掉來源異常暴量），不是真的限縮範圍
  // ——每個來源都設得比實際資料量大，盡量拿到該來源「全部」的監視器。
  intlCctv: {
    austin: { url: 'https://data.austintexas.gov/api/views/b4k4-adkb/rows.json?accessType=DOWNLOAD', max: 2000 },
    caltrans: {
      url: (d) => `https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${String(d).padStart(2, '0')}.json`,
      districts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // 加州全部 12 個轄區
      max: 5000,
    },
    tfl: { url: 'https://api.tfl.gov.uk/Place/Type/JamCam', imageOrigin: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/', max: 3000 },
    ontario: { url: 'https://511on.ca/api/v2/get/cameras?format=json&lang=en', imageOrigin: 'https://511on.ca/map/Cctv/', max: 3000 },
    fintraffic: { url: 'https://tie.digitraffic.fi/api/weathercam/v1/stations', imageOrigin: 'https://weathercam.digitraffic.fi/', digitrafficUser: 'conan-pacific-buoy', max: 3000 },
    drivebc: { url: 'https://www.drivebc.ca/api/webcams/', imageUrl: (id) => `https://www.drivebc.ca/images/${id}.jpg`, max: 2000 },
    nsw: { url: 'https://data.livetraffic.com/cameras/traffic-cam.json', imageOrigin: 'https://webcams.transport.nsw.gov.au/', max: 2000 },
    calgary: { url: 'https://data.calgary.ca/resource/k7p9-kppz.json?$limit=2000', imageOrigin: 'https://trafficcam.calgary.ca/', max: 2000 },
    // 塔林（愛沙尼亞）／瓦倫多夫（德國）：直接取用 God's Eye View 專案公開
    // repo 裡的策展清單（raw.githubusercontent.com 對公開 repo 開放 CORS）
    tallinn: { url: 'https://raw.githubusercontent.com/bilawalsidhu/gods-eye-view/main/config/cctv_sources.tallinn.json', max: 1000 },
    warendorf: { url: 'https://raw.githubusercontent.com/bilawalsidhu/gods-eye-view/main/config/cctv_sources.warendorf.json', max: 100 },
  },

  // 中央氣象署開放資料：海象監測浮標（O-B0075-001，需免費授權碼）
  cwa: {
    buoyUrl: (key) => `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-B0075-001?Authorization=${encodeURIComponent(key)}&format=JSON`,
    refreshMs: 10 * 60 * 1000, // 浮標每小時觀測數筆，10 分鐘重抓一次即可
  },

  // 地震：USGS 全球即時地震（免金鑰、CORS 開放）。全球版：不過濾地區，但改用
  // M4.5+ 版本而非 all_week——後者全球一週上萬筆微震，逐一畫成標記會讓手機卡死。
  quakes: {
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
    refreshMs: 5 * 60 * 1000,
  },

  // 衛星：CelesTrak TLE（免金鑰）＋ satellite.js 瀏覽器端軌道推算。全球版：
  // 星下點覆蓋全地球，不過濾地區。
  sats: {
    groups: ['visual', 'stations'], // 最亮衛星 + 太空站
    tleUrl: (g) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`,
    tleCacheMs: 6 * 60 * 60 * 1000, // TLE 六小時更新一次即可，尊重 CelesTrak 流量
    propagateMs: 5000,              // 每 5 秒重新推算位置
  },

  storageKeys: {
    aisKey: 'conan.aisKey',
    customCams: 'conan.customCams',
    tdxCreds: 'conan.tdxCreds',
    cwaKey: 'conan.cwaKey',
  },
};

/** AbortSignal.timeout 相容層 — 舊版 Safari/瀏覽器沒有此 API，缺了會讓所有 fetch 拋錯 */
CONAN.timeoutSignal = function (ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/** localStorage 相容層 — 私密瀏覽等情境下存取可能直接拋錯 */
CONAN.store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* noop */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

/** 地理小工具：全球版飛機圖層需要「跟著目前地圖視野查詢」，靠這兩個函式換算 */
CONAN.geo = {
  /** Haversine 兩點距離（海里） */
  distanceNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // 地球平均半徑，海里
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
  /** 由中心點＋半徑（海里）換算一個近似的經緯度邊界框，供需要 bbox 的 API 使用 */
  bboxFromCenterRadius(lat, lon, radiusNm) {
    const km = radiusNm * 1.852;
    const dLat = km / 111.32;
    const dLon = km / (111.32 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    return {
      south: Math.max(-90, lat - dLat),
      north: Math.min(90, lat + dLat),
      west: lon - dLon,
      east: lon + dLon,
    };
  },
};
