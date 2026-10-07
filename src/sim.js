// 手札のシミュレーション（初手・マリガン・ドロー）。乱数を差し替えられるようにしてテスト可能にする。
import { HAND_SIZE } from './prob.js';

/** 種を指定できる乱数。同じ種なら同じ結果になる。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** デッキ表（枚数つき）を、1枚ずつのカードの並びに展開する。 */
export function expandDeck(cards) {
  const out = [];
  for (const c of cards) for (let i = 0; i < (c.count || 0); i++) out.push(c);
  return out;
}

/** 山札を切って7枚引く。 */
export function dealHand(cards, rng = Math.random) {
  const library = shuffle(expandDeck(cards), rng);
  return { hand: library.splice(0, HAND_SIZE), library };
}

/**
 * マリガン。選んだ手札を山札の下に置き、同じ枚数を引いてから山札を切る。
 * 戻したカードは、引き直しでは引かない。
 */
export function mulliganHand(game, indexes, rng = Math.random) {
  const back = new Set(indexes);
  const kept = game.hand.filter((_, i) => !back.has(i));
  const returned = game.hand.filter((_, i) => back.has(i));
  const library = [...game.library];
  const drawn = library.splice(0, returned.length);
  return { hand: [...kept, ...drawn], library: shuffle([...library, ...returned], rng) };
}

/** 1枚引く。山札がなければ何も変えない。 */
export function drawCard(game) {
  if (!game.library.length) return game;
  const [top, ...library] = game.library;
  return { hand: [...game.hand, top], library };
}
