import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeckList, summarize } from '../src/deck.js';
import { lookupCard, fillFromData, CARD_COUNT } from '../src/cards.js';

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

test('内蔵カードデータから引ける', () => {
  assert.ok(CARD_COUNT > 2000);
  assert.deepEqual(lookupCard('Ariel - On Human Legs'), { name: 'Ariel - On Human Legs', cost: 4, inkable: true, color: 'amber' });
  // 大文字小文字・記号・アクセント記号の違いは無視する
  assert.equal(lookupCard('  ariel – on human legs ')?.cost, 4);
  assert.equal(lookupCard('Te Ka - The Burning One')?.name, 'Te Kā - The Burning One');
  assert.equal(lookupCard('Be Our Guest')?.name, 'Be Our Guest');
  assert.equal(lookupCard('Ariel'), null); // バージョンなしでは決められない
  assert.equal(lookupCard('アリエル'), null);
});

test('未入力の項目だけ埋める', () => {
  const card = { name: 'Ariel - On Human Legs', cost: 9, inkable: null, color: '' };
  assert.equal(fillFromData(card), true);
  assert.deepEqual(card, { name: 'Ariel - On Human Legs', cost: 9, inkable: true, color: 'amber' });
  assert.equal(fillFromData(card), false);
  assert.equal(fillFromData({ name: '存在しないカード', cost: null, inkable: null, color: '' }), false);
});

test('2色のカードは両方の色に数える', () => {
  const s = summarize([{ name: 'X', count: 3, cost: 2, inkable: true, color: 'amber-steel' }, { name: 'Y', count: 4, cost: 2, inkable: true, color: 'steel' }]);
  assert.deepEqual(s.colors.map((c) => [c.id, c.count]), [['amber', 3], ['steel', 7]]);
});
