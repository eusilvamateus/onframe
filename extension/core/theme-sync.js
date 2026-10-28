(function (root, factory) {
  const themeSync = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = themeSync;
  else root.OnFrameThemeSync = themeSync;
  themeSync.start();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const STORAGE_KEY = 'onframeThemePreference';
  const ATTRIBUTE = 'data-onframe-theme';
  const DARK_QUERY = '(prefers-color-scheme: dark)';
  const PREFERENCES = new Set(['light', 'dark', 'system']);
  let preference = 'system';
  let started = false;
  let mediaQuery = null;

  function start() {
    if (started || !root || !root.document || !root.document.documentElement) return;
    started = true;
    mediaQuery = typeof root.matchMedia === 'function' ? root.matchMedia(DARK_QUERY) : null;
    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    }
    if (root.chrome && root.chrome.storage && root.chrome.storage.onChanged) {
      root.chrome.storage.onChanged.addListener(handleStorageChange);
    }
    apply();
    readPreference();
  }

  function stop() {
    if (!started) return;
    if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }
    if (root.chrome && root.chrome.storage && root.chrome.storage.onChanged) {
      root.chrome.storage.onChanged.removeListener(handleStorageChange);
    }
    root.document.documentElement.removeAttribute(ATTRIBUTE);
    mediaQuery = null;
    started = false;
  }

  function readPreference() {
    if (!root.chrome || !root.chrome.storage || !root.chrome.storage.local) return;
    root.chrome.storage.local.get({ [STORAGE_KEY]: 'system' }, (result) => {
      const value = result && result[STORAGE_KEY];
      preference = PREFERENCES.has(value) ? value : 'system';
      apply();
    });
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || !changes || !changes[STORAGE_KEY]) return;
    const value = changes[STORAGE_KEY].newValue;
    preference = PREFERENCES.has(value) ? value : 'system';
    apply();
  }

  function handleSystemThemeChange() {
    if (preference === 'system') apply();
  }

  function resolve() {
    if (preference !== 'system') return preference;
    return mediaQuery && mediaQuery.matches ? 'dark' : 'light';
  }

  function apply() {
    if (!root.document || !root.document.documentElement) return;
    root.document.documentElement.setAttribute(ATTRIBUTE, resolve());
  }

  function getState() {
    return { preference, resolved: resolve() };
  }

  return Object.freeze({ start, stop, getState, STORAGE_KEY, ATTRIBUTE });
});
