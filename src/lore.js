// ロアカウンターの計算部分。
export const LORE_TO_WIN = 20;
export const LORE_MAX = 99;

export const newLore = () => ({ me: 0, opp: 0, turn: 1, flip: false });

/** 保存データなどから、正しい形のカウンターを作る。 */
export function normalizeLore(v) {
  const n = (x, lo, hi, d) => (Number.isInteger(x) ? Math.max(lo, Math.min(hi, x)) : d);
  return { me: n(v?.me, 0, LORE_MAX, 0), opp: n(v?.opp, 0, LORE_MAX, 0), turn: n(v?.turn, 1, 99, 1), flip: !!v?.flip };
}

/** ロアを増減する（0〜99の範囲に収める）。 */
export function addLore(lore, side, delta) {
  if (side !== 'me' && side !== 'opp') return lore;
  return { ...lore, [side]: Math.max(0, Math.min(LORE_MAX, lore[side] + delta)) };
}

export function addTurn(lore, delta) {
  return { ...lore, turn: Math.max(1, Math.min(99, lore.turn + delta)) };
}

/** 20ロアに届いた側。どちらも届いていなければ null、両方届いていれば多いほう。 */
export function loreWinner(lore) {
  const me = lore.me >= LORE_TO_WIN, opp = lore.opp >= LORE_TO_WIN;
  if (!me && !opp) return null;
  if (me && opp) return lore.me === lore.opp ? 'both' : lore.me > lore.opp ? 'me' : 'opp';
  return me ? 'me' : 'opp';
}
