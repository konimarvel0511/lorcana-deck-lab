// 「分析」タブ: デッキ表と、確率・インク・カーブ・コスト分布。
import { HAND_SIZE, MAX_ALL_GROUPS, drawProbability, drawAllProbability, inkOnCurve, openingInkableDistribution } from '../prob.js';
import { INK_COLORS, MIN_DECK_SIZE, MAX_COPIES, MAX_COST_BUCKET, colorLabel, parseDeckList, summarize } from '../deck.js';
import { fillFromData, lookupCard } from '../cards.js';
import { curveOutProbability } from '../curve.js';
import { state, activeDeck, makeCard, sampleCards } from '../state.js';
import { $, esc, pct, prows, columns } from '../ui.js';

const TURNS = 8;
const CURVE_TURNS = 6;

export function renderRows() {
  const deck = activeDeck();
  $('deck-rows').innerHTML = deck.cards.map((c) => `
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

function renderSummary(deck, s) {
  const kinds = deck.cards.filter((c) => c.count > 0).length;
  $('deck-summary').innerHTML = `合計 <b>${s.total}</b> 枚（${kinds}種類）`;
  const notes = [];
  if (deck.isSample) notes.push('いまは見本のデッキを表示しています。「デッキリストを貼り付けて読み込む」から自分のデッキに置き換えられます。');
  if (s.total > 0 && s.total < MIN_DECK_SIZE) notes.push(`デッキは${MIN_DECK_SIZE}枚以上が必要です。あと${MIN_DECK_SIZE - s.total}枚足りません。確率は現在の${s.total}枚で計算しています。`);
  if (s.overLimit.length) notes.push(`同じカードは${MAX_COPIES}枚までです: ${s.overLimit.map(esc).join('、')}`);
  if (s.colors.length > 2) notes.push(`インクの色が${s.colors.length}色あります。デッキに入れられるのは2色までです。`);
  $('deck-warnings').innerHTML = notes.map((n) => `<p class="notice">${n}</p>`).join('');
}

function renderDraw(deck, s) {
  const live = deck.cards.filter((c) => c.count > 0 && c.name.trim());
  for (const id of [...deck.targets]) if (!live.some((c) => c.id === id)) deck.targets.delete(id);
  const picked = live.filter((c) => deck.targets.has(c.id));
  const copies = picked.reduce((a, c) => a + c.count, 0);
  // 「すべて」は2種類以上選んだときだけ意味がある
  const all = deck.match === 'all' && picked.length >= 2;
  const maxNeed = Math.max(1, Math.min(4, copies));
  if (deck.need > maxNeed) deck.need = maxNeed;
  let body;
  if (s.total < HAND_SIZE) {
    body = `<p class="empty">デッキが${HAND_SIZE}枚以上になると計算できます。</p>`;
  } else if (!copies) {
    body = '<p class="empty">上のカードを選ぶと、引ける確率を表示します。複数選ぶと「どれか」か「すべて」かを切り替えられます。</p>';
  } else if (all && picked.length > MAX_ALL_GROUPS) {
    body = `<p class="empty">「すべて」で計算できるのは${MAX_ALL_GROUPS}種類までです。いま${picked.length}種類選んでいるので、${picked.length - MAX_ALL_GROUPS}種類外してください。</p>`;
  } else {
    const at = (turn, onPlay) => (all
      ? drawAllProbability({ deckSize: s.total, groups: picked.map((c) => c.count), turn, onPlay, mulligan: deck.mulligan })
      : drawProbability({ deckSize: s.total, copies, need: deck.need, turn, onPlay, mulligan: deck.mulligan }));
    const opening = at(1, true);
    const byTurn = Array.from({ length: TURNS }, (_, i) => at(i + 1, state.onPlay));
    const where = deck.mulligan ? '引き直し後の手札' : '初手7枚';
    const what = all ? `${where}に 選んだ${picked.length}種類がすべてある確率` : `${where}に ${picked.length >= 2 ? '選んだカードのどれかが ' : ''}${deck.need}枚以上ある確率`;
    const mulliganNote = all
      ? '引き直しは「初手にすべてそろっていなければ、選んだカード以外をすべて山札の下に戻して同じ枚数を引く」場合の計算です。'
      : '引き直しは「初手に必要枚数がなければ、対象以外をすべて山札の下に戻して同じ枚数を引く」場合の計算です。';
    body = `
      <div class="headline">
        <span class="big">${(opening * 100).toFixed(1)}<small>%</small></span>
        <span class="what">${what}<br><span class="hint">デッキ${s.total}枚中、対象は${all ? picked.map((c) => `${c.count}枚`).join(' と ') : `${copies}枚`}</span></span>
      </div>
      <h3>${state.onPlay ? '先攻' : '後攻'}で、そのターンまでに${all ? 'すべて' : ''}引けている確率</h3>
      ${prows(byTurn, (t) => `${t}ターン目`)}
      ${deck.mulligan ? `<p class="assume">${mulliganNote}</p>` : ''}`;
  }
  $('draw').innerHTML = `
    <h2 id="draw-h">狙ったカードを引ける確率</h2>
    <div class="chips" role="group" aria-label="調べるカード">
      ${live.map((c) => `<button type="button" class="chip" id="chip-${c.id}" data-chip="${c.id}" aria-pressed="${deck.targets.has(c.id)}">${esc(c.name)} <small>×${c.count}</small></button>`).join('')}
    </div>
    <div class="options">
      <div class="field-inline"><span id="match-label">複数選んだとき</span>
        <div class="seg-ctl" role="group" aria-labelledby="match-label">
          <button type="button" id="match-any" aria-pressed="${deck.match !== 'all'}">どれかを引く</button><button type="button" id="match-all" aria-pressed="${deck.match === 'all'}">すべてそろう</button>
        </div>
      </div>
      ${all ? '' : `<label for="need">必要な枚数
        <select id="need">${Array.from({ length: maxNeed }, (_, i) => `<option value="${i + 1}"${deck.need === i + 1 ? ' selected' : ''}>${i + 1}枚以上</option>`).join('')}</select>
      </label>`}
      <label for="mulligan"><input type="checkbox" id="mulligan"${deck.mulligan ? ' checked' : ''}> 初手を引き直す（マリガン）</label>
    </div>
    ${deck.match === 'all' && picked.length === 1 ? '<p class="hint">「すべてそろう」は2種類以上選ぶと計算します。いまは1種類の確率を表示しています。</p>' : ''}
    ${body}`;
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

// シミュレーション結果は、デッキの中身が同じ間は使い回す
const curveCache = new Map();
export function curveOut(cards, onPlay, startTurn) {
  const key = `${onPlay ? 'p' : 'd'}${startTurn}|` + cards.filter((c) => c.count > 0).map((c) => `${c.count}:${c.cost}:${c.inkable ? 1 : 0}`).sort().join(',');
  if (!curveCache.has(key)) {
    if (curveCache.size > 40) curveCache.clear();
    curveCache.set(key, curveOutProbability({ cards, turns: CURVE_TURNS, startTurn, onPlay }));
  }
  return curveCache.get(key);
}

function renderCurveOut(deck, s) {
  const el = $('curveout');
  const head = '<h2 id="curveout-h">カーブ通りに動ける確率</h2>';
  const lead = '<p class="hint">毎ターン インクを1枚置き、そのターン数と同じコストのカードを1枚出せる確率です（2ターン目なら2コスト）。</p>';
  if (s.total < HAND_SIZE) { el.innerHTML = `${head}<p class="empty">デッキが${HAND_SIZE}枚以上になると計算できます。</p>`; return; }
  if (s.inkUnknown > 0 || s.costUnknown > 0) {
    el.innerHTML = `${head}${lead}<p class="empty">コストかインクが未入力のカードがあります。デッキの表をすべて入力すると計算できます。</p>`;
    return;
  }
  const values = curveOut(deck.cards, state.onPlay, state.curveStart);
  el.innerHTML = `${head}${lead}
    <div class="options">
      <label for="curve-start">数えはじめ
        <select id="curve-start">
          <option value="1"${state.curveStart === 1 ? ' selected' : ''}>1ターン目から</option>
          <option value="2"${state.curveStart === 2 ? ' selected' : ''}>2ターン目から（1コストなしのデッキ向け）</option>
        </select>
      </label>
    </div>
    <h3>${state.onPlay ? '先攻' : '後攻'}で、そのターンまで途切れずに動ける確率</h3>
    ${prows(values, (t) => `${t}ターン目`)}
    <p class="assume">2万回の試行による概算で、±0.5%ほどの誤差があります。インクに置くカードは「もうカーブ通りには出せないカード」を優先して選びます。マリガン、追加ドロー、シフトなどの効果は含みません。</p>`;
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

export function renderAnalysis({ rows = false } = {}) {
  const deck = activeDeck();
  if (rows) renderRows();
  const s = summarize(deck.cards);
  renderSummary(deck, s);
  renderDraw(deck, s);
  renderInk(s);
  renderCurveOut(deck, s);
  renderCurve(s);
}

export function setupAnalysis(update) {
  const cardOf = (el) => activeDeck().cards.find((c) => c.id === Number(el.closest('tr')?.dataset.id));

  $('deck-rows').addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    const card = cardOf(e.target);
    if (!field || !card) return;
    const v = e.target.value;
    if (field === 'count') card.count = Math.max(0, Math.min(99, Math.floor(Number(v)) || 0));
    else if (field === 'name') card.name = v;
    else if (field === 'cost') card.cost = v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v));
    else if (field === 'inkable') card.inkable = v === '' ? null : v === '1';
    else if (field === 'color') card.color = v;
    if (field === 'cost') e.target.classList.toggle('missing', card.cost === null);
    if (field === 'inkable') e.target.classList.toggle('missing', card.inkable === null);
    activeDeck().isSample = false;
    update();
  });

  // カード名を入力し終えたとき、データにあれば未入力の項目を埋める
  $('deck-rows').addEventListener('change', (e) => {
    if (e.target.dataset.field !== 'name') return;
    const card = cardOf(e.target);
    const info = card && lookupCard(card.name);
    if (!info) return;
    card.name = info.name;
    fillFromData(card);
    update({ rows: true });
  });

  $('deck-rows').addEventListener('click', (e) => {
    const id = Number(e.target.dataset.del);
    if (!id) return;
    const deck = activeDeck();
    deck.cards = deck.cards.filter((c) => c.id !== id);
    deck.isSample = false;
    update({ rows: true });
  });

  $('add-btn').addEventListener('click', () => {
    const deck = activeDeck();
    const card = makeCard({ count: 4, name: '' });
    deck.cards.push(card);
    deck.isSample = false;
    update({ rows: true });
    $(`name-${card.id}`)?.focus();
  });

  $('import-btn').addEventListener('click', () => {
    const deck = activeDeck();
    const { entries, skipped } = parseDeckList($('deck-text').value);
    const status = $('import-status');
    if (!entries.length) {
      status.textContent = '読み込めるカードがありません。1行に「枚数 カード名」の形で入力してください。';
      return;
    }
    // 同じ名前のカードは、入力済みのコストやインク情報を引き継ぐ
    const known = new Map(deck.isSample ? [] : deck.cards.map((c) => [c.name, c]));
    deck.cards = entries.map((e) => makeCard({ ...(known.get(e.name) || {}), ...e }));
    for (const c of deck.cards) {
      const info = lookupCard(c.name);
      if (info) c.name = info.name; // 表記を正式名にそろえる
      fillFromData(c);
    }
    deck.targets = new Set();
    if (deck.isSample && deck.name === '見本のデッキ') deck.name = 'マイデッキ';
    deck.isSample = false;
    const missing = deck.cards.filter((c) => c.cost === null || c.inkable === null).length;
    status.textContent = `${entries.length}種類を読み込みました。`
      + (skipped.length ? `読めなかった行: ${skipped.map((x) => `${x.line}行目`).join('、')}。` : '')
      + (missing ? `${missing}種類はカードデータに見つからなかったため、表でコストとインクを入力してください。` : 'コストとインクはカードデータから入力しました。');
    update({ rows: true });
  });

  $('sample-btn').addEventListener('click', () => {
    const deck = activeDeck();
    deck.cards = sampleCards();
    deck.targets = new Set([deck.cards[0].id]);
    deck.isSample = true;
    $('import-status').textContent = 'このデッキを見本の内容に戻しました。';
    update({ rows: true });
  });

  $('autofill-btn').addEventListener('click', () => {
    const deck = activeDeck();
    const status = $('autofill-status');
    const todo = deck.cards.filter((c) => c.name.trim() && (c.cost === null || c.inkable === null));
    if (!todo.length) { status.textContent = '未入力のカードはありません。'; return; }
    const filled = todo.filter(fillFromData).length;
    const left = todo.length - filled;
    status.textContent = (filled ? `${filled}種類を入力しました。` : '')
      + (left ? `${left}種類はカードデータに見つかりませんでした。英語の正式名（例: Elsa - Spirit of Winter）にするか、表に直接入力してください。` : '');
    if (filled) deck.isSample = false;
    update({ rows: true });
  });

  $('draw').addEventListener('click', (e) => {
    const mode = e.target.closest('#match-any, #match-all');
    if (mode) {
      activeDeck().match = mode.id === 'match-all' ? 'all' : 'any';
      update();
      return;
    }
    const id = Number(e.target.closest('[data-chip]')?.dataset.chip);
    if (!id) return;
    const { targets } = activeDeck();
    targets.has(id) ? targets.delete(id) : targets.add(id);
    update();
  });
  $('draw').addEventListener('change', (e) => {
    const deck = activeDeck();
    if (e.target.id === 'need') deck.need = Number(e.target.value);
    else if (e.target.id === 'mulligan') deck.mulligan = e.target.checked;
    else return;
    update();
  });
  $('curveout').addEventListener('change', (e) => {
    if (e.target.id !== 'curve-start') return;
    state.curveStart = Number(e.target.value) === 2 ? 2 : 1;
    update();
  });
}
