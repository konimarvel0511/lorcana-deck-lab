import { CARD_COUNT, CARD_DATA_DATE, cardNames } from './cards.js';
import { state, TABS, activeDeck, load, save, makeDeck, addDeck, duplicateDeck, removeDeck } from './state.js';
import { $, esc, setupTooltips } from './ui.js';
import { renderAnalysis, setupAnalysis } from './views/analysis.js';
import { renderSimulator, setupSimulator, resetSimulator } from './views/simulator.js';
import { renderCompare } from './views/compare.js';
import { renderMatches, setupMatches } from './views/matches.js';
import { renderLore, setupLore, keepScreenOn } from './views/lore.js';

let confirmingDelete = false;

function renderChrome() {
  const deck = activeDeck();
  $('deck-select').innerHTML = state.decks.map((d) => `<option value="${d.id}"${d.id === deck.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  if (document.activeElement !== $('deck-name')) $('deck-name').value = deck.name;
  $('deck-del').textContent = confirmingDelete ? '本当に削除する' : '削除';
  $('order-play').setAttribute('aria-pressed', String(state.onPlay));
  $('order-draw').setAttribute('aria-pressed', String(!state.onPlay));
  for (const tab of TABS) {
    $(`tabbtn-${tab}`).setAttribute('aria-selected', String(state.tab === tab));
    $(`tab-${tab}`).hidden = state.tab !== tab;
  }
}

/** 画面を描き直して保存する。rows: デッキ表も作り直す。 */
function update({ rows = false } = {}) {
  const focusId = document.activeElement?.id;
  renderChrome();
  if (state.tab === 'analysis') renderAnalysis({ rows });
  else if (state.tab === 'sim') renderSimulator();
  else if (state.tab === 'compare') renderCompare();
  else if (state.tab === 'matches') renderMatches();
  else renderLore();
  keepScreenOn(state.tab === 'lore');
  if (focusId && document.activeElement?.id !== focusId) $(focusId)?.focus();
  save();
}

/** デッキの中身やデッキそのものが変わったとき。 */
function deckChanged(opts) {
  resetSimulator();
  update(opts);
}

// ---------- デッキの切り替え・追加・削除 ----------

$('deck-select').addEventListener('change', (e) => {
  state.activeId = e.target.value;
  confirmingDelete = false;
  deckChanged({ rows: true });
});
$('deck-name').addEventListener('input', (e) => {
  const deck = activeDeck();
  deck.name = e.target.value.trim() || '名前のないデッキ';
  const option = [...$('deck-select').options].find((o) => o.value === deck.id);
  if (option) option.textContent = deck.name;
  save();
});
$('deck-name').addEventListener('change', () => update());
$('deck-new').addEventListener('click', () => {
  addDeck(makeDeck({ name: `デッキ ${state.decks.length + 1}` }));
  confirmingDelete = false;
  state.tab = 'analysis';
  deckChanged({ rows: true });
  $('paste').open = true;
  $('deck-text').focus();
});
$('deck-dup').addEventListener('click', () => {
  const original = activeDeck();
  duplicateDeck(original);
  state.compareId = original.id; // 複製したら、まず元のデッキと比べる
  confirmingDelete = false;
  deckChanged({ rows: true });
});
$('deck-del').addEventListener('click', () => {
  if (!confirmingDelete) { confirmingDelete = true; update(); return; }
  removeDeck(activeDeck().id);
  confirmingDelete = false;
  deckChanged({ rows: true });
});
$('deck-del').addEventListener('blur', () => {
  if (!confirmingDelete) return;
  confirmingDelete = false;
  $('deck-del').textContent = '削除';
});

$('order-play').addEventListener('click', () => { state.onPlay = true; deckChanged(); });
$('order-draw').addEventListener('click', () => { state.onPlay = false; deckChanged(); });

for (const tab of TABS) {
  $(`tabbtn-${tab}`).addEventListener('click', () => {
    state.tab = tab;
    update({ rows: true });
    // カウンターは対戦中に片手で使うので、すぐ押せる位置まで画面を送る
    if (tab === 'lore') $('tab-lore').scrollIntoView({ block: 'start' });
  });
}

$('tab-compare').addEventListener('change', (e) => {
  if (e.target.id !== 'compare-select') return;
  state.compareId = e.target.value;
  update();
});
$('tab-compare').addEventListener('click', (e) => {
  if (e.target.id !== 'compare-dup') return;
  const original = activeDeck();
  const copy = duplicateDeck(original);
  // 元のデッキを左、複製を比較相手にする
  state.activeId = original.id;
  state.compareId = copy.id;
  update();
});

setupAnalysis(deckChanged);
setupSimulator(update);
setupMatches(update);
setupLore(update, () => { state.tab = 'matches'; update(); });
setupTooltips();

$('card-names').innerHTML = cardNames().map((n) => `<option value="${esc(n)}"></option>`).join('');
$('data-note').textContent = `カードデータ: 英語版 ${CARD_COUNT}種類（${CARD_DATA_DATE}時点）。出典 LorcanaJSON。`;

load();
update({ rows: true });
