// デッキリストの読み取りと集計。

export const INK_COLORS = [
  { id: 'amber', label: 'アンバー' },
  { id: 'amethyst', label: 'アメジスト' },
  { id: 'emerald', label: 'エメラルド' },
  { id: 'ruby', label: 'ルビー' },
  { id: 'sapphire', label: 'サファイア' },
  { id: 'steel', label: 'スティール' },
];

export const MIN_DECK_SIZE = 60;
export const MAX_COPIES = 4;
export const MAX_COST_BUCKET = 10; // 10以上は「10+」にまとめる

const toHalfWidth = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 「4 カード名」「4x カード名」「カード名 x4」形式のテキストを読む。
 * 同じ名前の行は合算する。読めなかった行は skipped に入れて返す。
 */
export function parseDeckList(text) {
  const byName = new Map();
  const skipped = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = toHalfWidth(raw).replace(/　/g, ' ').trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    let m = line.match(/^(\d+)\s*(?:[xX×枚]\s*|\s+)(.+)$/);
    let count, name;
    if (m) {
      count = Number(m[1]);
      name = m[2].trim();
    } else if ((m = line.match(/^(.+?)\s*[xX×]\s*(\d+)\s*枚?$/))) {
      name = m[1].trim();
      count = Number(m[2]);
    }
    if (!name || !Number.isInteger(count) || count < 1 || count > 99) {
      skipped.push({ line: index + 1, text: raw.trim() });
      return;
    }
    byName.set(name, (byName.get(name) || 0) + count);
  });
  return { entries: [...byName].map(([name, count]) => ({ name, count })), skipped };
}

/** 色の値（amber や amber-steel）を表示名にする。 */
export function colorLabel(value) {
  return String(value || '').split('-').map((id) => INK_COLORS.find((k) => k.id === id)?.label || id).join('／');
}

/** デッキ全体の集計。cards: [{count, name, cost, inkable, color}] */
export function summarize(cards) {
  const curve = Array.from({ length: MAX_COST_BUCKET + 1 }, (_, cost) => ({ cost, inkable: 0, uninkable: 0, unknown: 0 }));
  const colors = new Map();
  let total = 0, inkable = 0, uninkable = 0, inkUnknown = 0, costUnknown = 0, costSum = 0, costCount = 0;
  const overLimit = [];
  for (const c of cards) {
    const n = c.count || 0;
    if (n <= 0) continue;
    total += n;
    if (c.inkable === true) inkable += n;
    else if (c.inkable === false) uninkable += n;
    else inkUnknown += n;
    if (Number.isFinite(c.cost)) {
      const bucket = curve[Math.min(Math.max(0, Math.round(c.cost)), MAX_COST_BUCKET)];
      bucket[c.inkable === true ? 'inkable' : c.inkable === false ? 'uninkable' : 'unknown'] += n;
      costSum += c.cost * n;
      costCount += n;
    } else {
      costUnknown += n;
    }
    // 2色のカード（例: amber-steel）は両方の色に数える
    for (const color of String(c.color || '').split('-').filter(Boolean)) colors.set(color, (colors.get(color) || 0) + n);
    if (n > MAX_COPIES) overLimit.push(c.name);
  }
  return {
    total, inkable, uninkable, inkUnknown, costUnknown,
    averageCost: costCount ? costSum / costCount : null,
    curve,
    colors: INK_COLORS.filter((k) => colors.has(k.id)).map((k) => ({ ...k, count: colors.get(k.id) })),
    overLimit,
  };
}
