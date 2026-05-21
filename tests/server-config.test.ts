import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../backend/server';

test('loadConfig reads LARK_BASE_PUBLIC_KEY and normalizes escaped newlines', () => {
  const config = loadConfig({
    PORT: '9999',
    LARK_EXPECTED_PACK_ID: 'replit_test',
    LARK_SIGNATURE_VERIFY: 'true',
    RATE_CACHE_TTL_MS: '123',
    LARK_BASE_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----',
  });

  assert.equal(config.port, 9999);
  assert.equal(config.expectedPackID, 'replit_test');
  assert.equal(config.verifySignature, true);
  assert.equal(config.cacheTtlMs, 123);
  assert.equal(config.basePublicKey, '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----');
});
