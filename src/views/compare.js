// 「デッキ比較」タブ: 2つのデッキの数字と、入れ替えたカードを並べる。
import { HAND_SIZE, inkOnCurve, openingInkableDistribution } from '../prob.js';
import { summarize, diffDecks } from '../deck.js';
import { state, activeDeck } from '../state.js';
import { curveOut } from './analysis.js';
import { $, esc, pct } from '../ui.js';

const COST_GROUPS = [['コスト1以下', 0, 1], ['コスト2', 2, 2], ['コスト3', 3, 3], ['コスト4', 4, 4], ['コスト5', 5, 5], ['コスト6', 6, 6], ['コスト7以上', 7, 99]];

function metrics(deck) {
  const s = summarize(deck.cards);
  const inkReady = s.total >= HAND_SIZE && s.inkUnknown === 0;
  const allReady = inkReady && s.costUnknown === 0;
  const ink = inkReady ? inkOnCurve({ deckSize: s.total, inkable: s.inkable, turns: 6, onPlay: state.onPlay }) : null;
  const dist = inkReady ? openingInkableDistribution(s.total, s.inkable) : null;
  const curve = allReady ? curveOut(deck.cards, state.onPlay, state.curveStart) : null;
  const rows = [
    ['合計枚数', 'count', s.total],
    ['インクにできるカード', 'count', s.inkUnknown ? null : s.inkable],
    ['インクにできる割合', 'pct', s.inkUnknown || !s.total ? null : s.inkable / s.total],
    ['平均コスト', 'num', s.costUnknown ? null : s.averageCost],
    ['初手にインク可能が2枚以下', 'pct', dist ? dist[0] + dist[1] + dist[2] : null],
    ['4ターン目までインクが続く', 'pct', ink ? ink[3] : null],
    ['6ターン目までインクが続く', 'pct', ink ? ink[5] : null],
    ['4ターン目までカーブ通り', 'pct', curve ? curve[3] : null],
    ...COST_GROUPS.map(([label, lo, hi]) => [label, 'count', s.costUnknown ? null : s.curve.filter((b) => b.cost >= lo && b.cost <= hi).reduce((a, b) => a + b.inkable + b.uninkable + b.unknown, 0)]),
  ];
  return { rows, incomplete: s.inkUnknown > 0 || s.costUnknown > 0 };
}

const show = (type, v) => (v === null || v === undefined ? '−' : type === 'pct' ? pct(v) : type === 'num' ? v.toFixed(2) : `${v}枚`);
function delta(type, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return '−';
  const d = b - a;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  const abs = Math.abs(d);
  return type === 'pct' ? `${sign}${(abs * 100).toFixed(1)}pt` : type === 'num' ? `${sign}${abs.toFixed(2)}` : `${sign}${abs}枚`;
}

export function renderCompare() {
  const el = $('tab-compare');
  const a = activeDeck();
  const others = state.decks.filter((d) => d.id !== a.id);
  if (!others.length) {
    el.innerHTML = `<section><h2>デッキ比較</h2>
      <p class="empty">比較にはデッキが2つ必要です。いまのデッキを複製して、カードを入れ替えた形を作ると、調整の前後を比べられます。</p>
      <div class="row"><button type="button" class="btn primary" id="compare-dup">「${esc(a.name)}」を複製する</button></div></section>`;
    return;
  }
  const b = others.find((d) => d.id === state.compareId) || others[0];
  const ma = metrics(a), mb = metrics(b);
  const diff = diffDecks(a.cards, b.cards);
  el.innerHTML = `<section>
    <h2>デッキ比較</h2>
    <div class="options">
      <span>「${esc(a.name)}」と</span>
      <label for="compare-select">比べる相手
        <select id="compare-select">${others.map((d) => `<option value="${d.id}"${d.id === b.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      </label>
    </div>
    ${ma.incomplete || mb.incomplete ? '<p class="notice">コストかインクが未入力のカードがあるデッキは、一部の項目を「−」で表示しています。</p>' : ''}
    <div class="table-wrap"><table class="data">
      <thead><tr><th scope="col">項目（${state.onPlay ? '先攻' : '後攻'}）</th><th scope="col" class="r">${esc(a.name)}</th><th scope="col" class="r">${esc(b.name)}</th><th scope="col" class="r">差</th></tr></thead>
      <tbody>${ma.rows.map(([label, type, va], i) => `<tr><th scope="row">${label}</th><td class="r">${show(type, va)}</td><td class="r">${show(type, mb.rows[i][2])}</td><td class="r dim">${delta(type, va, mb.rows[i][2])}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="assume">差は右のデッキから左のデッキを引いた値です。カーブ通りの確率は「分析」タブの数えはじめの設定に従います。</p>
  </section>
  <section>
    <h2>入れ替えたカード</h2>
    ${diff.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th scope="col">カード名</th><th scope="col" class="r">${esc(a.name)}</th><th scope="col" class="r">${esc(b.name)}</th></tr></thead>
      <tbody>${diff.map((d) => `<tr><th scope="row">${esc(d.name)}</th><td class="r">${d.a}枚</td><td class="r">${d.b}枚</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">2つのデッキのカードと枚数は同じです。</p>'}
  </section>`;
}
