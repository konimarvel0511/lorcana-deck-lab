// カード情報の自動入力（試験的）。Lorcast の公開API（英語名のみ）を使う。
// 名前とバージョンが完全に一致したカードだけを採用し、あいまいな一致は使わない。

const SEARCH_URL = 'https://api.lorcast.com/v0/cards/search';

/** 「Elsa - Spirit of Winter」を name と version に分ける。 */
export function splitCardName(full) {
  const i = full.indexOf(' - ');
  if (i < 0) return { name: full.trim(), version: '' };
  return { name: full.slice(0, i).trim(), version: full.slice(i + 3).trim() };
}

const norm = (s) => (s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

/** 検索結果から、名前・バージョンが完全一致する1枚を選ぶ。なければ null。 */
export function pickExactMatch(results, fullName) {
  const want = splitCardName(fullName);
  const list = Array.isArray(results) ? results : results?.results || [];
  const hits = list.filter((c) => norm(c.name) === norm(want.name));
  const exact = want.version ? hits.find((c) => norm(c.version) === norm(want.version)) : hits.length && hits.every((c) => norm(c.version) === norm(hits[0].version)) ? hits[0] : null;
  if (!exact) return null;
  return {
    cost: Number.isFinite(exact.cost) ? exact.cost : null,
    inkable: typeof exact.inkwell === 'boolean' ? exact.inkwell : null,
    color: typeof exact.ink === 'string' ? exact.ink.toLowerCase() : '',
  };
}

export async function lookupCard(fullName, fetchImpl = fetch) {
  const { name } = splitCardName(fullName);
  const res = await fetchImpl(`${SEARCH_URL}?q=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return pickExactMatch(await res.json(), fullName);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 複数カードを順番に調べる。onResult(名前, 情報|null) を1枚ごとに呼ぶ。 */
export async function lookupMany(names, onResult, fetchImpl = fetch) {
  let found = 0;
  for (const name of names) {
    const info = await lookupCard(name, fetchImpl);
    if (info) found++;
    onResult(name, info);
    await wait(120);
  }
  return found;
}
