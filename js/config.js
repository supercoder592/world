/* 太平洋浮標「柯南」 — 全域設定 */
window.CONAN = window.CONAN || {};

CONAN.config = {
  // 地圖初始視野：台灣全島＋周邊海域
  center: [23.7, 121.0],
  zoom: 8,
  bounds: { south: 20.5, west: 117.5, north: 26.8, east: 123.5 },

  // ADS-B 公開匯流 API（皆免金鑰、支援 CORS、回傳格式相同；依序自動備援，
  // 同站兩種路徑寫法都列入以防 API 改版）
  adsb: {
    sources: [
      { name: 'adsb.lol',       url: (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}` },
      { name: 'adsb.lol',       url: (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}` },
      { name: 'adsb.fi',        url: (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}` },
      { name: 'airplanes.live', url: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}` },
    ],
    radiusNm: 250,          // 涵蓋台灣本島與周邊空域（API 上限 250 海里）
    intervalMs: 10000,      // 輪詢間隔
    staleMs: 60000,         // 超過此時間未更新即移除
    trailLength: 25,        // 航跡保留點數
  },

  // AIS 船舶：aisstream.io WebSocket（需使用者自備免費金鑰）
  ais: {
    wsUrl: 'wss://stream.aisstream.io/v0/stream',
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

  // 中央氣象署開放資料：海象監測浮標（O-B0075-001，需免費授權碼）
  cwa: {
    buoyUrl: (key) => `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-B0075-001?Authorization=${encodeURIComponent(key)}&format=JSON`,
    refreshMs: 10 * 60 * 1000, // 浮標每小時觀測數筆，10 分鐘重抓一次即可
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
