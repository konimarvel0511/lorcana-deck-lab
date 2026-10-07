// 「対戦記録」タブ: 記録の追加・削除と、勝率の集計。
import { INK_COLORS, colorLabel } from '../deck.js';
import { RESULTS, summarizeMatches, toCsv, colorKey } from '../matches.js';
import { state, activeDeck, newMatchId } from '../state.js';
import { $, esc, pct, today } from '../ui.js';

// 入力途中のフォームの内容（再描画しても消えないように持っておく）
const form = { date: today(), deckId: null, opp: new Set(), onPlay: true, note: '' };
let pendingDelete = null;
let csvShown = false;
let status = '';

/** ほかのタブから、フォームの内容をあらかじめ入れておく。 */
export function prefillMatch({ deckId, onPlay, note }) {
  form.date = today();
  form.deckId = deckId;
  form.onPlay = onPlay;
  form.note = note;
  form.opp = new Set();
  status = 'ロアカウンターの結果をメモに入れました。相手の色を選んで、勝ち負けのボタンで記録してください。';
}

const record = (t) => `${t.win}勝 ${t.loss}敗${t.draw ? ` ${t.draw}分` : ''}`;
const rate = (t) => (t.rate === null ? '−' : pct(t.rate));

const breakdown = (title, groups) => `
  <div class="table-wrap"><table class="data">
    <thead><tr><th scope="col">${title}</th><th scope="col" class="r">試合</th><th scope="col" class="r">勝敗</th><th scope="col" class="r">勝率</th></tr></thead>
    <tbody>${groups.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td class="r">${g.games}</td><td class="r">${record(g)}</td><td class="r">${rate(g)}</td></tr>`).join('')}</tbody>
  </table></div>`;

export function renderMatches() {
  const el = $('tab-matches');
  if (!state.decks.some((d) => d.id === form.deckId)) form.deckId = activeDeck().id;
  const list = [...state.matches].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || 0) - (a.at || 0));
  const s = summarizeMatches(state.matches);
  el.innerHTML = `<section>
    <h2>対戦を記録する</h2>
    <form id="match-form" class="match-form" autocomplete="off">
      <label for="match-date">日付<input type="date" id="match-date" value="${esc(form.date)}"></label>
      <label for="match-deck">自分のデッキ
        <select id="match-deck">${state.decks.map((d) => `<option value="${d.id}"${d.id === form.deckId ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      </label>
      <div class="field"><span>先攻/後攻</span>
        <div class="seg-ctl" role="group" aria-label="先攻か後攻か">
          <button type="button" id="match-play" aria-pressed="${form.onPlay}">先攻</button><button type="button" id="match-draw" aria-pressed="${!form.onPlay}">後攻</button>
        </div>
      </div>
      <div class="field wide"><span>相手の色（2色まで）</span>
        <div class="chips">${INK_COLORS.map((k) => `<button type="button" class="chip" id="opp-${k.id}" data-opp="${k.id}" aria-pressed="${form.opp.has(k.id)}">${k.label}</button>`).join('')}</div>
      </div>
      <label for="match-note" class="wide">メモ<input type="text" id="match-note" value="${esc(form.note)}" placeholder="例: 初手が重かった、相手の除去が多い"></label>
      <div class="row wide">
        <button type="button" class="btn primary" data-result="win">勝ちで記録</button>
        <button type="button" class="btn primary" data-result="loss">負けで記録</button>
        <button type="button" class="btn" data-result="draw">引き分けで記録</button>
      </div>
    </form>
    <p class="status" role="status">${esc(status)}</p>
  </section>
  <section>
    <h2>成績</h2>
    ${state.matches.length ? `
      <dl class="facts">
        <div class="fact"><dt>試合数</dt><dd>${s.overall.games}</dd></div>
        <div class="fact"><dt>勝敗</dt><dd>${record(s.overall)}</dd></div>
        <div class="fact"><dt>勝率</dt><dd>${rate(s.overall)}</dd></div>
      </dl>
      ${breakdown('デッキ別', s.byDeck)}
      ${breakdown('先攻/後攻別', s.byOrder)}
      ${breakdown('相手の色別', s.byOpponent)}
      <p class="assume">勝率は引き分けを除いて計算しています。</p>` : '<p class="empty">まだ記録がありません。上のフォームから1試合ずつ記録すると、デッキ別・先攻後攻別・相手の色別の勝率を表示します。</p>'}
  </section>
  <section>
    <h2>記録の一覧</h2>
    ${list.length ? `<div class="table-wrap"><table class="data log">
      <thead><tr><th scope="col">日付</th><th scope="col">デッキ</th><th scope="col">相手</th><th scope="col">先後</th><th scope="col">結果</th><th scope="col">メモ</th><th scope="col" aria-label="操作"></th></tr></thead>
      <tbody>${list.map((m) => `<tr>
        <td class="nowrap">${esc(m.date || '')}</td><td>${esc(m.deckName || '')}</td><td>${esc(colorLabel(colorKey(m.opp)) || '−')}</td>
        <td>${m.onPlay ? '先攻' : '後攻'}</td><td class="result-${esc(m.result)}">${RESULTS.find((r) => r.id === m.result)?.label || ''}</td><td>${esc(m.note || '')}</td>
        <td><button type="button" class="del" id="del-${m.id}" data-del-match="${m.id}">${pendingDelete === m.id ? '本当に削除する' : '削除'}</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="row"><button type="button" class="btn" id="match-csv">記録をCSVでコピー</button></div>
    ${csvShown ? `<label for="match-csv-text" class="hint">コピーできなかった場合は、下の文字を選んでコピーしてください。</label><textarea id="match-csv-text" rows="6" readonly>${esc(toCsv(list))}</textarea>` : ''}` : '<p class="empty">記録するとここに並びます。</p>'}
    <p class="assume">記録はこのブラウザに保存されます。別の端末やブラウザには引き継がれません。</p>
  </section>`;
}

export function setupMatches(update) {
  const el = $('tab-matches');
  el.addEventListener('input', (e) => {
    if (e.target.id === 'match-date') form.date = e.target.value;
    else if (e.target.id === 'match-note') form.note = e.target.value;
    else if (e.target.id === 'match-deck') form.deckId = e.target.value;
  });
  el.addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    status = '';
    if (t.dataset.delMatch) {
      if (pendingDelete === t.dataset.delMatch) {
        state.matches = state.matches.filter((m) => m.id !== pendingDelete);
        pendingDelete = null;
        status = '記録を1件削除しました。';
      } else {
        pendingDelete = t.dataset.delMatch;
      }
      update();
      return;
    }
    pendingDelete = null;
    if (t.dataset.opp) {
      if (form.opp.has(t.dataset.opp)) form.opp.delete(t.dataset.opp);
      else if (form.opp.size < 2) form.opp.add(t.dataset.opp);
      else { status = '相手の色は2色までです。変えるときは、選択中の色を先に外してください。'; }
    } else if (t.id === 'match-play' || t.id === 'match-draw') {
      form.onPlay = t.id === 'match-play';
    } else if (t.dataset.result) {
      const deck = state.decks.find((d) => d.id === form.deckId) || activeDeck();
      state.matches.push({ id: newMatchId(), at: Date.now(), date: form.date || today(), deckId: deck.id, deckName: deck.name, opp: [...form.opp], onPlay: form.onPlay, result: t.dataset.result, note: form.note.trim() });
      status = `${RESULTS.find((r) => r.id === t.dataset.result).label}を記録しました（${deck.name}）。`;
      form.note = '';
    } else if (t.id === 'match-csv') {
      const csv = toCsv([...state.matches].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      try {
        await navigator.clipboard.writeText(csv);
        status = '記録をコピーしました。表計算ソフトやメモに貼り付けられます。';
        csvShown = false;
      } catch {
        csvShown = true;
        status = '';
      }
    } else return;
    update();
    if (csvShown) $('match-csv-text')?.select();
  });
}
