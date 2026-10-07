import { HAND_SIZE, atLeast, drawProbability, inkOnCurve, openingInkableDistribution } from './prob.js';
import { INK_COLORS, MIN_DECK_SIZE, MAX_COPIES, MAX_COST_BUCKET, colorLabel, parseDeckList, summarize } from './deck.js';
import { CARD_COUNT, CARD_DATA_DATE, cardNames, fillFromData, lookupCard } from './cards.js';

const STORAGE_KEY = 'lorcana-deck-lab:v1';
const TURNS = 8;

// 最初に表示する見本。実在のカードではなく、形だけのダミー。
const SAMPLE = [[1, true], [1, true], [2, true], [2, true], [2, false], [3, true], [3, true], [3, true], [4, true], [4, true], [4, false], [5, true], [5, false], [6, true], [7, false]]
  .map(([cost, inkable], i) => ({ count: 4, name: `サンプルカード ${String(i + 1).padStart(2, '0')}`, cost, inkable, color: '' }));

let nextId = 1;
const withId = (c) => ({ id: nextId++, count: c.count ?? 1, name: c.name ?? '', cost: Number.isFinite(c.cost) ? c.cost : null, inkable: typeof c.inkable === 'boolean' ? c.inkable : null, color: c.color || '' });

const state = { cards: SAMPLE.map(withId), onPlay: true, targets: new Set(), need: 1, mulligan: false, isSample: true };
state.targets.add(state.cards[0].id);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.cards) || !saved.cards.length) return;
    state.cards = saved.cards.map(withId);
    state.onPlay = saved.onPlay !== false;
    state.need = Number.isInteger(saved.need) ? saved.need : 1;
    state.mulligan = !!saved.mulligan;
    state.isSample = !!saved.isSample;
    state.targets = new Set((saved.targetIndexes || []).map((i) => state.cards[i]?.id).filter(Boolean));
  } catch { /* 保存データが読めなくても見本で動く */ }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cards: state.cards.map(({ count, name, cost, inkable, color }) => ({ count, name, cost, inkable, color })),
      onPlay: state.onPlay, need: state.need, mulligan: state.mulligan, isSample: state.isSample,
      targetIndexes: state.cards.map((c, i) => (state.targets.has(c.id) ? i : -1)).filter((i) => i >= 0),
    }));
  } catch { /* 保存できない環境でも計算は続ける */ }
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (p) => `${(p * 100).toFixed(1)}%`;

// ---------- デッキ表 ----------

function renderRows() {
  $('deck-rows').innerHTML = state.cards.map((c) => `
    <tr data-id="${c.id}">
      <td><input class="num" id="count-${c.id}" data-field="count" type="number" min="0" max="99" inputmode="numeric" value="${c.count}" aria-label="枚数"></td>
      <td><input class="name" id="name-${c.id}" data-field="name" type="text" list="card-names" autocomplete="off" value="${esc(c.name)}" aria-label="カード名"></td>
      <td><input class="num${c.cost === null ? ' missing' : ''}" id="cost-${c.id}" data-field="cost" type="number" min="0" max="20" inputmode="numeric" value="${c.cost ?? ''}" placeholder="?" aria-label="コスト"></td>
      <td><select id="ink-${c.id}" data-field="inkable" class="${c.inkable === null ? 'missing' : ''}" aria-label="インクにできるか">
        <option value=""${c.inkable === null ? ' selected' : ''}>未入力</option>
        <option value="1"${c.inkable === true ? ' selected' : ''}>可</option>
        <option value="0"${c.inkable === false ? ' selected' : ''}>不可</option>
      </select></td>
      <td><select id="color-${c.id}" data-field="color" aria-label="インクの色">
        <option value="">−</option>
        ${INK_COLORS.map((k) => `<option value="${k.id}"${c.color === k.id ? ' selected' : ''}>${k.label}</option>`).join('')}
        ${c.color.includes('-') ? `<option value="${esc(c.color)}" selected>${esc(colorLabel(c.color))}</option>` : ''}
      </select></td>
      <td><button type="button" class="del" data-del="${c.id}" aria-label="${esc(c.name)} を削除">削除</button></td>
    </tr>`).join('');
}

