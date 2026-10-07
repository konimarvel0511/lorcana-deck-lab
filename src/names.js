/** カード名を照合用にそろえる（大文字小文字・記号・アクセント記号の違いを無視）。 */
export function normalizeName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
