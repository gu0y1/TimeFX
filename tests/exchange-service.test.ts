import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CurrencyConverter,
  ExchangeRateError,
  RateProvider,
  RateRequest,
  RateResponse,
  roundAmount,
} from '../backend/exchange-service';

class MockProvider implements RateProvider {
  calls = 0;

  constructor(private readonly response: RateResponse) {}

  async fetchRate(_request: RateRequest): Promise<RateResponse> {
    this.calls += 1;
    return this.response;
  }
}

test('CurrencyConverter converts and rounds amounts', async () => {
  const provider = new MockProvider({ date: '2026-05-21', rate: 7.123456 });
  const converter = new CurrencyConverter(provider, 60000);

  const result = await converter.convert({
    date: '2026-05-21',
    amount: 10,
    from: 'usd',
    to: 'cny',
    decimalPlaces: 2,
  });

  assert.equal(result.convertedAmount, 71.23);
  assert.equal(result.rate, 7.123456);
  assert.equal(result.cached, false);
  assert.equal(provider.calls, 1);
});

test('CurrencyConverter caches rates by date and pair', async () => {
  const provider = new MockProvider({ date: '2026-05-21', rate: 2 });
  const converter = new CurrencyConverter(provider, 60000);

  await converter.convert({ date: '2026-05-21', amount: 10, from: 'USD', to: 'EUR', decimalPlaces: 2 });
  const second = await converter.convert({ date: '2026-05-21', amount: 20, from: 'USD', to: 'EUR', decimalPlaces: 2 });

  assert.equal(second.convertedAmount, 40);
  assert.equal(second.cached, true);
  assert.equal(provider.calls, 1);
});

test('CurrencyConverter returns original amount for same currency', async () => {
  const provider = new MockProvider({ date: '2026-05-21', rate: 99 });
  const converter = new CurrencyConverter(provider, 60000);

  const result = await converter.convert({
    date: '2026-05-21',
    amount: 12.3456,
    from: 'USD',
    to: 'USD',
    decimalPlaces: 2,
  });

  assert.equal(result.convertedAmount, 12.35);
  assert.equal(result.rate, 1);
  assert.equal(provider.calls, 0);
});

test('CurrencyConverter rejects provider date fallback', async () => {
  const provider = new MockProvider({ date: '2026-05-20', rate: 7 });
  const converter = new CurrencyConverter(provider, 60000);

  await assert.rejects(
    () => converter.convert({ date: '2026-05-21', amount: 10, from: 'USD', to: 'CNY', decimalPlaces: 2 }),
    (error) => error instanceof ExchangeRateError && error.status === 422 && error.code === 'RATE_DATE_UNAVAILABLE',
  );
});

test('roundAmount handles configured precision', () => {
  assert.equal(roundAmount(1.005, 2), 1.01);
  assert.equal(roundAmount(1.2345678, 6), 1.234568);
  assert.equal(roundAmount(1.5, 0), 2);
});
