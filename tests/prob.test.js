import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, hyperPmf, atLeast, drawProbability, inkOnCurve, openingInkableDistribution } from '../src/prob.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('choose', () => {
  assert.equal(choose(5, 2), 10);
  assert.equal(choose(60, 7), 386206920);
  assert.equal(choose(3, 5), 0);
});

test('hyperPmf は合計1になる', () => {
  let s = 0;
  for (let x = 0; x <= 7; x++) s += hyperPmf(60, 4, 7, x);
  close(s, 1);
});

test('4枚積みを初手7枚で引く確率は約39.9%', () => {
  const p = atLeast(60, 4, 7, 1);
  close(p, 1 - choose(56, 7) / choose(60, 7));
  assert.ok(Math.abs(p - 0.3995) < 0.0005);
});

test('先攻1ターン目はドローなし、後攻は1枚多い', () => {
  close(drawProbability({ deckSize: 60, copies: 4, turn: 1, onPlay: true }), atLeast(60, 4, 7, 1));
  close(drawProbability({ deckSize: 60, copies: 4, turn: 1, onPlay: false }), atLeast(60, 4, 8, 1));
  close(drawProbability({ deckSize: 60, copies: 4, turn: 3, onPlay: true }), atLeast(60, 4, 9, 1));
});

test('マリガンありは 1 - (初手で外す)×(引き直しで外す)', () => {
  const miss = (choose(56, 7) / choose(60, 7)) * (choose(49, 7) / choose(53, 7));
  close(drawProbability({ deckSize: 60, copies: 4, turn: 1, onPlay: true, mulligan: true }), 1 - miss);
});

test('マリガンありはなしより高く、ターンが進むほど上がる', () => {
  let prev = 0;
  for (let turn = 1; turn <= 8; turn++) {
    const a = drawProbability({ deckSize: 60, copies: 4, need: 2, turn, mulligan: false });
    const b = drawProbability({ deckSize: 60, copies: 4, need: 2, turn, mulligan: true });
    assert.ok(b > a);
    assert.ok(b > prev);
    prev = b;
  }
});

test('マリガンの計算はシミュレーションと一致する', () => {
  // 乱数は固定シードの線形合同法で再現可能にする
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const N = 60, K = 6, need = 2, turn = 4, trials = 200000;
  let ok = 0;
  for (let i = 0; i < trials; i++) {
    const deck = shuffle(Array.from({ length: N }, (_, x) => (x < K ? 1 : 0)));
    let hand = deck.splice(0, 7);
    let have = hand.reduce((a, b) => a + b, 0);
    if (have < need) {
      const back = 7 - have;
      const drawn = deck.splice(0, back);
      have += drawn.reduce((a, b) => a + b, 0);
      for (let b = 0; b < back; b++) deck.push(0);
      shuffle(deck);
    }
    have += deck.slice(0, turn - 1).reduce((a, b) => a + b, 0);
    if (have >= need) ok++;
  }
  const exact = drawProbability({ deckSize: N, copies: K, need, turn, onPlay: true, mulligan: true });
  assert.ok(Math.abs(ok / trials - exact) < 0.005, `${ok / trials} vs ${exact}`);
});

test('インク: 全部インク可能なら常に100%、0枚なら0%', () => {
  assert.deepEqual(inkOnCurve({ deckSize: 60, inkable: 60, turns: 5 }).map((p) => Math.round(p * 1e9) / 1e9), [1, 1, 1, 1, 1]);
  assert.deepEqual(inkOnCurve({ deckSize: 60, inkable: 0, turns: 3 }), [0, 0, 0]);
});

test('インク: 1ターン目は初手にインク可能が1枚以上ある確率（先攻）', () => {
  const [t1] = inkOnCurve({ deckSize: 60, inkable: 45, turns: 1, onPlay: true });
  close(t1, atLeast(60, 45, 7, 1));
  const [d1] = inkOnCurve({ deckSize: 60, inkable: 45, turns: 1, onPlay: false });
  close(d1, atLeast(60, 45, 8, 1));
});

test('インク: ターンが進むほど下がり、後攻のほうが高い', () => {
  const play = inkOnCurve({ deckSize: 60, inkable: 44, turns: 8, onPlay: true });
  const draw = inkOnCurve({ deckSize: 60, inkable: 44, turns: 8, onPlay: false });
  for (let i = 1; i < 8; i++) assert.ok(play[i] <= play[i - 1]);
  for (let i = 0; i < 8; i++) assert.ok(draw[i] > play[i]);
});

