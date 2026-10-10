import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptValue, encryptValue, importAesGcmKeyBase64 } from '../src/token-cipher.ts';

test('importa uma chave AES-256 em Base64 sem expor seu material', async () => {
  const key = await importAesGcmKeyBase64('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  const encrypted = await encryptValue(key, 'credencial do Mercado Livre');
  assert.equal(await decryptValue(key, encrypted), 'credencial do Mercado Livre');
});

test('recusa uma chave Base64 que não tenha 32 bytes', async () => {
  await assert.rejects(importAesGcmKeyBase64('AAAAAAAAAAAAAAAAAAAAAA=='));
});
