import * as https from 'https';

export interface ConvertInput {
  date: string;
  amount: number;
  from: string;
  to: string;
  decimalPlaces: number;
}

export interface RateRequest {
  date: string;
  from: string;
  to: string;
}

export interface RateResponse {
  date: string;
  rate: number;
}

export interface ConvertResult {
  ok: true;
  date: string;
  from: string;
  to: string;
  amount: number;
  decimalPlaces: number;
  rate: number;
  rateDate: string;
  convertedAmount: number;
  cached: boolean;
}

export interface RateProvider {
  fetchRate(request: RateRequest): Promise<RateResponse>;
}

export class ExchangeRateError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ExchangeRateError';
    this.status = status;
    this.code = code;
  }
}

interface CacheEntry extends RateResponse {
  expiresAt: number;
}

export class CurrencyConverter {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly provider: RateProvider,
    private readonly cacheTtlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async convert(input: ConvertInput): Promise<ConvertResult> {
    const normalized = normalizeConvertInput(input);

    if (normalized.from === normalized.to) {
      return {
        ok: true,
        ...normalized,
        rate: 1,
        rateDate: normalized.date,
        convertedAmount: roundAmount(normalized.amount, normalized.decimalPlaces),
        cached: true,
      };
    }

    const cacheKey = `${normalized.date}:${normalized.from}:${normalized.to}`;
    const cached = this.readCache(cacheKey);
    const rate = cached || await this.provider.fetchRate({
      date: normalized.date,
      from: normalized.from,
      to: normalized.to,
    });

    if (rate.date !== normalized.date) {
      throw new ExchangeRateError(
        422,
        'RATE_DATE_UNAVAILABLE',
        `No exchange rate is available for ${normalized.date}. Provider returned ${rate.date}.`,
      );
    }

    if (!cached) {
      this.cache.set(cacheKey, {
        ...rate,
        expiresAt: this.now() + this.cacheTtlMs,
      });
    }

    return {
      ok: true,
      ...normalized,
      rate: rate.rate,
      rateDate: rate.date,
      convertedAmount: roundAmount(normalized.amount * rate.rate, normalized.decimalPlaces),
      cached: Boolean(cached),
    };
  }

  cacheSize(): number {
    return this.cache.size;
  }

  private readCache(key: string): RateResponse | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return {
      date: entry.date,
      rate: entry.rate,
    };
  }
}

export class FrankfurterRateProvider implements RateProvider {
  constructor(private readonly timeoutMs = 10000) {}

  async fetchRate(request: RateRequest): Promise<RateResponse> {
    const from = encodeURIComponent(request.from);
    const to = encodeURIComponent(request.to);
    const date = encodeURIComponent(request.date);
    const url = `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${date}`;

    const data = await getJson(url, this.timeoutMs);
    const rate = Number(data.rate);
    if (typeof data.date !== 'string' || !Number.isFinite(rate)) {
      throw new ExchangeRateError(502, 'PROVIDER_BAD_RESPONSE', 'Exchange rate provider returned an invalid response.');
    }

    return {
      date: data.date,
      rate,
    };
  }
}

export function normalizeConvertInput(input: ConvertInput): ConvertInput {
  if (!isIsoDate(input.date)) {
    throw new ExchangeRateError(422, 'INVALID_DATE', 'date must be YYYY-MM-DD.');
  }
  if (!Number.isFinite(input.amount)) {
    throw new ExchangeRateError(422, 'INVALID_AMOUNT', 'amount must be a finite number.');
  }
  if (!isCurrencyCode(input.from) || !isCurrencyCode(input.to)) {
    throw new ExchangeRateError(422, 'INVALID_CURRENCY', 'from and to must be 3-letter ISO 4217 codes.');
  }
  if (![0, 2, 4, 6].includes(input.decimalPlaces)) {
    throw new ExchangeRateError(422, 'INVALID_DECIMAL_PLACES', 'decimalPlaces must be one of 0, 2, 4, or 6.');
  }

  return {
    date: input.date,
    amount: input.amount,
    from: input.from.toUpperCase(),
    to: input.to.toUpperCase(),
    decimalPlaces: input.decimalPlaces,
  };
}

export function roundAmount(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Number(rounded.toFixed(decimalPlaces));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isCurrencyCode(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value);
}

function getJson(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'lark-currency-field-shortcut/0.1.0',
      },
    }, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const status = response.statusCode === 404 || response.statusCode === 422 ? 422 : 502;
          reject(new ExchangeRateError(status, 'PROVIDER_HTTP_ERROR', `Exchange rate provider returned ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new ExchangeRateError(502, 'PROVIDER_BAD_JSON', 'Exchange rate provider returned invalid JSON.'));
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new ExchangeRateError(502, 'PROVIDER_TIMEOUT', 'Exchange rate provider timed out.'));
    });

    request.on('error', (error) => {
      reject(error instanceof ExchangeRateError
        ? error
        : new ExchangeRateError(502, 'PROVIDER_NETWORK_ERROR', error.message));
    });
  });
}