test('インク: シミュレーションと一致する', () => {
  let seed = 777;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const N = 60, I = 40, T = 6, trials = 200000;
  let ok = 0;
  for (let i = 0; i < trials; i++) {
    const deck = Array.from({ length: N }, (_, x) => (x < I ? 1 : 0));
    for (let a = N - 1; a > 0; a--) { const j = Math.floor(rand() * (a + 1)); [deck[a], deck[j]] = [deck[j], deck[a]]; }
    let seen = 7, good = true;
    for (let t = 1; t <= T && good; t++) {
      if (t > 1) seen++;
      const inks = deck.slice(0, seen).reduce((a, b) => a + b, 0);
      if (inks < t) good = false;
    }
    if (good) ok++;
  }
  const exact = inkOnCurve({ deckSize: N, inkable: I, turns: T, onPlay: true })[T - 1];
  assert.ok(Math.abs(ok / trials - exact) < 0.005, `${ok / trials} vs ${exact}`);
});

test('初手のインク可能枚数の分布は合計1', () => {
  close(openingInkableDistribution(60, 44).reduce((a, b) => a + b, 0), 1);
});

// ---------- AND条件 ----------
import { drawAllProbability } from '../src/prob.js';

test('AND: 1種類だけならOR条件（1枚以上）と同じ', () => {
  for (const mulligan of [false, true]) {
    for (const turn of [1, 4]) {
      close(
        drawAllProbability({ deckSize: 60, groups: [4], turn, onPlay: true, mulligan }),
        drawProbability({ deckSize: 60, copies: 4, need: 1, turn, onPlay: true, mulligan }),
      );
    }
  }
});

test('AND: 2種類を初手でそろえる確率（手計算）', () => {
  // 1 - P(Aなし) - P(Bなし) + P(どちらもなし)
  const exact = 1 - 2 * (choose(56, 7) / choose(60, 7)) + choose(52, 7) / choose(60, 7);
  close(drawAllProbability({ deckSize: 60, groups: [4, 4], turn: 1, onPlay: true }), exact);
});

test('AND: ORより低く、種類が増えるほど下がり、ターンが進むほど上がる', () => {
  const two = drawAllProbability({ deckSize: 60, groups: [4, 4], turn: 4 });
  const three = drawAllProbability({ deckSize: 60, groups: [4, 4, 4], turn: 4 });
  assert.ok(two < drawProbability({ deckSize: 60, copies: 8, turn: 4 }));
  assert.ok(three < two);
  assert.ok(drawAllProbability({ deckSize: 60, groups: [4, 4], turn: 6 }) > two);
  assert.ok(drawAllProbability({ deckSize: 60, groups: [4, 4], turn: 4, mulligan: true }) > two);
});

test('AND: マリガンあり・なしともシミュレーションと一致する', () => {
  let seed = 4242;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const N = 60, groups = [4, 3, 2], turn = 5, trials = 200000;
  for (const mulligan of [false, true]) {
    let ok = 0;
    for (let i = 0; i < trials; i++) {
      // 0 = 対象外、1..3 = 各カード
      const deck = [];
      groups.forEach((k, g) => { for (let c = 0; c < k; c++) deck.push(g + 1); });
      while (deck.length < N) deck.push(0);
      shuffle(deck);
      let hand = deck.splice(0, 7);
      const has = (cards) => groups.every((_, g) => cards.includes(g + 1));
      if (mulligan && !has(hand)) {
        const kept = hand.filter((c) => c !== 0);
        const back = 7 - kept.length;
        hand = [...kept, ...deck.splice(0, back)];
        for (let b = 0; b < back; b++) deck.push(0);
        shuffle(deck);
      }
      if (has([...hand, ...deck.slice(0, turn - 1)])) ok++;
    }
    const exact = drawAllProbability({ deckSize: N, groups, turn, onPlay: true, mulligan });
    assert.ok(Math.abs(ok / trials - exact) < 0.004, `mulligan=${mulligan}: ${ok / trials} vs ${exact}`);
  }
});

test('AND: 種類が多すぎる・枚数が不正なら0', () => {
  assert.equal(drawAllProbability({ deckSize: 60, groups: [1, 1, 1, 1, 1, 1, 1], turn: 3 }), 0);
  assert.equal(drawAllProbability({ deckSize: 60, groups: [], turn: 3 }), 0);
});
