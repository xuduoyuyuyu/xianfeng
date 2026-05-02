(() => {
  if (window.WelGeometryVisual) return;
  const STYLE_ID = 'wel-geometry-visual-style';
  const THEMES = new Set(['default', 'assess', 'practice', 'board', 'wrong']);
  const esc = (v='') => String(v || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const ensureStyles = (doc) => {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    const st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
.wel-geom{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden}
.wel-geom-hd{padding:9px 12px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #edf2f7;background:#f8fafc}
.wel-geom-bd{padding:10px;display:flex;flex-direction:column;gap:10px}
.wel-geom-img{width:100%;height:auto;object-fit:contain;max-height:360px;border-radius:10px;background:#fff}
.wel-geom-svg{width:100%;overflow:auto;background:#fff}
.wel-geom-empty{min-height:150px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:7px;color:#94a3b8;background:linear-gradient(180deg,#f8fafc,#fff)}
.wel-geom-empty .icon{font-size:34px;line-height:1}
.wel-geom-empty .txt{font-size:12px}
.wel-geom.theme-assess{border-color:#e2e8f0}
.wel-geom.theme-practice{border-color:rgba(127,19,236,.2);background:rgba(255,255,255,.9);box-shadow:0 8px 26px rgba(127,19,236,.08)}
.wel-geom.theme-practice .wel-geom-hd{background:rgba(127,19,236,.06);color:#7f13ec;border-bottom-color:rgba(127,19,236,.14)}
.wel-geom.theme-board{border-color:#dbe3ef}
.wel-geom.theme-board .wel-geom-hd{background:#f8fafc}
.wel-geom.theme-wrong{border-color:#e5e7eb}
.wel-geom.theme-wrong .wel-geom-hd{background:#f9fafb}
`;
    (doc.head || doc.documentElement).appendChild(st);
  };
  const render = (container, payload = {}, opts = {}) => {
    if (!container) return;
    const doc = container.ownerDocument || document;
    ensureStyles(doc);
    const themeRaw = String(opts.theme || container.getAttribute('data-geom-theme') || 'default').trim();
    const theme = THEMES.has(themeRaw) ? themeRaw : 'default';
    const imageUrl = String(payload.image_url || payload.imageUrl || '').trim();
    const svg = String(payload.svg || '').trim();
    const title = String(opts.title || container.getAttribute('data-geom-title') || '几何图形高保真还原区域');
    if (!imageUrl && !svg) {
      container.innerHTML = `<div class="wel-geom theme-${theme}"><div class="wel-geom-hd">${esc(title)}</div><div class="wel-geom-bd"><div class="wel-geom-empty"><div class="icon">◌</div><div class="txt">暂无图形内容</div></div></div></div>`;
      return;
    }
    container.innerHTML = `<div class="wel-geom theme-${theme}"><div class="wel-geom-hd">${esc(title)}</div><div class="wel-geom-bd">${imageUrl ? `<img class="wel-geom-img" alt="题目图形" src="${esc(imageUrl)}">` : ''}${svg ? `<div class="wel-geom-svg">${svg}</div>` : ''}</div></div>`;
  };
  window.WelGeometryVisual = { render, ensureStyles };
})();
