// アプリの状態と、ブラウザへの保存。
const STORAGE_KEY = 'lorcana-deck-lab:v2';
const OLD_KEY = 'lorcana-deck-lab:v1';

import { newLore, normalizeLore } from './lore.js';

export const TABS = ['analysis', 'sim', 'compare', 'matches', 'lore'];

// 最初に表示する見本。実在のカードではなく、形だけのダミー。
const SAMPLE = [[1, true], [1, true], [2, true], [2, true], [2, false], [3, true], [3, true], [3, true], [4, true], [4, true], [4, false], [5, true], [5, false], [6, true], [7, false]]
  .map(([cost, inkable], i) => ({ count: 4, name: `サンプルカード ${String(i + 1).padStart(2, '0')}`, cost, inkable, color: '' }));

let nextCardId = 1;
export const makeCard = (c = {}) => ({
  id: nextCardId++,
  count: Number.isInteger(c.count) ? c.count : 1,
  name: c.name ?? '',
  cost: Number.isFinite(c.cost) ? c.cost : null,
  inkable: typeof c.inkable === 'boolean' ? c.inkable : null,
  color: c.color || '',
});

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function makeDeck({ id, name, cards = [], targetIndexes = [], need = 1, match = 'any', mulligan = false, isSample = false } = {}) {
  const list = cards.map(makeCard);
  return {
    id: id || newId('d'),
    name: name || '新しいデッキ',
    cards: list,
    targets: new Set(targetIndexes.map((i) => list[i]?.id).filter(Boolean)),
    need: Number.isInteger(need) ? need : 1,
    match: match === 'all' ? 'all' : 'any', // 複数選んだとき: any = どれか、all = すべて
    mulligan: !!mulligan,
    isSample: !!isSample,
  };
}

export const sampleDeck = () => makeDeck({ name: '見本のデッキ', cards: SAMPLE, targetIndexes: [0], isSample: true });
export const sampleCards = () => SAMPLE.map(makeCard);

export const state = {
  decks: [sampleDeck()],
  activeId: null,
  compareId: null,
  onPlay: true,
  tab: 'analysis',
  curveStart: 1,
  matches: [],
  lore: newLore(),
};
state.activeId = state.decks[0].id;

export const activeDeck = () => state.decks.find((d) => d.id === state.activeId) || state.decks[0];

const packDeck = (d) => ({
  id: d.id, name: d.name, need: d.need, match: d.match, mulligan: d.mulligan, isSample: d.isSample,
  cards: d.cards.map(({ count, name, cost, inkable, color }) => ({ count, name, cost, inkable, color })),
  targetIndexes: d.cards.map((c, i) => (d.targets.has(c.id) ? i : -1)).filter((i) => i >= 0),
});

export function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.decks) && saved.decks.length) {
      state.decks = saved.decks.map(makeDeck);
      state.activeId = state.decks.some((d) => d.id === saved.activeId) ? saved.activeId : state.decks[0].id;
      state.compareId = saved.compareId || null;
      state.onPlay = saved.onPlay !== false;
      state.tab = TABS.includes(saved.tab) ? saved.tab : 'analysis';
      state.curveStart = saved.curveStart === 2 ? 2 : 1;
      state.matches = Array.isArray(saved.matches) ? saved.matches : [];
      state.lore = normalizeLore(saved.lore);
      return;
    }
    // 1つのデッキだけを保存していた旧形式から引き継ぐ
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (old && Array.isArray(old.cards) && old.cards.length) {
      state.decks = [makeDeck({ ...old, name: old.isSample ? '見本のデッキ' : 'マイデッキ' })];
      state.activeId = state.decks[0].id;
      state.onPlay = old.onPlay !== false;
    }
  } catch { /* 保存データが読めなくても見本で動く */ }
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      decks: state.decks.map(packDeck),
      activeId: state.activeId, compareId: state.compareId, onPlay: state.onPlay,
      tab: state.tab, curveStart: state.curveStart, matches: state.matches, lore: state.lore,
    }));
  } catch { /* 保存できない環境でも計算は続ける */ }
}

export function addDeck(deck) {
  state.decks.push(deck);
  state.activeId = deck.id;
  return deck;
}

export function duplicateDeck(source) {
  const packed = packDeck(source);
  return addDeck(makeDeck({ ...packed, id: undefined, name: `${source.name} のコピー`, isSample: false }));
}

export function removeDeck(id) {
  state.decks = state.decks.filter((d) => d.id !== id);
  if (!state.decks.length) state.decks = [sampleDeck()];
  if (!state.decks.some((d) => d.id === state.activeId)) state.activeId = state.decks[0].id;
  if (state.compareId === id) state.compareId = null;
}

export const newMatchId = () => newId('m');
