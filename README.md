# 🔍 太平洋浮標「柯南」（Pacific Buoy "CONAN"）

> 真相永遠只有一個！

**全球**即時觀測站，台灣起家：在同一顆 **3D 球體地球**（MapLibre GL globe 投影）上匯集**飛機（ADS-B）**、**船舶（AIS）**、**地震**、**頭頂衛星**的全球即時動態，加上**台灣地區公開監視器**——縮小是地球，放大是街道，轉到世界任何地方都能看。純前端靜態網站，無後端、無資料庫，所有資料都由你的瀏覽器直接向公開資料源取得。

## ✨ 功能

| 圖層 | 範圍 | 資料來源 | 金鑰 |
|------|------|----------|------|
| ✈️ 飛機 | 🌍 全球（跟著地圖視野查詢） | 公開 ADS-B 匯流：[adsb.lol](https://adsb.lol) → [adsb.fi](https://adsb.fi) → [airplanes.live](https://airplanes.live) → [OpenSky](https://opensky-network.org)（自動備援） | 免金鑰 |
| 🚢 船舶 | 🌍 全球 | [aisstream.io](https://aisstream.io) 即時 AIS WebSocket 串流 | 免費金鑰（自行註冊，僅存於瀏覽器 localStorage） |
| 🌏 地震 | 🌍 全球（M4.5 以上，近 7 天） | [USGS](https://earthquake.usgs.gov/) 全球即時地震目錄，依規模著色 | 免金鑰 |
| 🛰️ 衛星 | 🌍 全球 | [CelesTrak](https://celestrak.org/) 軌道根數（最亮衛星＋太空站），瀏覽器端 [satellite.js](https://github.com/shashwatak/satellite-js) SGP4 推算，每 5 秒更新位置（TLE 快取 6 小時） | 免金鑰 |
| 📷 監視器 | 🇹🇼 台灣 | 國道：高速公路局開放資料（免金鑰）。省道 / 22 縣市：[交通部 TDX](https://tdx.transportdata.tw/)（匿名可試用，免費金鑰解除每日次數限制）。另可自行新增任何公開影像網址（JPG 快照 / MJPEG / HLS / 網頁連結） | 免金鑰（TDX 金鑰選填） |
| 🌊 海象浮標 | 🇹🇼 台灣 | [中央氣象署開放資料](https://opendata.cwa.gov.tw/) 海象監測浮標（O-B0075-001）：浪高、波向、週期、海溫、風速、潮位 | 免費授權碼（自行註冊，僅存於瀏覽器 localStorage） |

> 監視器與海象浮標限台灣，是因為這是唯一有公開開放資料的範圍——全世界沒有統一的公開監視器資料庫，其他國家要各自串接不同格式的政府開放資料，之後可視需要個別擴充。

- 飛機每 10 秒更新，查詢範圍跟著地圖視野走（像 Flightradar24），依高度著色並顯示航跡
- 船舶 AIS 訂閱全球邊界框，以數量上限保護瀏覽器效能
- 監視器彈窗內直接播放快照 / HLS 串流，或以站內預覽視窗開啟（不跳新分頁）；數千支 CCTV 以標記聚合呈現不卡頓，開站自動載入國道／省道／全部 22 縣市
- 海象浮標每 10 分鐘自動更新最新觀測
- 頂欄「🏠 台灣」按鈕隨時飛回台灣視野
- 夜間偵探風深色介面，支援手機瀏覽

## 🚀 使用方式

純靜態網站，任何 HTTP 伺服器都能跑：

```bash
python3 -m http.server 8080
# 開啟 http://localhost:8080
```

或啟用 GitHub Pages（Settings → Pages → Source 選 **GitHub Actions**），內附的 workflow 會自動部署。

## 🔑 需要哪些金鑰？

**完全不用金鑰就有**：飛機、國道 CCTV、地震、頭頂衛星、地圖底圖。

以下三個是「選配」，全部免費，各自解鎖一個圖層或額度。沒填金鑰時，對應的圖層與狀態燈會自動隱藏：

| 金鑰 | 解鎖 | 去哪拿 |
|------|------|--------|
| AISStream API Key | 🚢 船舶即時動態 | [aisstream.io](https://aisstream.io) 註冊 → 建立 API Key |
| CWA 授權碼（`CWA-` 開頭） | 🌊 海象浮標 | [opendata.cwa.gov.tw](https://opendata.cwa.gov.tw/) 註冊 → 會員資訊 → 取得授權碼 |
| TDX Client ID + Secret | 📷 省道／縣市 CCTV 額度（匿名模式每日次數有限） | [tdx.transportdata.tw](https://tdx.transportdata.tw/register) 註冊 → 資料服務 → 會員專區 → API 金鑰 |

### 啟用船舶圖層

1. 到 [aisstream.io](https://aisstream.io) 免費註冊並建立 API Key
2. 在側欄「🚢 船舶（AIS）」貼上金鑰並按「連線」
3. 金鑰只儲存在你自己的瀏覽器，不會上傳到任何地方

### 啟用省道 / 縣市監視器（TDX）

1. 側欄「📷 公開監視器」按「載入省道 CCTV」，或選縣市後按「載入」——未填金鑰時走 TDX 匿名模式（每日次數有限）
2. 想解除限制：到 [TDX](https://tdx.transportdata.tw/register) 免費註冊，建立 API 金鑰後在「🔑 TDX 金鑰」填入 Client ID / Secret

### 啟用海象浮標

1. 到 [氣象開放資料平臺](https://opendata.cwa.gov.tw/) 免費註冊，取得授權碼（`CWA-` 開頭）
2. 在側欄「🌊 氣象署海象浮標」貼上授權碼並按「載入」

## 🗺️ 後續搜查計畫（Roadmap)

- [x] 公路局省道 / 縣市政府開放資料 CCTV 圖層（TDX）
- [x] 中央氣象署海象浮標觀測
- [x] 地震圖層（USGS）
- [x] 頭頂衛星圖層（CelesTrak + SGP4）
- [x] 飛機／船舶／地震／衛星擴建為全球範圍
- [ ] 氣象署潮位站觀測
- [ ] 其他國家的公開監視器（美/英/加/澳/芬蘭/愛沙尼亞等，各自不同格式）
- [ ] 事件回放與航跡歷史

## 🙏 致敬

衛星與地震圖層的靈感來自 [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)——同樣「把公開訊號放上同一張地圖」精神的 3D 地球儀專案。

## ⚖️ 聲明

本專案僅整合各單位**公開**的即時資料（政府開放資料 CCTV、志願者社群回報的 ADS-B / AIS 訊號），不包含任何非公開來源。名稱「柯南」為致敬之暱稱，與原作無關。所有資料僅供參考，**不得**作為航行或飛航安全用途。
