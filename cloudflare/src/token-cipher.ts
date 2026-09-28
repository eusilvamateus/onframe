export type EncryptedValue = {
  authTag: string;
  ciphertext: string;
  iv: string;
};

const AES_GCM_IV_LENGTH = 12;
const AES_GCM_AUTH_TAG_LENGTH = 16;

export function base64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encryptValue(key: CryptoKey, value: string): Promise<EncryptedValue> {
  const iv = new Uint8Array(AES_GCM_IV_LENGTH);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(value);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const authTag = encrypted.slice(-AES_GCM_AUTH_TAG_LENGTH);
  const ciphertext = encrypted.slice(0, -AES_GCM_AUTH_TAG_LENGTH);

  return {
    authTag: base64Url(authTag),
    ciphertext: base64Url(ciphertext),
    iv: base64Url(iv)
  };
}

export async function decryptValue(key: CryptoKey, encrypted: EncryptedValue): Promise<string> {
  const ciphertext = base64UrlBytes(encrypted.ciphertext);
  const authTag = base64UrlBytes(encrypted.authTag);
  const payload = new Uint8Array(ciphertext.length + authTag.length);
  payload.set(ciphertext);
  payload.set(authTag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: base64UrlBytes(encrypted.iv)
  }, key, payload);
  return new TextDecoder().decode(plaintext);
}
