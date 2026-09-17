# 🔍 太平洋浮標「柯南」（Pacific Buoy "CONAN"）

> 真相永遠只有一個！

以台灣為中心的即時觀測站：在同一張地圖上匯集**公開監視器**、**飛機（ADS-B）**與**船舶（AIS）**的即時動態。純前端靜態網站，無後端、無資料庫，所有資料都由你的瀏覽器直接向公開資料源取得。

## ✨ 功能

| 圖層 | 資料來源 | 金鑰 |
|------|----------|------|
| ✈️ 飛機 | 公開 ADS-B 匯流：[adsb.lol](https://adsb.lol) → [adsb.fi](https://adsb.fi) → [airplanes.live](https://airplanes.live)（自動備援） | 免金鑰 |
| 🚢 船舶 | [aisstream.io](https://aisstream.io) 即時 AIS WebSocket 串流 | 免費金鑰（自行註冊，僅存於瀏覽器 localStorage） |
| 📷 監視器 | 國道：高速公路局開放資料（免金鑰）。省道 / 22 縣市：[交通部 TDX](https://tdx.transportdata.tw/)（匿名可試用，免費金鑰解除每日次數限制）。另可自行新增任何公開影像網址（JPG 快照 / MJPEG / HLS / 網頁連結） | 免金鑰（TDX 金鑰選填） |
| 🌊 海象浮標 | [中央氣象署開放資料](https://opendata.cwa.gov.tw/) 海象監測浮標（O-B0075-001）：浪高、波向、週期、海溫、風速、潮位 | 免費授權碼（自行註冊，僅存於瀏覽器 localStorage） |
| 🌏 地震 | [USGS](https://earthquake.usgs.gov/) 全球即時地震目錄，過濾台灣周邊近 7 天，依規模著色 | 免金鑰 |
| 🛰️ 衛星 | [CelesTrak](https://celestrak.org/) 軌道根數（最亮衛星＋太空站），瀏覽器端 [satellite.js](https://github.com/shashwatak/satellite-js) SGP4 推算，每 5 秒更新頭頂位置（TLE 快取 6 小時） | 免金鑰 |

- 每 10 秒更新飛機位置，依高度著色並顯示航跡
- AIS 船位即時串流（台灣周邊海域 20.5°N–26.8°N、117.5°E–123.5°E）
- 監視器彈窗內直接播放快照 / HLS 串流，並附原始來源連結；數千支 CCTV 以標記聚合呈現不卡頓
- 海象浮標每 10 分鐘自動更新最新觀測
- 夜間偵探風深色介面，支援手機瀏覽

## 🚀 使用方式

純靜態網站，任何 HTTP 伺服器都能跑：

```bash
python3 -m http.server 8080
# 開啟 http://localhost:8080
```

或啟用 GitHub Pages（Settings → Pages → Source 選 **GitHub Actions**），內附的 workflow 會自動部署。

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
- [x] 地震圖層（USGS 台灣周邊）
- [x] 頭頂衛星圖層（CelesTrak + SGP4）
- [ ] 氣象署潮位站觀測
- [ ] 擴大搜查範圍：沖繩、菲律賓、整個西太平洋
- [ ] 事件回放與航跡歷史

## 🙏 致敬

衛星與地震圖層的靈感來自 [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)——同樣「把公開訊號放上同一張地圖」精神的 3D 地球儀專案。

## ⚖️ 聲明

本專案僅整合各單位**公開**的即時資料（政府開放資料 CCTV、志願者社群回報的 ADS-B / AIS 訊號），不包含任何非公開來源。名稱「柯南」為致敬之暱稱，與原作無關。所有資料僅供參考，**不得**作為航行或飛航安全用途。
