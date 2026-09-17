/* 🗺️ MapLibre GL 輔助 — DOM 標記與彈窗的共用小工具（注意：MapLibre 座標順序是 [lon, lat]） */
(function () {
  CONAN.gl = {
    activePopup: null,

    /** 由 HTML 字串建立 DOM 元素（取第一個元素） */
    el(html) {
      const t = document.createElement('div');
      t.innerHTML = html.trim();
      return t.firstElementChild;
    },

    /** 建立 DOM 標記並加到地圖 */
    addMarker(map, lat, lon, element) {
      return new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);
    },

    /** 開啟彈窗（一次只留一個），onOpen 拿到彈窗 DOM 供事件掛載 */
    openPopup(map, lat, lon, html, { onOpen, onClose, maxWidth = '340px' } = {}) {
      if (CONAN.gl.activePopup) CONAN.gl.activePopup.remove();
      const p = new maplibregl.Popup({ maxWidth, offset: 14 })
        .setLngLat([lon, lat])
        .setHTML(html)
        .addTo(map);
      CONAN.gl.activePopup = p;
      if (onClose) p.on('close', onClose);
      if (onOpen) onOpen(p.getElement(), p);
      return p;
    },

    /** 某點相對地圖目前中心是否在「地球正面」（大圓角距離 < ~88 度） */
    isFrontFacing(map, lat, lon) {
      const c = map.getCenter();
      const toRad = (d) => (d * Math.PI) / 180;
      const p1 = toRad(c.lat), p2 = toRad(lat);
      const dLon = toRad(lon - c.lng);
      const cosAngle = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon);
      return cosAngle > 0.035; // ≈ 88 度，留一點餘裕避免剛好卡在地平線上閃爍
    },

    /**
     * 球體投影下，MapLibre 的 DOM 標記（Marker）不會被地球本體正確遮擋——
     * 地球背面的點一樣會被投影到畫面上，看起來像「穿透」地球。這個函式在
     * 地圖搬移時，把落在背面的標記直接關掉顯示（display:none），回傳的
     * update() 也可以在你自己批次加完/更新完標記後手動呼叫一次，讓新標記
     * 不用等下一次地圖移動才套用正確的顯隱狀態。
     * getItems() 需回傳可疊代的 { lat, lon, marker }（marker 可為 null/undefined）。
     */
    wireHemisphereCulling(map, getItems) {
      function apply() {
        for (const it of getItems()) {
          if (!it || !it.marker) continue;
          const el = it.marker.getElement();
          if (el) el.style.display = CONAN.gl.isFrontFacing(map, it.lat, it.lon) ? '' : 'none';
        }
      }
      let queued = false;
      function update() {
        // 拖曳地圖時 'move' 一秒觸發數十次；用 rAF 合併成每畫格最多算一次
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; apply(); });
      }
      map.on('move', update);
      apply();
      return apply; // 資料更新後想立刻套用（不等下一幀）就直接呼叫這個
    },
  };
})();
