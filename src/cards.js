// アプリ内蔵のカードデータ（英語名）から、コスト・インク可否・色を引く。通信は使わない。
import { CARD_ROWS, CARD_DATA_DATE } from './card-data.js';
import { normalizeName } from './names.js';

export { CARD_DATA_DATE };

const index = new Map(CARD_ROWS.map((row) => [normalizeName(row[0]), row]));

/** 収録カード数。 */
export const CARD_COUNT = CARD_ROWS.length;

/** 入力候補に使う正式名の一覧。 */
export const cardNames = () => CARD_ROWS.map((row) => row[0]);

/**
 * カード名（「名前 - バージョン」）から情報を引く。完全に一致したときだけ返し、なければ null。
 * 大文字小文字・記号・アクセント記号の違いは無視する。
 */
export function lookupCard(fullName) {
  const row = index.get(normalizeName(fullName));
  if (!row) return null;
  return { name: row[0], cost: row[1], inkable: row[2] === 1, color: row[3] };
}

/**
 * 未入力の項目だけをカードデータで埋める。入力済みの値は上書きしない。
 * 1項目でも埋めたら true を返す。
 */
export function fillFromData(card) {
  const info = lookupCard(card.name);
  if (!info) return false;
  let changed = false;
  if (card.cost === null || card.cost === undefined) { card.cost = info.cost; changed = true; }
  if (card.inkable === null || card.inkable === undefined) { card.inkable = info.inkable; changed = true; }
  if (!card.color && info.color) { card.color = info.color; changed = true; }
  return changed;
}
