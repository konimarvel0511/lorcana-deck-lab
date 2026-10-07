// 「ロアカウンター」タブ: 対戦中のロアとターンを数える。
import { LORE_TO_WIN, newLore, addLore, addTurn, loreWinner } from '../lore.js';
import { state, activeDeck } from '../state.js';
import { prefillMatch } from './matches.js';
import { $, esc } from '../ui.js';

const history = []; // 「元に戻す」用。保存はしない
let confirmingReset = false;
let wakeLock = null;

const panel = (side, label, value) => `
  <div class="lore-panel ${side}${side === 'opp' && state.lore.flip ? ' flipped' : ''}">
    <div class="lore-head"><span class="lore-who">${label}</span><span class="lore-left">${value >= LORE_TO_WIN ? `${LORE_TO_WIN}ロアに到達` : `あと${LORE_TO_WIN - value}`}</span></div>
    <div class="lore-main">
      <button type="button" class="lore-btn" id="lore-${side}-minus" data-side="${side}" data-delta="-1" aria-label="${label}のロアを1減らす"${value <= 0 ? ' disabled' : ''}>−</button>
      <output class="lore-value" id="lore-${side}-value" aria-live="polite" aria-label="${label}のロア">${value}</output>
      <button type="button" class="lore-btn plus" id="lore-${side}-plus" data-side="${side}" data-delta="1" aria-label="${label}のロアを1増やす">＋</button>
    </div>
    <div class="lore-track" aria-hidden="true"><span style="width:${Math.min(100, (value / LORE_TO_WIN) * 100).toFixed(1)}%"></span></div>
    <div class="lore-quick">
      ${[2, 3, 4].map((d) => `<button type="button" class="btn small" id="lore-${side}-plus${d}" data-side="${side}" data-delta="${d}" aria-label="${label}のロアを${d}増やす">+${d}</button>`).join('')}
    </div>
  </div>`;

export function renderLore() {
  const lore = state.lore;
  const winner = loreWinner(lore);
  const banner = winner
    ? `<div class="lore-result" role="status">
        <p>${winner === 'me' ? '自分が20ロアに到達しました。' : winner === 'opp' ? '相手が20ロアに到達しました。' : '両者が同じロアで20に到達しています。'}</p>
        <button type="button" class="btn primary" id="lore-record">この対戦を記録する</button>
      </div>`
    : '';
  $('tab-lore').innerHTML = `<section class="lore">
    <h2>ロアカウンター</h2>
    ${panel('opp', '相手', lore.opp)}
    <div class="lore-turn">
      <button type="button" class="btn small" id="lore-turn-prev" aria-label="ターンを1つ戻す"${lore.turn <= 1 ? ' disabled' : ''}>戻す</button>
      <span class="lore-turn-now" aria-live="polite">${lore.turn}ターン目</span>
      <button type="button" class="btn small primary" id="lore-turn-next">次のターン</button>
    </div>
    ${panel('me', '自分', lore.me)}
    ${banner}
    <div class="row">
      <button type="button" class="btn small" id="lore-undo"${history.length ? '' : ' disabled'}>1つ元に戻す</button>
      <button type="button" class="btn small" id="lore-reset">${confirmingReset ? '本当にリセットする' : '新しい対戦を始める（リセット）'}</button>
      <label for="lore-flip" class="lore-flip"><input type="checkbox" id="lore-flip"${lore.flip ? ' checked' : ''}> 相手側を逆さに表示</label>
    </div>
    <p class="assume">カウントは「${esc(activeDeck().name)}」とは別に、このブラウザに保存されます。画面を閉じても数字は残ります。</p>
  </section>`;
}

/** 対戦中に画面が消えないようにする（対応していない環境では何もしない）。 */
export async function keepScreenOn(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* 許可されなくてもカウンターは使える */ }
}

export function setupLore(update, openMatches) {
  const el = $('tab-lore');
  const change = (next) => {
    history.push(state.lore);
    if (history.length > 100) history.shift();
    state.lore = next;
  };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const wasConfirming = confirmingReset;
    confirmingReset = false;
    if (t.dataset.side) {
      change(addLore(state.lore, t.dataset.side, Number(t.dataset.delta)));
    } else if (t.id === 'lore-turn-next') {
      change(addTurn(state.lore, 1));
    } else if (t.id === 'lore-turn-prev') {
      change(addTurn(state.lore, -1));
    } else if (t.id === 'lore-undo') {
      if (history.length) state.lore = history.pop();
    } else if (t.id === 'lore-reset') {
      if (wasConfirming) change({ ...newLore(), flip: state.lore.flip });
      else confirmingReset = true;
    } else if (t.id === 'lore-record') {
      const { me, opp, turn } = state.lore;
      prefillMatch({ deckId: activeDeck().id, onPlay: state.onPlay, note: `ロア ${me}-${opp}（${turn}ターン）` });
      openMatches();
      return;
    } else return;
    update();
  });
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'lore-flip') return;
    state.lore = { ...state.lore, flip: e.target.checked };
    update();
  });
  // タブを切り替えて戻ったときに、画面を点けたままにする設定をやり直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.tab === 'lore') keepScreenOn(true);
  });
}
