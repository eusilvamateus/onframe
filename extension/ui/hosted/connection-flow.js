export function readConnectionContext(urlValue) {
  const url = new URL(urlValue);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return {
    flow: url.searchParams.get('flow') || '',
    accessToken: fragment.get('access_token') || '',
    refreshToken: fragment.get('refresh_token') || '',
    type: fragment.get('type') || ''
  };
}

export function clearConnectionFragment() {
  history.replaceState(null, document.title, location.pathname + location.search);
}

export function secondFactorUrl(origin, context) {
  const target = new URL('/auth/passkeys', origin);
  target.searchParams.set('action', 'verify');
  target.searchParams.set('flow', context.flow);
  target.hash = new URLSearchParams({
    access_token: context.accessToken,
    refresh_token: context.refreshToken
  }).toString();
  return target.toString();
}
