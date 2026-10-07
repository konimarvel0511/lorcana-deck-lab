// 確率計算。すべて「山札をよく切った状態から引く」前提の超幾何分布で求める。

export const HAND_SIZE = 7;

/** 二項係数 C(n, k)。デッキ枚数程度（〜数百）なら倍精度で十分。 */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

/** N枚中K枚が当たりの山からn枚引いて、ちょうどx枚当たりを引く確率。 */
export function hyperPmf(N, K, n, x) {
  n = Math.min(n, N);
  if (x < 0 || x > n || x > K || n - x > N - K) return 0;
  return (choose(K, x) * choose(N - K, n - x)) / choose(N, n);
}

/** N枚中K枚が当たりの山からn枚引いて、k枚以上当たりを引く確率。 */
export function atLeast(N, K, n, k) {
  if (k <= 0) return 1;
  let below = 0;
  for (let x = 0; x < k; x++) below += hyperPmf(N, K, n, x);
  return Math.min(1, Math.max(0, 1 - below));
}

/** そのターンまでにドローした枚数。先攻は1ターン目にドローしない。 */
export function drawsByTurn(turn, onPlay) {
  return Math.max(0, onPlay ? turn - 1 : turn);
}

/**
 * 指定ターンまでに、狙いのカードを need 枚以上引けている確率。
 * mulligan=true のときは「初手に need 枚そろっていなければ、狙い以外をすべて引き直す」
 * という戦略で計算する。引き直しでは、戻したカードは新しい手札を引いたあとに山へ混ざる。
 */
export function drawProbability({ deckSize, copies, need = 1, turn = 1, onPlay = true, mulligan = false }) {
  const N = deckSize;
  const K = Math.min(copies, N);
  const d = drawsByTurn(turn, onPlay);
  if (N < HAND_SIZE || K <= 0) return 0;
  if (!mulligan) return atLeast(N, K, HAND_SIZE + d, need);

  const rest = N - HAND_SIZE; // 引き直しで引く山、およびその後の山の枚数
  let total = 0;
  for (let j = 0; j <= Math.min(K, HAND_SIZE); j++) {
    const pj = hyperPmf(N, K, HAND_SIZE, j);
    if (pj === 0) continue;
    if (j >= need) {
      total += pj;
      continue;
    }
    const redraw = HAND_SIZE - j;
    let afterMulligan = 0;
    for (let m = 0; m <= Math.min(K - j, redraw); m++) {
      const pm = hyperPmf(rest, K - j, redraw, m);
      if (pm === 0) continue;
      afterMulligan += pm * atLeast(rest, K - j - m, d, need - j - m);
    }
    total += pj * afterMulligan;
  }
  return Math.min(1, total);
}

/** 初手7枚に含まれるインク可能カードの枚数分布（0〜7枚）。 */
export function openingInkableDistribution(deckSize, inkable) {
  const dist = [];
  for (let x = 0; x <= HAND_SIZE; x++) dist.push(hyperPmf(deckSize, inkable, HAND_SIZE, x));
  return dist;
}

/**
 * 1ターン目から毎ターン欠かさずインクを置けている確率を、ターンごとに返す。
 * 戻り値[t-1] が「tターン目までインクが途切れない確率」。
 * インクは毎ターン1枚までなので、置けないターンが一度でもあれば失敗として数える。
 * 追加ドローやマリガンは考慮しない。
 */
export function inkOnCurve({ deckSize, inkable, turns = 8, onPlay = true }) {
  const N = deckSize;
  const I = Math.min(inkable, N);
  const out = [];
  if (N < HAND_SIZE) return out;
  let dist = new Map();
  for (let k = 0; k <= Math.min(I, HAND_SIZE); k++) dist.set(k, hyperPmf(N, I, HAND_SIZE, k));
  let seen = HAND_SIZE;
  for (let t = 1; t <= turns; t++) {
    if (!(onPlay && t === 1) && seen < N) {
      const next = new Map();
      for (const [k, p] of dist) {
        const hit = (I - k) / (N - seen);
        if (hit < 1) next.set(k, (next.get(k) || 0) + p * (1 - hit));
        if (hit > 0) next.set(k + 1, (next.get(k + 1) || 0) + p * hit);
      }
      dist = next;
      seen++;
    }
    let alive = 0;
    for (const [k, p] of dist) {
      if (k < t) dist.delete(k);
      else alive += p;
    }
    out.push(Math.min(1, alive));
  }
  return out;
}

/** AND条件で一度に選べるカードの種類数（計算量を抑えるための上限）。 */
export const MAX_ALL_GROUPS = 6;

/** n枚引いて、groups（各カードの枚数）のすべてを1枚以上引いている確率。包除原理で求める。 */
function allPresent(N, groups, n) {
  n = Math.min(n, N);
  const base = choose(N, n);
  let total = 0;
  for (let mask = 0; mask < 1 << groups.length; mask++) {
    let absent = 0, bits = 0;
    for (let i = 0; i < groups.length; i++) if (mask & (1 << i)) { absent += groups[i]; bits++; }
    total += (bits % 2 ? -1 : 1) * (choose(N - absent, n) / base);
  }
  return Math.min(1, Math.max(0, total));
}

/**
 * 指定ターンまでに、選んだカードを「すべて」1枚以上引けている確率（AND条件）。
 * groups は各カードの枚数（例: [4, 3] = 4枚積みと3枚積みの両方がほしい）。
 * mulligan=true のときは「初手でそろっていなければ、選んだカード以外をすべて引き直す」戦略で計算する。
 */
export function drawAllProbability({ deckSize, groups, turn = 1, onPlay = true, mulligan = false }) {
  const N = deckSize;
  const total = groups.reduce((a, b) => a + b, 0);
  if (N < HAND_SIZE || !groups.length || groups.some((k) => k <= 0) || total > N || groups.length > MAX_ALL_GROUPS) return 0;
  const d = drawsByTurn(turn, onPlay);
  if (!mulligan) return allPresent(N, groups, HAND_SIZE + d);

  const rest = N - HAND_SIZE; // 引き直しで引く山、およびその後の山の枚数
  const handBase = choose(N, HAND_SIZE);
  let result = 0;
  // 初手に含まれる各カードの枚数を総当たりする
  const walk = (i, ways, used, missing) => {
    if (i === groups.length) {
      const p = (ways * choose(N - total, HAND_SIZE - used)) / handBase;
      if (p === 0) return;
      if (!missing.length) { result += p; return; }
      // 足りないカードについて包除原理。引き直しでも、その後のドローでも引けない確率を引いていく。
      // 戻したカードは対象外なので、引き直しで引けなかった種類は山に全部残っている。
      const redraw = HAND_SIZE - used;
      let ok = 0;
      for (let mask = 0; mask < 1 << missing.length; mask++) {
        let absent = 0, bits = 0;
        for (let m = 0; m < missing.length; m++) if (mask & (1 << m)) { absent += missing[m]; bits++; }
        const none = (choose(rest - absent, redraw) / choose(rest, redraw)) * (choose(rest - absent, Math.min(d, rest)) / choose(rest, Math.min(d, rest)));
        ok += (bits % 2 ? -1 : 1) * none;
      }
      result += p * ok;
      return;
    }
    for (let h = 0; h <= groups[i] && used + h <= HAND_SIZE; h++) {
      walk(i + 1, ways * choose(groups[i], h), used + h, h === 0 ? [...missing, groups[i]] : missing);
    }
  };
  walk(0, 1, 0, []);
  return Math.min(1, Math.max(0, result));
}
