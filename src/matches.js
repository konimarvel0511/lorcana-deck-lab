// 対戦記録の集計。
import { colorLabel, INK_COLORS } from './deck.js';

export const RESULTS = [
  { id: 'win', label: '勝ち' },
  { id: 'loss', label: '負け' },
  { id: 'draw', label: '引き分け' },
];

const order = new Map(INK_COLORS.map((k, i) => [k.id, i]));
/** 相手の色を、順番に関係なく同じ値にそろえる（例: steel+amber → amber-steel）。 */
export const colorKey = (colors) => [...new Set(colors || [])].filter((c) => order.has(c)).sort((a, b) => order.get(a) - order.get(b)).join('-');

function tally(list) {
  const t = { games: list.length, win: 0, loss: 0, draw: 0, rate: null };
  for (const m of list) if (m.result in t) t[m.result]++;
  // 勝率は引き分けを除いて計算する
  if (t.win + t.loss > 0) t.rate = t.win / (t.win + t.loss);
  return t;
}

function groupBy(matches, keyOf, labelOf) {
  const groups = new Map();
  for (const m of matches) {
    const key = keyOf(m);
    if (!groups.has(key)) groups.set(key, { key, label: labelOf(m, key), list: [] });
    groups.get(key).list.push(m);
  }
  return [...groups.values()].map((g) => ({ key: g.key, label: g.label, ...tally(g.list) })).sort((a, b) => b.games - a.games || a.label.localeCompare(b.label, 'ja'));
}

export function summarizeMatches(matches) {
  return {
    overall: tally(matches),
    byDeck: groupBy(matches, (m) => m.deckId || m.deckName, (m) => m.deckName || '（デッキ名なし）'),
    byOrder: groupBy(matches, (m) => (m.onPlay ? 'play' : 'draw'), (m) => (m.onPlay ? '先攻' : '後攻')),
    byOpponent: groupBy(matches, (m) => colorKey(m.opp), (m, key) => (key ? colorLabel(key) : '（色の記録なし）')),
  };
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function toCsv(matches) {
  const rows = [['日付', '自分のデッキ', '相手の色', '先攻/後攻', '結果', 'メモ']];
  for (const m of matches) {
    rows.push([m.date || '', m.deckName || '', colorLabel(colorKey(m.opp)), m.onPlay ? '先攻' : '後攻', RESULTS.find((r) => r.id === m.result)?.label || '', m.note || '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
