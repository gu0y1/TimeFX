import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { verifyLarkSignature } from '../backend/lark-signature';

const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

test('verifyLarkSignature accepts a valid signed payload', () => {
  const signature = signPayload({
    source: 'base',
    version: 'v1',
    packID: 'replit_test',
    exp: 2000,
  });

  const result = verifyLarkSignature({
    signature,
    packID: 'replit_test',
    expectedPackID: 'replit_test',
    now: 1000,
    publicKey,
  });

  assert.equal(result.ok, true);
});

test('verifyLarkSignature rejects mismatched packID', () => {
  const signature = signPayload({
    source: 'base',
    version: 'v1',
    packID: 'replit_other',
    exp: 2000,
  });

  const result = verifyLarkSignature({
    signature,
    expectedPackID: 'replit_test',
    now: 1000,
    publicKey,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, 'PACK_ID_NOT_ALLOWED');
});

test('verifyLarkSignature rejects expired signatures', () => {
  const signature = signPayload({
    source: 'base',
    version: 'v1',
    packID: 'replit_test',
    exp: 999,
  });

  const result = verifyLarkSignature({
    signature,
    expectedPackID: 'replit_test',
    now: 1000,
    publicKey,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, 'SIGNATURE_EXPIRED');
});

function signPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  const signature = crypto.sign('RSA-SHA256', Buffer.from(json, 'utf8'), keyPair.privateKey);
  return `${toBase64Url(Buffer.from(json, 'utf8'))}.${toBase64Url(signature)}`;
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
