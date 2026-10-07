// 「カーブ通りに動ける確率」をシミュレーションで求める。
// カーブ通り = 毎ターン インクを1枚置き、そのターン数と同じコストのカードを1枚出すこと。
import { HAND_SIZE } from './prob.js';
import { mulberry32 } from './sim.js';

/**
 * 戻り値[t-1] は「startTurn から t ターン目まで、毎ターン カーブ通りに動けた」割合。
 * startTurn より前のターンは null（インクだけ置けていればよい期間）。
 *
 * インクに置くカードは、先のドローを知らない前提で次の順に選ぶ:
 *   1. もうカーブ通りには出せないカード（コストがそのターン以下）
 *   2. 計算する範囲より重いカード
 *   3. 同じコストが手札に2枚以上あるカード
 *   4. どれもなければ、いちばん重いカード
 */
export function curveOutProbability({ cards, turns = 6, startTurn = 1, onPlay = true, trials = 20000, seed = 20260930 }) {
  const cost = [];
  const ink = [];
  for (const c of cards) {
    for (let i = 0; i < (c.count || 0); i++) {
      cost.push(Math.round(c.cost));
      ink.push(c.inkable ? 1 : 0);
    }
  }
  const N = cost.length;
  const result = Array.from({ length: turns }, (_, i) => (i + 1 < startTurn ? null : 0));
  if (N < HAND_SIZE) return result;

  const rng = mulberry32(seed);
  const order = Array.from({ length: N }, (_, i) => i);
  const need = Math.min(N, HAND_SIZE + turns);
  const success = new Array(turns).fill(0);

  for (let trial = 0; trial < trials; trial++) {
    // 必要な枚数だけ切る
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (N - i));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const hand = order.slice(0, HAND_SIZE);
    let next = HAND_SIZE;
    for (let t = 1; t <= turns; t++) {
      if (!(onPlay && t === 1) && next < N) hand.push(order[next++]);

      // このターンに出すカード（インクにできないほうを優先して使う）
      let play = -1;
      if (t >= startTurn) {
        for (let h = 0; h < hand.length; h++) {
          if (cost[hand[h]] !== t) continue;
          if (play < 0 || (ink[hand[play]] && !ink[hand[h]])) play = h;
        }
        if (play < 0) break;
      }

      // インクに置くカード
      let pick = -1, pickRank = -1, pickCost = -1;
      for (let h = 0; h < hand.length; h++) {
        if (h === play || !ink[hand[h]]) continue;
        const c = cost[hand[h]];
        let rank;
        if (c <= t || c < startTurn) rank = 3;
        else if (c > turns) rank = 2;
        else {
          let same = 0;
          for (let k = 0; k < hand.length; k++) if (cost[hand[k]] === c) same++;
          rank = same >= 2 ? 1 : 0;
        }
        if (rank > pickRank || (rank === pickRank && c > pickCost)) { pick = h; pickRank = rank; pickCost = c; }
      }
      if (pick < 0) break;

      // 手札から取り除く（添字の大きいほうから）
      const a = Math.max(play, pick), b = Math.min(play, pick);
      hand.splice(a, 1);
      if (b >= 0) hand.splice(b, 1);
      success[t - 1]++;
    }
  }
  for (let t = startTurn; t <= turns; t++) result[t - 1] = success[t - 1] / trials;
  return result;
}
