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
  };
})();
