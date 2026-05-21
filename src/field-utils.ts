export interface ConvertRequest {
  date: string;
  amount: number;
  from: string;
  to: string;
  decimalPlaces: number;
}

export interface FieldShortcutParams {
  transactionDate?: unknown;
  amount?: unknown;
  sourceCurrency?: unknown;
  targetCurrency?: unknown;
  decimalPlaces?: unknown;
}

export class FieldInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldInputError';
  }
}

const SUPPORTED_DECIMAL_PLACES = new Set([0, 2, 4, 6]);

export function buildConvertRequest(params: FieldShortcutParams): ConvertRequest {
  return {
    date: dateValueToIsoDate(params.transactionDate),
    amount: parseAmount(params.amount),
    from: normalizeCurrencyCode(params.sourceCurrency, 'source currency'),
    to: normalizeCurrencyCode(params.targetCurrency, 'target currency'),
    decimalPlaces: parseDecimalPlaces(params.decimalPlaces),
  };
}

export function parseAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FieldInputError('Amount must be a finite number.');
  }
  return value;
}

export function parseDecimalPlaces(value: unknown): number {
  const raw = extractScalarText(value).trim();
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || !SUPPORTED_DECIMAL_PLACES.has(parsed)) {
    throw new FieldInputError('Decimal places must be one of 0, 2, 4, or 6.');
  }
  return parsed;
}

export function normalizeCurrencyCode(value: unknown, label = 'currency'): string {
  const code = extractScalarText(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new FieldInputError(`${label} must be a 3-letter ISO 4217 code.`);
  }
  return code;
}

export function dateValueToIsoDate(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FieldInputError('Transaction date must be a date field value.');
  }

  const milliseconds = value < 1000000000000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new FieldInputError('Transaction date is invalid.');
  }

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');
}

export function extractBackendHost(backendUrl: string): string {
  try {
    return new URL(backendUrl).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

export function extractScalarText(value: unknown): string {
  if (value === null || value === undefined) {
    throw new FieldInputError('Required field value is empty.');
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new FieldInputError('Required field value is empty.');
    }
    return value.map((item) => extractScalarText(item)).join('');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) {
      return extractScalarText(record.value);
    }
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.label === 'string') {
      return record.label;
    }
  }

  throw new FieldInputError('Unsupported field value shape.');
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}
