import assert from 'node:assert/strict';
import test from 'node:test';
import { storageObjectUrl, storagePublicObjectPath, storageUploadFailureCode } from '../src/avatar-storage.ts';

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

test('recupera somente o caminho de uma URL pública do bucket esperado', () => {
  assert.equal(
    storagePublicObjectPath(
      'https://project.supabase.co/',
      'onframe-avatars',
      'https://project.supabase.co/storage/v1/object/public/onframe-avatars/usr_abc/avatar%20file.jpg'
    ),
    'usr_abc/avatar file.jpg'
  );
  assert.equal(
    storagePublicObjectPath('https://project.supabase.co', 'onframe-avatars', 'https://outside.example/avatar.jpg'),
    null
  );
});

test('classifica a indisponibilidade do bucket sem expor a resposta do Storage', () => {
  assert.equal(storageUploadFailureCode(400, { message: 'Bucket not found' }), 'avatar_storage_bucket_unavailable');
  assert.equal(storageUploadFailureCode(403, {}), 'avatar_storage_authorization_failed');
  assert.equal(storageUploadFailureCode(413, {}), 'avatar_too_large');
  assert.equal(storageUploadFailureCode(500, {}), 'avatar_storage_unavailable');
});
