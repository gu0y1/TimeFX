import * as crypto from 'crypto';

export const BASE_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxKNV23rheRvtUKDMJPOW',
  'GhUt+W25k63X4Q1QYhztPlobF2VNIDR6eHVFUDP22aytzVguisJ/GaOKZ7FJDKis',
  '9YvMUiCIFnfu1LWB4b4pa4ajmPk/Rr9DMSLz6frKRP0QqirWFe7t+u0K0nzzPe3',
  '/a5ScSmJwYACmayQfLZFTFjyL0Z1SQFZM6pZ1J1w9ETxWI0NrpkMU7eqzVGvhf+',
  'OOdmxsXrHARWa1Ldm3WqPCF3k5jKuPG7s0zB+iuBHamSitZ7ktBf0mzBBjsAjKQ',
  'll1kmdjryGbKX5sLXhEgOb5ndakYeA0Oy7vve2Hm78kH5MtaSv6MfNVjm5ForMj',
  'PAPQBQIDAQAB',
  '-----END PUBLIC KEY-----',
].join('\n');

export interface LarkSignaturePayload {
  source: string;
  version: string;
  packID: string;
  exp: number;
}

export interface VerifyLarkSignatureInput {
  signature?: string | string[];
  packID?: string | string[];
  expectedPackID?: string;
  now?: number;
  publicKey?: string;
}

export interface VerifyLarkSignatureResult {
  ok: boolean;
  status: number;
  code: string;
  message: string;
  payload?: LarkSignaturePayload;
}

export function normalizePublicKey(publicKey?: string): string {
  const trimmed = publicKey?.trim();
  if (!trimmed) {
    return BASE_PUBLIC_KEY;
  }
  return trimmed.replace(/\\n/g, '\n');
}

export function verifyLarkSignature(input: VerifyLarkSignatureInput): VerifyLarkSignatureResult {
  const expectedPackID = input.expectedPackID?.trim();
  if (!expectedPackID) {
    return failure(500, 'SERVER_MISCONFIGURED', 'LARK_EXPECTED_PACK_ID is required.');
  }

  const signature = firstHeaderValue(input.signature);
  if (!signature) {
    return failure(401, 'MISSING_SIGNATURE', 'X-Base-Signature is required.');
  }

  const parts = signature.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return failure(401, 'MALFORMED_SIGNATURE', 'X-Base-Signature is malformed.');
  }

  let payloadJson: string;
  let payload: LarkSignaturePayload;
  let signatureBuffer: Buffer;

  try {
    payloadJson = base64UrlDecode(parts[0]).toString('utf8');
    payload = JSON.parse(payloadJson) as LarkSignaturePayload;
    signatureBuffer = base64UrlDecode(parts[1]);
  } catch {
    return failure(401, 'MALFORMED_SIGNATURE', 'X-Base-Signature cannot be decoded.');
  }

  if (payload.source !== 'base' || payload.version !== 'v1') {
    return failure(403, 'INVALID_SIGNATURE_PAYLOAD', 'Signature payload is not from Lark Base.', payload);
  }

  const requestPackID = firstHeaderValue(input.packID);
  if (requestPackID && requestPackID !== payload.packID) {
    return failure(403, 'PACK_ID_MISMATCH', 'Request packID does not match signature payload.', payload);
  }

  if (payload.packID !== expectedPackID) {
    return failure(403, 'PACK_ID_NOT_ALLOWED', 'Signature packID is not allowed.', payload);
  }

  const now = input.now ?? Date.now();
  if (!Number.isFinite(payload.exp) || payload.exp < now) {
    return failure(403, 'SIGNATURE_EXPIRED', 'Signature is expired.', payload);
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payloadJson);
  verifier.end();

  const valid = verifier.verify(normalizePublicKey(input.publicKey), signatureBuffer);
  if (!valid) {
    return failure(403, 'INVALID_SIGNATURE', 'Signature verification failed.', payload);
  }

  return {
    ok: true,
    status: 200,
    code: 'OK',
    message: 'Signature verified.',
    payload,
  };
}

function failure(
  status: number,
  code: string,
  message: string,
  payload?: LarkSignaturePayload,
): VerifyLarkSignatureResult {
  return {
    ok: false,
    status,
    code,
    message,
    payload,
  };
}

function firstHeaderValue(value?: string | string[]): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}