function renderSummary() {
  const s = summarize(state.cards);
  const kinds = state.cards.filter((c) => c.count > 0).length;
  $('deck-summary').innerHTML = `合計 <b>${s.total}</b> 枚（${kinds}種類）`;
  const notes = [];
  if (state.isSample) notes.push('いまは見本のデッキを表示しています。「デッキリストを貼り付けて読み込む」から自分のデッキに置き換えられます。');
  if (s.total > 0 && s.total < MIN_DECK_SIZE) notes.push(`デッキは${MIN_DECK_SIZE}枚以上が必要です。あと${MIN_DECK_SIZE - s.total}枚足りません。確率は現在の${s.total}枚で計算しています。`);
  if (s.overLimit.length) notes.push(`同じカードは${MAX_COPIES}枚までです: ${s.overLimit.map(esc).join('、')}`);
  if (s.colors.length > 2) notes.push(`インクの色が${s.colors.length}色あります。デッキに入れられるのは2色までです。`);
  $('deck-warnings').innerHTML = notes.map((n) => `<p class="notice">${n}</p>`).join('');
}

// ---------- 結果 ----------

const prows = (values, label) => `<div class="prows">${values.map((p, i) => `
  <div class="prow"><span class="prow-label">${label(i + 1)}</span><span class="prow-track"><span class="prow-fill" style="width:${(p * 100).toFixed(2)}%"></span></span><span class="prow-val">${pct(p)}</span></div>`).join('')}</div>`;

function renderDraw(s) {
  const el = $('draw');
  const live = state.cards.filter((c) => c.count > 0 && c.name.trim());
  for (const id of [...state.targets]) if (!live.some((c) => c.id === id)) state.targets.delete(id);
  const copies = live.filter((c) => state.targets.has(c.id)).reduce((a, c) => a + c.count, 0);
  const maxNeed = Math.max(1, Math.min(4, copies));
  if (state.need > maxNeed) state.need = maxNeed;
  let body;
  if (s.total < HAND_SIZE) {
    body = `<p class="empty">デッキが${HAND_SIZE}枚以上になると計算できます。</p>`;
  } else if (!copies) {
    body = `<p class="empty">上のカードを選ぶと、引ける確率を表示します。複数選ぶと「どれか」を引く確率になります。</p>`;
  } else {
    const args = { deckSize: s.total, copies, need: state.need, mulligan: state.mulligan };
    const opening = drawProbability({ ...args, turn: 1, onPlay: true });
    const byTurn = Array.from({ length: TURNS }, (_, i) => drawProbability({ ...args, turn: i + 1, onPlay: state.onPlay }));
    body = `
      <div class="headline">
        <span class="big">${(opening * 100).toFixed(1)}<small>%</small></span>
        <span class="what">${state.mulligan ? '引き直し後の手札' : '初手7枚'}に ${state.need}枚以上ある確率<br><span class="hint">デッキ${s.total}枚中、対象は${copies}枚</span></span>
      </div>
      <h3>${state.onPlay ? '先攻' : '後攻'}で、そのターンまでに引けている確率</h3>
      ${prows(byTurn, (t) => `${t}ターン目`)}
      ${state.mulligan ? '<p class="assume">引き直しは「初手に必要枚数がなければ、対象以外をすべて山札の下に戻して同じ枚数を引く」場合の計算です。</p>' : ''}`;
  }
  el.innerHTML = `
    <h2 id="draw-h">狙ったカードを引ける確率</h2>
    <div class="chips" role="group" aria-label="調べるカード">
      ${live.map((c) => `<button type="button" class="chip" id="chip-${c.id}" data-chip="${c.id}" aria-pressed="${state.targets.has(c.id)}">${esc(c.name)} <small>×${c.count}</small></button>`).join('')}
    </div>
    <div class="options">
      <label for="need">必要な枚数
        <select id="need">${Array.from({ length: maxNeed }, (_, i) => `<option value="${i + 1}"${state.need === i + 1 ? ' selected' : ''}>${i + 1}枚以上</option>`).join('')}</select>
      </label>
      <label for="mulligan"><input type="checkbox" id="mulligan"${state.mulligan ? ' checked' : ''}> 初手を引き直す（マリガン）</label>
    </div>
    ${body}`;
}

