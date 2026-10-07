import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle, expandDeck, dealHand, mulliganHand, drawCard } from '../src/sim.js';
import { curveOutProbability } from '../src/curve.js';
import { summarizeMatches, toCsv, colorKey } from '../src/matches.js';
import { diffDecks } from '../src/deck.js';
import { atLeast } from '../src/prob.js';

const deckOf = (...groups) => groups.map(([count, cost, inkable], i) => ({ name: `C${i}`, count, cost, inkable }));

test('乱数は種が同じなら同じ並びになる', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('初手は7枚、残りは山札', () => {
  const cards = deckOf([30, 1, true], [30, 2, false]);
  assert.equal(expandDeck(cards).length, 60);
  const g = dealHand(cards, mulberry32(5));
  assert.equal(g.hand.length, 7);
  assert.equal(g.library.length, 53);
});

test('マリガン: 戻したカードは引き直しで引かず、枚数は保たれる', () => {
  const cards = Array.from({ length: 60 }, (_, i) => ({ name: `U${i}`, count: 1, cost: 1, inkable: true }));
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed);
    const g = dealHand(cards, rng);
    const back = [0, 2, 5];
    const returned = back.map((i) => g.hand[i].name);
    const kept = g.hand.filter((_, i) => !back.includes(i)).map((c) => c.name);
    const top3 = g.library.slice(0, 3).map((c) => c.name);
    const m = mulliganHand(g, back, rng);
    assert.equal(m.hand.length, 7);
    assert.equal(m.library.length, 53);
    assert.deepEqual(m.hand.map((c) => c.name), [...kept, ...top3]);
    for (const name of returned) assert.ok(m.library.some((c) => c.name === name));
    assert.equal(new Set([...m.hand, ...m.library].map((c) => c.name)).size, 60);
  }
});

test('ドローは山札の上から1枚', () => {
  const g = dealHand(deckOf([60, 1, true]), mulberry32(2));
  const d = drawCard(g);
  assert.equal(d.hand.length, 8);
  assert.equal(d.library.length, 52);
  assert.deepEqual(drawCard({ hand: [], library: [] }), { hand: [], library: [] });
});

test('カーブ: 1コストがなければ1ターン目から失敗、2ターン目開始なら計算できる', () => {
  const cards = deckOf([20, 2, true], [20, 3, true], [20, 4, true]);
  const from1 = curveOutProbability({ cards, turns: 4, startTurn: 1, trials: 2000 });
  assert.deepEqual(from1, [0, 0, 0, 0]);
  const from2 = curveOutProbability({ cards, turns: 4, startTurn: 2, trials: 2000 });
  assert.equal(from2[0], null);
  assert.ok(from2[1] > 0.8);
  assert.ok(from2[3] > 0.3);
});

test('カーブ: ターンが進むほど下がり、後攻のほうが高く、結果は再現する', () => {
  const cards = deckOf([10, 1, true], [10, 2, true], [10, 3, true], [10, 4, true], [10, 5, true], [10, 6, true]);
  const play = curveOutProbability({ cards, turns: 6, onPlay: true });
  const draw = curveOutProbability({ cards, turns: 6, onPlay: false });
  for (let i = 1; i < 6; i++) assert.ok(play[i] <= play[i - 1]);
  for (let i = 0; i < 6; i++) assert.ok(draw[i] > play[i]);
  assert.deepEqual(play, curveOutProbability({ cards, turns: 6, onPlay: true }));
});

test('カーブ: 1ターン目は「1コストとインク用の別のカード」が初手にある確率と一致する', () => {
  // 1コスト10枚（インク不可）と、インク可能な重いカード50枚
  const cards = deckOf([10, 1, false], [50, 9, true]);
  const [t1] = curveOutProbability({ cards, turns: 1, onPlay: true, trials: 100000 });
  // 初手7枚がすべて1コスト（インクなし）になる場合だけ除く
  const exact = atLeast(60, 10, 7, 1) - (() => { let p = 1; for (let i = 0; i < 7; i++) p *= (10 - i) / (60 - i); return p; })();
  assert.ok(Math.abs(t1 - exact) < 0.006, `${t1} vs ${exact}`);
});

