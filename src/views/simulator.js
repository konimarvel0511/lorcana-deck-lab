// 「初手シミュレーター」タブ: 実際に7枚引いて、マリガンとドローを試す。
import { HAND_SIZE } from '../prob.js';
import { dealHand, mulliganHand, drawCard, expandDeck } from '../sim.js';
import { state, activeDeck } from '../state.js';
import { $, esc } from '../ui.js';

// 手札の状態は保存しない（開くたびに新しく引く）
let sim = null; // { deckId, game, phase: 'mulligan' | 'play', selected:Set, fresh:Set, turn, log }

function deal() {
  const deck = activeDeck();
  sim = { deckId: deck.id, game: dealHand(deck.cards), phase: 'mulligan', selected: new Set(), fresh: new Set(), turn: 0, log: '7枚引きました。戻したいカードがあれば選んでください。' };
}

function keep(mulliganed) {
  sim.phase = 'play';
  sim.turn = 1;
  sim.selected = new Set();
  const first = mulliganed ? `${mulliganed}枚を引き直しました。` : 'この手札でキープしました。';
  if (state.onPlay) {
    sim.log = `${first}1ターン目（先攻なのでドローなし）。`;
  } else {
    sim.game = drawCard(sim.game);
    sim.fresh = new Set([sim.game.hand.length - 1]);
    sim.log = `${first}1ターン目: 後攻なので1枚引きました。`;
  }
}

const tile = (card, i) => {
  const picked = sim.selected.has(i);
  const fresh = sim.fresh.has(i);
  const inner = `
    <span class="tile-cost${card.inkable ? ' inkable' : ''}" aria-hidden="true">${Number.isFinite(card.cost) ? card.cost : '?'}</span>
    <span class="tile-name">${esc(card.name || '（名前なし）')}</span>
    <span class="tile-meta">${card.inkable === true ? 'インク可' : card.inkable === false ? 'インク不可' : 'インク未入力'}${fresh ? '・いま引いた' : ''}${picked ? '・戻す' : ''}</span>`;
  return sim.phase === 'mulligan'
    ? `<button type="button" class="tile${picked ? ' picked' : ''}" id="tile-${i}" data-tile="${i}" aria-pressed="${picked}">${inner}</button>`
    : `<div class="tile${fresh ? ' fresh' : ''}">${inner}</div>`;
};

export function renderSimulator() {
  const el = $('tab-sim');
  const deck = activeDeck();
  const total = expandDeck(deck.cards).length;
  if (total < HAND_SIZE) {
    sim = null;
    el.innerHTML = `<section><h2>初手シミュレーター</h2><p class="empty">デッキが${HAND_SIZE}枚以上になると使えます。「分析」タブでカードを追加してください。</p></section>`;
    return;
  }
  // デッキを切り替えたら引き直す。開いた時点で手札が見えるようにしておく
  if (!sim || sim.deckId !== deck.id) deal();
  const { hand, library } = sim.game;
  const inkable = hand.filter((c) => c.inkable === true).length;
  const n = sim.selected.size;
  const controls = sim.phase === 'mulligan'
    ? `<button type="button" class="btn primary" id="sim-mulligan"${n ? '' : ' disabled'}>${n ? `選んだ${n}枚を引き直す` : '戻すカードを選ぶ'}</button>
       <button type="button" class="btn" id="sim-keep">このままキープ</button>
       <button type="button" class="btn" id="sim-deal">最初から引き直す</button>`
    : `<button type="button" class="btn primary" id="sim-next"${library.length ? '' : ' disabled'}>次のターンへ（1枚引く）</button>
       <button type="button" class="btn" id="sim-deal">新しい初手を引く</button>`;
  el.innerHTML = `<section>
    <h2>初手シミュレーター</h2>
    <p class="hint">「${esc(deck.name)}」を${state.onPlay ? '先攻' : '後攻'}で引きます。${sim.phase === 'mulligan' ? 'カードを押すと「戻す」に切り替わります。' : ''}</p>
    <p class="sim-log" role="status">${esc(sim.log)}</p>
    <div class="tiles">${hand.map(tile).join('')}</div>
    <dl class="facts">
      <div class="fact"><dt>手札</dt><dd>${hand.length}枚</dd></div>
      <div class="fact"><dt>インクにできるカード</dt><dd>${inkable}枚</dd></div>
      <div class="fact"><dt>山札</dt><dd>${library.length}枚</dd></div>
      ${sim.phase === 'play' ? `<div class="fact"><dt>ターン</dt><dd>${sim.turn}ターン目</dd></div>` : ''}
    </dl>
    <div class="row">${controls}</div>
    <p class="assume">引き直しでは、選んだカードを山札の下に置いて同じ枚数を引き、そのあと山札を切ります。インクに置く・カードを出すといった操作は再現しません。</p>
  </section>`;
}

/** デッキの中身が変わったら、古い手札を捨てる。 */
export function resetSimulator() { sim = null; }

export function setupSimulator(render) {
  $('tab-sim').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !sim) return;
    if (t.dataset.tile !== undefined && sim.phase === 'mulligan') {
      const i = Number(t.dataset.tile);
      sim.selected.has(i) ? sim.selected.delete(i) : sim.selected.add(i);
    } else if (t.id === 'sim-deal') {
      deal();
    } else if (t.id === 'sim-keep') {
      sim.fresh = new Set();
      keep(0);
    } else if (t.id === 'sim-mulligan' && sim.selected.size) {
      const count = sim.selected.size;
      sim.game = mulliganHand(sim.game, [...sim.selected]);
      const fresh = Array.from({ length: count }, (_, k) => HAND_SIZE - count + k);
      sim.fresh = new Set();
      keep(count);
      for (const i of fresh) sim.fresh.add(i);
    } else if (t.id === 'sim-next') {
      sim.game = drawCard(sim.game);
      sim.turn++;
      sim.fresh = new Set([sim.game.hand.length - 1]);
      sim.log = `${sim.turn}ターン目: 1枚引きました。`;
    } else return;
    render();
  });
}