function columns(items, { stacked }) {
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

function renderInk(s) {
  const el = $('ink');
  const head = '<h2 id="ink-h">インクの安定度</h2>';
  if (s.total < HAND_SIZE) { el.innerHTML = `${head}<p class="empty">デッキが${HAND_SIZE}枚以上になると計算できます。</p>`; return; }
  if (s.inkUnknown > 0) {
    el.innerHTML = `${head}<p class="empty">インクにできるかどうかが未入力のカードが${s.inkUnknown}枚あります。デッキの表の「インク」列を入力すると計算できます。</p>`;
    return;
  }
  const curve = inkOnCurve({ deckSize: s.total, inkable: s.inkable, turns: TURNS, onPlay: state.onPlay });
  const dist = openingInkableDistribution(s.total, s.inkable);
  const few = dist[0] + dist[1] + dist[2];
  el.innerHTML = `${head}
    <dl class="facts">
      <div class="fact"><dt>インクにできるカード</dt><dd>${s.inkable}枚<small>${pct(s.inkable / s.total)}</small></dd></div>
      <div class="fact"><dt>インクにできないカード</dt><dd>${s.uninkable}枚</dd></div>
      <div class="fact"><dt>初手にインク可能が2枚以下</dt><dd>${pct(few)}</dd></div>
    </dl>
    <h3>${state.onPlay ? '先攻' : '後攻'}で、そのターンまで毎ターン欠かさずインクを置ける確率</h3>
    ${prows(curve, (t) => `${t}ターン目`)}
    <div class="chart" role="img" aria-label="初手7枚に含まれるインク可能カードの枚数ごとの確率">
      <h3>初手7枚に含まれるインク可能カードの枚数</h3>
      ${columns(dist.map((p, x) => ({ total: p, axis: x, label: p >= 0.005 ? `${Math.round(p * 100)}%` : '', tip: `インク可能が${x}枚: ${pct(p)}` })), { stacked: false })}
      <p class="axis-title">枚数</p>
    </div>
    <p class="assume">インク可能なカードを引いたら必ずインクに置く前提です。マリガンと追加ドローは含みません。</p>`;
}

function renderCurve(s) {
  const el = $('curve');
  const head = '<h2 id="curve-h">コスト分布</h2>';
  if (s.total === 0) { el.innerHTML = `${head}<p class="empty">カードを追加すると表示します。</p>`; return; }
  const hasUnknownInk = s.curve.some((b) => b.unknown > 0);
  const items = s.curve.map((b) => {
    const total = b.inkable + b.uninkable + b.unknown;
    const name = b.cost === MAX_COST_BUCKET ? `コスト${b.cost}以上` : `コスト${b.cost}`;
    return {
      total, axis: b.cost === MAX_COST_BUCKET ? `${b.cost}+` : b.cost, label: total || '',
      parts: [{ key: 'unknown', value: b.unknown }, { key: 'uninkable', value: b.uninkable }, { key: 'inkable', value: b.inkable }],
      tip: `${name}: ${total}枚\nインク可能 ${b.inkable}枚 / 不可 ${b.uninkable}枚${b.unknown ? ` / 未入力 ${b.unknown}枚` : ''}`,
    };
  });
  el.innerHTML = `${head}
    <dl class="facts">
      <div class="fact"><dt>平均コスト</dt><dd>${s.averageCost === null ? '−' : s.averageCost.toFixed(2)}</dd></div>
      ${s.colors.map((c) => `<div class="fact"><dt>${c.label}</dt><dd>${c.count}枚</dd></div>`).join('')}
    </dl>
    ${s.costUnknown ? `<p class="notice">コストが未入力のカードが${s.costUnknown}枚あり、グラフと平均には含まれていません。</p>` : ''}
    <div class="chart" role="img" aria-label="コストごとの枚数">
      <div class="legend">
        <span><i style="background:var(--series-inkable)"></i>インク可能</span>
        <span><i style="background:var(--series-uninkable)"></i>インク不可</span>
        ${hasUnknownInk ? '<span><i style="background:var(--series-unknown)"></i>インク未入力</span>' : ''}
      </div>
      ${columns(items, { stacked: true })}
      <p class="axis-title">コスト</p>
    </div>`;
}

function renderResults() {
  const focusId = document.activeElement?.id;
  const s = summarize(state.cards);
  $('order-play').setAttribute('aria-pressed', String(state.onPlay));
  $('order-draw').setAttribute('aria-pressed', String(!state.onPlay));
  renderDraw(s);
  renderInk(s);
  renderCurve(s);
  if (focusId && document.activeElement?.id !== focusId) $(focusId)?.focus();
}

function update({ rows = false } = {}) {
  if (rows) renderRows();
  renderSummary();
  renderResults();
  save();
}

// ---------- 操作 ----------

$('deck-rows').addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const card = state.cards.find((c) => c.id === Number(e.target.closest('tr')?.dataset.id));
  if (!field || !card) return;
  const v = e.target.value;
  if (field === 'count') card.count = Math.max(0, Math.min(99, Math.floor(Number(v)) || 0));
  else if (field === 'name') card.name = v;
  else if (field === 'cost') card.cost = v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v));
  else if (field === 'inkable') card.inkable = v === '' ? null : v === '1';
  else if (field === 'color') card.color = v;
  if (field === 'cost') e.target.classList.toggle('missing', card.cost === null);
  if (field === 'inkable') e.target.classList.toggle('missing', card.inkable === null);
  state.isSample = false;
  update();
});

