import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConvertRequest,
  dateValueToIsoDate,
  extractBackendHost,
  normalizeCurrencyCode,
  parseDecimalPlaces,
} from '../src/field-utils';

test('buildConvertRequest parses Lark field values', () => {
  const request = buildConvertRequest({
    transactionDate: Date.UTC(2026, 4, 21),
    amount: 125.5,
    sourceCurrency: [{ type: 'text', text: 'usd' }],
    targetCurrency: 'cny',
    decimalPlaces: { label: '2', value: '2' },
  });

  assert.deepEqual(request, {
    date: '2026-05-21',
    amount: 125.5,
    from: 'USD',
    to: 'CNY',
    decimalPlaces: 2,
  });
});

test('normalizeCurrencyCode rejects non ISO-like codes', () => {
  assert.throws(() => normalizeCurrencyCode('USDT'), /3-letter/);
  assert.throws(() => normalizeCurrencyCode('12A'), /3-letter/);
});

test('parseDecimalPlaces only accepts configured options', () => {
  assert.equal(parseDecimalPlaces({ label: '6', value: '6' }), 6);
  assert.throws(() => parseDecimalPlaces('3'), /0, 2, 4, or 6/);
});

test('dateValueToIsoDate accepts an existing ISO date', () => {
  assert.equal(dateValueToIsoDate('2026-05-21'), '2026-05-21');
});

test('extractBackendHost strips protocol and port for addDomainList', () => {
  assert.equal(extractBackendHost('https://currency.example.com/api/convert'), 'currency.example.com');
  assert.equal(extractBackendHost('http://localhost:8787/api/convert'), 'localhost');
  assert.equal(extractBackendHost('http://127.0.0.1:8787/api/convert'), '127.0.0.1');
});
