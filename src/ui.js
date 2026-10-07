// 画面まわりの共通部品。
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pct = (p) => `${(p * 100).toFixed(1)}%`;

/** 「ラベル・横棒・パーセント」の行を並べる。値が null の行は「−」を出す。 */
export const prows = (values, label) => `<div class="prows">${values.map((p, i) => `
  <div class="prow"><span class="prow-label">${label(i + 1)}</span><span class="prow-track">${p === null ? '' : `<span class="prow-fill" style="width:${(p * 100).toFixed(2)}%"></span>`}</span><span class="prow-val">${p === null ? '−' : pct(p)}</span></div>`).join('')}</div>`;

/** 縦棒グラフ。stacked のときは parts を積み上げる。 */
export function columns(items, { stacked }) {
  const max = Math.max(...items.map((d) => d.total)) || 1;
  return `<div class="cols">${items.map((d) => `
      <div class="col" tabindex="0" data-tip="${esc(d.tip)}">
        ${d.label ? `<span class="col-count">${d.label}</span>` : ''}
        <span class="col-stack" style="height:${((d.total / max) * 100).toFixed(2)}%">
          ${stacked
            ? d.parts.filter((p) => p.value > 0).map((p) => `<span class="seg ${p.key}" style="flex:${p.value} 1 0"></span>`).join('')
            : d.total > 0 ? '<span class="seg single" style="flex:1 1 0"></span>' : ''}
        </span>
      </div>`).join('')}</div>
    <div class="axis">${items.map((d) => `<span>${d.axis}</span>`).join('')}</div>`;
}

/** data-tip を持つ要素のツールチップ（マウスとキーボードの両方）。 */
export function setupTooltips() {
  const tip = $('tip');
  const show = (target, x, y) => {
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 10)}px`;
  };
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) show(t, e.clientX, e.clientY); else tip.hidden = true;
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    const r = t.getBoundingClientRect();
    show(t, r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', () => { tip.hidden = true; });
}

/** 今日の日付（端末の時刻）を YYYY-MM-DD で返す。 */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