$('deck-rows').addEventListener('click', (e) => {
  const id = Number(e.target.dataset.del);
  if (!id) return;
  state.cards = state.cards.filter((c) => c.id !== id);
  state.isSample = false;
  update({ rows: true });
});

$('add-btn').addEventListener('click', () => {
  const card = withId({ count: 4, name: '' });
  state.cards.push(card);
  state.isSample = false;
  update({ rows: true });
  $(`name-${card.id}`)?.focus();
});

$('import-btn').addEventListener('click', () => {
  const { entries, skipped } = parseDeckList($('deck-text').value);
  const status = $('import-status');
  if (!entries.length) {
    status.textContent = '読み込めるカードがありません。1行に「枚数 カード名」の形で入力してください。';
    return;
  }
  // 同じ名前のカードは、入力済みのコストやインク情報を引き継ぐ
  const known = new Map(state.isSample ? [] : state.cards.map((c) => [c.name, c]));
  state.cards = entries.map((e) => withId({ ...(known.get(e.name) || {}), ...e }));
  for (const c of state.cards) {
    const info = lookupCard(c.name);
    if (info) c.name = info.name; // 表記を正式名にそろえる
    fillFromData(c);
  }
  state.targets = new Set();
  state.isSample = false;
  const missing = state.cards.filter((c) => c.cost === null || c.inkable === null).length;
  status.textContent = `${entries.length}種類を読み込みました。`
    + (skipped.length ? `読めなかった行: ${skipped.map((x) => `${x.line}行目`).join('、')}。` : '')
    + (missing ? `${missing}種類はカードデータに見つからなかったため、表でコストとインクを入力してください。` : 'コストとインクはカードデータから入力しました。');
  update({ rows: true });
});

$('sample-btn').addEventListener('click', () => {
  state.cards = SAMPLE.map(withId);
  state.targets = new Set([state.cards[0].id]);
  state.isSample = true;
  $('import-status').textContent = '見本のデッキに戻しました。';
  update({ rows: true });
});

$('autofill-btn').addEventListener('click', () => {
  const status = $('autofill-status');
  const todo = state.cards.filter((c) => c.name.trim() && (c.cost === null || c.inkable === null));
  if (!todo.length) { status.textContent = '未入力のカードはありません。'; return; }
  const filled = todo.filter(fillFromData).length;
  const left = todo.length - filled;
  status.textContent = (filled ? `${filled}種類を入力しました。` : '')
    + (left ? `${left}種類はカードデータに見つかりませんでした。英語の正式名（例: Elsa - Spirit of Winter）にするか、表に直接入力してください。` : '');
  if (filled) state.isSample = false;
  update({ rows: true });
});

// カード名を入力し終えたとき、データにあれば未入力の項目を埋める
$('deck-rows').addEventListener('change', (e) => {
  if (e.target.dataset.field !== 'name') return;
  const card = state.cards.find((c) => c.id === Number(e.target.closest('tr')?.dataset.id));
  if (!card) return;
  const info = lookupCard(card.name);
  if (!info) return;
  card.name = info.name;
  fillFromData(card);
  update({ rows: true });
});

$('order-play').addEventListener('click', () => { state.onPlay = true; update(); });
$('order-draw').addEventListener('click', () => { state.onPlay = false; update(); });

$('draw').addEventListener('click', (e) => {
  const id = Number(e.target.closest('[data-chip]')?.dataset.chip);
  if (!id) return;
  state.targets.has(id) ? state.targets.delete(id) : state.targets.add(id);
  update();
});
$('draw').addEventListener('change', (e) => {
  if (e.target.id === 'need') state.need = Number(e.target.value);
  else if (e.target.id === 'mulligan') state.mulligan = e.target.checked;
  else return;
  update();
});

// グラフのツールチップ（マウスとキーボードの両方）
const tip = $('tip');
function showTip(target, x, y) {
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2))}px`;
  tip.style.top = `${Math.max(8, y - r.height - 10)}px`;
}
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t, e.clientX, e.clientY); else tip.hidden = true;
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  const r = t.getBoundingClientRect();
  showTip(t, r.left + r.width / 2, r.top);
});
document.addEventListener('focusout', () => { tip.hidden = true; });

$('card-names').innerHTML = cardNames().map((n) => `<option value="${esc(n)}"></option>`).join('');
$('data-note').textContent = `カードデータ: 英語版 ${CARD_COUNT}種類（${CARD_DATA_DATE}時点）。出典 LorcanaJSON。`;

load();
update({ rows: true });
