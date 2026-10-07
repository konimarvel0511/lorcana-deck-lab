// LorcanaJSON の allCards.json から、アプリ内蔵のカードデータ（src/card-data.js）を作る。
// 使い方: node scripts/build-card-data.mjs <allCards.json のパス>
// 新しいセットが出たら https://lorcanajson.org から allCards.json を取り直して実行する。
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeName } from '../src/names.js';

const path = process.argv[2];
if (!path) {
  console.error('使い方: node scripts/build-card-data.mjs <allCards.json のパス>');
  process.exit(1);
}
const { metadata, cards } = JSON.parse(readFileSync(path, 'utf8'));
const COLORS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel'];

const byKey = new Map();
const conflicts = new Set();
for (const c of cards) {
  if (!c.fullName || !Number.isInteger(c.cost) || typeof c.inkwell !== 'boolean') continue;
  const color = String(c.color || '').toLowerCase();
  if (color && !color.split('-').every((x) => COLORS.includes(x))) throw new Error(`未知の色: ${c.color} (${c.fullName})`);
  const key = normalizeName(c.fullName);
  const row = [c.fullName, c.cost, c.inkwell ? 1 : 0, color];
  const prev = byKey.get(key);
  if (prev && (prev[1] !== row[1] || prev[2] !== row[2] || prev[3] !== row[3])) conflicts.add(key);
  if (!prev) byKey.set(key, row);
}
// 同じ名前でコストなどが食い違うカードは、誤入力を避けるため収録しない
for (const key of conflicts) byKey.delete(key);

const rows = [...byKey.values()].sort((a, b) => a[0].localeCompare(b[0], 'en'));
const out = `// 自動生成ファイル。直接編集せず scripts/build-card-data.mjs で作り直す。
// 出典: LorcanaJSON (https://lorcanajson.org) ${metadata.language} / 生成日 ${metadata.generatedOn}
export const CARD_DATA_DATE = ${JSON.stringify(metadata.generatedOn.slice(0, 10))};
// [カード名, コスト, インク可能(1/0), 色]
export const CARD_ROWS = ${JSON.stringify(rows).replace(/\],\[/g, '],\n[')};
`;
writeFileSync(new URL('../src/card-data.js', import.meta.url), out);
console.log(`${rows.length}種類を書き出しました（食い違いで除外: ${conflicts.size}）`);
