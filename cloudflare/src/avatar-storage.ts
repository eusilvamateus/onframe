function storageErrorText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const response = value as Record<string, unknown>;
  return [response.error, response.code, response.message]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
}

export function storageObjectUrl(origin: string, bucketId: string, objectPath: string, publicObject = false): string {
  const route = publicObject ? 'public/' : '';
  const encodedPath = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${origin.replace(/\/+$/u, '')}/storage/v1/object/${route}${encodeURIComponent(bucketId)}/${encodedPath}`;
}

export function storagePublicObjectPath(origin: string, bucketId: string, publicUrl: string): string | null {
  try {
    const base = new URL(origin);
    const object = new URL(publicUrl);
    const prefix = `/storage/v1/object/public/${encodeURIComponent(bucketId)}/`;
    if (object.origin !== base.origin || !object.pathname.startsWith(prefix)) return null;
    return object.pathname.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

export function storageUploadFailureCode(status: number, payload: unknown): string {
  const detail = storageErrorText(payload);
  if (/bucket\s+not\s+found|not\s+found\s+bucket/u.test(detail) || status === 404) {
    return 'avatar_storage_bucket_unavailable';
  }
  if (status === 401 || status === 403) return 'avatar_storage_authorization_failed';
  if (status === 413) return 'avatar_too_large';
  if (status === 415) return 'invalid_avatar';
  if (status >= 500) return 'avatar_storage_unavailable';
  return 'avatar_upload_failed';
}
