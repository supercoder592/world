/* 🚢 船舶圖層 — aisstream.io 即時 AIS（使用者自備免費金鑰，僅存於 localStorage） */
(function () {
  const cfg = CONAN.config.ais;
  const ships = new Map(); // mmsi -> { marker, lastSeen, data }
  let layer = null;
  let ws = null;
  let reconnectTimer = null;
  let cleanTimer = null;
  let currentKey = null;

  function shipIcon(cog) {
    const rot = Number.isFinite(cog) && cog < 360 ? cog : 0;
    return L.divIcon({
      className: 'ship-icon',
      html: `<svg width="18" height="18" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
        <path fill="#3fd0a4" stroke="#0a2019" stroke-width="1" d="M12 2 L18 16 L12 13 L6 16 Z"/>
      </svg>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function popupHtml(s) {
    const name = (s.name || '').trim() || '(未知船名)';
    return `<div class="popup">
      <h3>🚢 ${name}</h3>
      <div class="kv"><span>MMSI</span><b>${s.mmsi}</b></div>
      <div class="kv"><span>航速</span><b>${Number.isFinite(s.sog) ? s.sog.toFixed(1) + ' kt' : '–'}</b></div>
      <div class="kv"><span>航向</span><b>${Number.isFinite(s.cog) && s.cog < 360 ? Math.round(s.cog) + '°' : '–'}</b></div>
      <div class="kv"><span>最後回報</span><b>${new Date(s.lastSeen).toLocaleTimeString('zh-TW')}</b></div>
      <a href="https://www.vesselfinder.com/?mmsi=${s.mmsi}" target="_blank" rel="noopener">在 VesselFinder 追查 →</a>
    </div>`;
  }

  function setAisStatus(text, cls) {
    document.getElementById('ais-status').textContent = text;
    CONAN.ui.setStatus('ships', cls, ships.size);
  }

  function connect(key) {
    disconnect();
    currentKey = key;
    const b = CONAN.config.bounds;
    setAisStatus('連線中…', 'warn');
    try {
      ws = new WebSocket(cfg.wsUrl);
    } catch (e) {
      setAisStatus('無法建立 WebSocket', 'err');
      return;
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({
        APIKey: key,
        BoundingBoxes: [[[b.south, b.west], [b.north, b.east]]],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
      setAisStatus('已連線，等待船位…', 'ok');
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.error) { setAisStatus(`錯誤：${msg.error}`, 'err'); return; }
      handleMessage(msg);
    };
    ws.onclose = (ev) => {
      if (ev.code === 1000 || !currentKey) return;
      setAisStatus('連線中斷，10 秒後重連…', 'warn');
      reconnectTimer = setTimeout(() => connect(currentKey), 10000);
    };
    ws.onerror = () => {
      setAisStatus('連線錯誤（金鑰無效或網路問題）', 'err');
    };
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    if (ws) {
      const old = ws;
      ws = null;
      old.onclose = null;
      try { old.close(1000); } catch { /* noop */ }
    }
  }

  function handleMessage(msg) {
    const meta = msg.MetaData || {};
    const mmsi = meta.MMSI;
    if (!mmsi) return;
    const now = Date.now();
    let s = ships.get(mmsi);

    if (msg.MessageType === 'PositionReport') {
      const pr = (msg.Message && msg.Message.PositionReport) || {};
      const lat = pr.Latitude, lon = pr.Longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (!s) {
        if (ships.size >= cfg.maxShips) return;
        const marker = L.marker([lat, lon], { icon: shipIcon(pr.Cog) });
        s = { marker, mmsi, lastSeen: now };
        marker.bindPopup(() => popupHtml(s));
        marker.addTo(layer);
        ships.set(mmsi, s);
      } else {
        s.marker.setLatLng([lat, lon]);
        s.marker.setIcon(shipIcon(pr.Cog));
      }
      s.sog = pr.Sog;
      s.cog = pr.Cog;
      s.lastSeen = now;
      if (meta.ShipName) s.name = meta.ShipName;
      setAisStatus(`即時串流中（${ships.size} 艘）`, 'ok');
    } else if (msg.MessageType === 'ShipStaticData') {
      const name = (msg.Message && msg.Message.ShipStaticData && msg.Message.ShipStaticData.Name) || meta.ShipName;
      if (s && name) s.name = name;
    }
  }

  function cleanup() {
    const now = Date.now();
    for (const [mmsi, s] of ships) {
      if (now - s.lastSeen > cfg.staleMs) {
        layer.removeLayer(s.marker);
        ships.delete(mmsi);
      }
    }
    if (ws) CONAN.ui.setStatus('ships', 'ok', ships.size);
  }

  CONAN.ships = {
    init(map) {
      layer = L.layerGroup().addTo(map);
      cleanTimer = setInterval(cleanup, 60000);

      const keyInput = document.getElementById('ais-key');
      const saved = CONAN.store.get(CONAN.config.storageKeys.aisKey);
      if (saved) {
        keyInput.value = saved;
        connect(saved);
      } else {
        setAisStatus('未設定金鑰', 'warn');
      }
      document.getElementById('ais-connect').addEventListener('click', () => {
        const key = keyInput.value.trim();
        if (!key) {
          CONAN.store.del(CONAN.config.storageKeys.aisKey);
          currentKey = null;
          disconnect();
          setAisStatus('未設定金鑰', 'warn');
          return;
        }
        CONAN.store.set(CONAN.config.storageKeys.aisKey, key);
        connect(key);
      });
    },
    setVisible(on, map) {
      if (on) layer.addTo(map); else map.removeLayer(layer);
    },
  };
})();