test('カーブ: インクにできるカードがなければ0', () => {
  assert.deepEqual(curveOutProbability({ cards: deckOf([30, 1, false], [30, 2, false]), turns: 2, trials: 500 }), [0, 0]);
});

test('対戦記録の集計', () => {
  const matches = [
    { deckId: 'a', deckName: 'A', opp: ['steel', 'amber'], onPlay: true, result: 'win' },
    { deckId: 'a', deckName: 'A', opp: ['amber', 'steel'], onPlay: false, result: 'loss' },
    { deckId: 'a', deckName: 'A', opp: ['ruby'], onPlay: true, result: 'win' },
    { deckId: 'b', deckName: 'B', opp: [], onPlay: true, result: 'draw' },
  ];
  const s = summarizeMatches(matches);
  assert.deepEqual({ ...s.overall }, { games: 4, win: 2, loss: 1, draw: 1, rate: 2 / 3 });
  assert.deepEqual(s.byDeck.map((g) => [g.label, g.games, g.rate]), [['A', 3, 2 / 3], ['B', 1, null]]);
  assert.deepEqual(s.byOrder.map((g) => [g.label, g.win, g.loss]), [['先攻', 2, 0], ['後攻', 0, 1]]);
  assert.equal(s.byOpponent[0].label, 'アンバー／スティール');
  assert.equal(s.byOpponent[0].games, 2);
  assert.equal(colorKey(['steel', 'amber', 'amber', 'x']), 'amber-steel');
  assert.equal(summarizeMatches([]).overall.rate, null);
});

test('CSV', () => {
  const csv = toCsv([{ date: '2026-10-07', deckName: 'A, "改"', opp: ['ruby'], onPlay: false, result: 'win', note: 'メモ' }]);
  assert.equal(csv, '日付,自分のデッキ,相手の色,先攻/後攻,結果,メモ\n2026-10-07,"A, ""改""",ルビー,後攻,勝ち,メモ');
});

test('デッキの差分', () => {
  const a = [{ name: 'X', count: 4 }, { name: 'Y', count: 2 }, { name: 'Z', count: 4 }];
  const b = [{ name: 'X', count: 4 }, { name: 'Y', count: 4 }, { name: 'W', count: 2 }];
  assert.deepEqual(diffDecks(a, b), [{ name: 'W', a: 0, b: 2 }, { name: 'Y', a: 2, b: 4 }, { name: 'Z', a: 4, b: 0 }]);
});

// ---------- ロアカウンター ----------
import { newLore, normalizeLore, addLore, addTurn, loreWinner } from '../src/lore.js';

test('ロア: 増減は0〜99に収まり、元の値は変えない', () => {
  const a = newLore();
  const b = addLore(a, 'me', 3);
  assert.deepEqual(a, { me: 0, opp: 0, turn: 1, flip: false });
  assert.equal(b.me, 3);
  assert.equal(addLore(a, 'opp', -1).opp, 0);
  assert.equal(addLore({ ...a, me: 98 }, 'me', 4).me, 99);
  assert.equal(addLore(a, 'x', 1), a);
  assert.equal(addTurn(a, -1).turn, 1);
  assert.equal(addTurn(a, 1).turn, 2);
});

test('ロア: 20で到達、同時到達は多いほう', () => {
  assert.equal(loreWinner({ me: 19, opp: 19 }), null);
  assert.equal(loreWinner({ me: 20, opp: 3 }), 'me');
  assert.equal(loreWinner({ me: 3, opp: 21 }), 'opp');
  assert.equal(loreWinner({ me: 22, opp: 20 }), 'me');
  assert.equal(loreWinner({ me: 20, opp: 20 }), 'both');
});

test('ロア: 壊れた保存データは初期値に直す', () => {
  assert.deepEqual(normalizeLore(undefined), newLore());
  assert.deepEqual(normalizeLore({ me: -5, opp: 'x', turn: 0, flip: 1 }), { me: 0, opp: 0, turn: 1, flip: true });
  assert.deepEqual(normalizeLore({ me: 12, opp: 7, turn: 5, flip: false }), { me: 12, opp: 7, turn: 5, flip: false });
});
