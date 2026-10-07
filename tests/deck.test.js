import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeckList, summarize } from '../src/deck.js';
import { splitCardName, pickExactMatch } from '../src/cards.js';

test('いろいろな書き方を読める', () => {
  const { entries, skipped } = parseDeckList(`
# コメント
4 Elsa - Spirit of Winter
3x Be Prepared
２　ミッキーマウス
Let It Go x4
4枚 アナ
Deck Title
4 Elsa - Spirit of Winter
`);
  assert.deepEqual(entries, [
    { name: 'Elsa - Spirit of Winter', count: 8 },
    { name: 'Be Prepared', count: 3 },
    { name: 'ミッキーマウス', count: 2 },
    { name: 'Let It Go', count: 4 },
    { name: 'アナ', count: 4 },
  ]);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].text, 'Deck Title');
});

test('集計', () => {
  const s = summarize([
    { name: 'A', count: 4, cost: 1, inkable: true, color: 'amber' },
    { name: 'B', count: 4, cost: 3, inkable: false, color: 'steel' },
    { name: 'C', count: 2, cost: 12, inkable: null, color: '' },
    { name: 'D', count: 5, cost: null, inkable: true, color: 'amber' },
  ]);
  assert.equal(s.total, 15);
  assert.equal(s.inkable, 9);
  assert.equal(s.uninkable, 4);
  assert.equal(s.inkUnknown, 2);
  assert.equal(s.costUnknown, 5);
  assert.equal(s.curve[1].inkable, 4);
  assert.equal(s.curve[3].uninkable, 4);
  assert.equal(s.curve[10].unknown, 2);
  assert.equal(s.averageCost, (4 + 12 + 24) / 10);
  assert.deepEqual(s.colors.map((c) => [c.id, c.count]), [['amber', 9], ['steel', 4]]);
  assert.deepEqual(s.overLimit, ['D']);
});

test('カード名の分割と完全一致の選択', () => {
  assert.deepEqual(splitCardName('Elsa - Spirit of Winter'), { name: 'Elsa', version: 'Spirit of Winter' });
  assert.deepEqual(splitCardName('Be Prepared'), { name: 'Be Prepared', version: '' });
  const results = { results: [
    { name: 'Elsa', version: 'Snow Queen', cost: 4, inkwell: true, ink: 'Amethyst' },
    { name: 'Elsa', version: 'Spirit of Winter', cost: 8, inkwell: false, ink: 'Amethyst' },
  ] };
  assert.deepEqual(pickExactMatch(results, 'elsa - spirit of winter'), { cost: 8, inkable: false, color: 'amethyst' });
  assert.equal(pickExactMatch(results, 'Elsa - Ice Maker'), null);
  assert.equal(pickExactMatch(results, 'Elsa'), null); // バージョン違いが複数あるときは選ばない
  assert.equal(pickExactMatch([], 'Elsa'), null);
});
