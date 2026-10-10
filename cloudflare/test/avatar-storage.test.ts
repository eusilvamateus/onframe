import assert from 'node:assert/strict';
import test from 'node:test';
import { storageObjectUrl, storageUploadFailureCode } from '../src/avatar-storage.ts';

test('preserva a estrutura do caminho de objeto do Storage', () => {
  const url = storageObjectUrl(
    'https://project.supabase.co/',
    'onframe-avatars',
    'usr_abc/avatar file.jpg'
  );
  assert.equal(
    url,
    'https://project.supabase.co/storage/v1/object/onframe-avatars/usr_abc/avatar%20file.jpg'
  );
});

test('classifica a indisponibilidade do bucket sem expor a resposta do Storage', () => {
  assert.equal(storageUploadFailureCode(400, { message: 'Bucket not found' }), 'avatar_storage_bucket_unavailable');
  assert.equal(storageUploadFailureCode(403, {}), 'avatar_storage_authorization_failed');
  assert.equal(storageUploadFailureCode(413, {}), 'avatar_too_large');
  assert.equal(storageUploadFailureCode(500, {}), 'avatar_storage_unavailable');
});
