(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameContextStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_STATE = Object.freeze({
    surface: 'unsupported',
    targetKey: '',
    page: null,
    context: null,
    phase: 'idle',
    stale: false,
    revalidating: false,
    targetChanged: false,
    error: '',
    reason: 'start',
    revision: 0,
    updatedAt: 0
  });

  function createStore(initialState = {}) {
    let state = freezeState(Object.assign({}, DEFAULT_STATE, initialState));
    const listeners = new Set();

    function getState() {
      return state;
    }

    function publish(patch) {
      state = freezeState(Object.assign({}, state, patch || {}));
      for (const listener of Array.from(listeners)) listener(state);
      return state;
    }

    function subscribe(listener, options = {}) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      if (options.immediate !== false) listener(state);
      return () => listeners.delete(listener);
    }

    return { getState, publish, subscribe };
  }

  function createRepository(options = {}) {
    const api = options.api;
    const ttlMs = Number(options.ttlMs || 60 * 1000);
    const maxEntries = Number(options.maxEntries || 200);
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const cache = new Map();
    const inFlight = new Map();

    function get(targetKey) {
      const entry = cache.get(String(targetKey || '')) || null;
      if (!entry) return null;
      touch(targetKey, entry);
      return entry;
    }

    function isFresh(entry) {
      return Boolean(entry && entry.updatedAt && now() - entry.updatedAt < ttlMs);
    }

    function setQuick(targetKey, context) {
      return set(targetKey, { quick: context });
    }

    function setFull(targetKey, context) {
      return set(targetKey, { quick: context, full: context, updatedAt: now() });
    }

    function set(targetKey, patch) {
      const key = String(targetKey || '');
      const current = cache.get(key) || { quick: null, full: null, updatedAt: 0 };
      const entry = Object.assign({}, current, patch || {});
      cache.delete(key);
      cache.set(key, entry);
      trim();
      return entry;
    }

    function resolveQuick(targetKey, body) {
      return request(`quick:${targetKey}`, '/api/resolve/quick', body);
    }

    function resolveFull(targetKey, body) {
      return request(`full:${targetKey}`, '/api/resolve', body);
    }

    function request(key, path, body) {
      if (inFlight.has(key)) return inFlight.get(key);
      const promise = api(path, {
        method: 'POST',
        body: JSON.stringify(body)
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    }

    function invalidate(targetKey) {
      const entry = cache.get(String(targetKey || ''));
      if (entry) entry.updatedAt = 0;
    }

    function clear() {
      cache.clear();
      inFlight.clear();
    }

    function touch(targetKey, entry) {
      const key = String(targetKey || '');
      cache.delete(key);
      cache.set(key, entry);
    }

    function trim() {
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }

    return {
      clear,
      get,
      invalidate,
      isFresh,
      resolveFull,
      resolveQuick,
      setFull,
      setQuick
    };
  }

  function freezeState(state) {
    return Object.freeze(state);
  }

  function toModuleUpdate(state) {
    const snapshot = state || DEFAULT_STATE;
    return {
      status: snapshot.surface === 'pdp' ? snapshot.phase : 'not_product',
      signature: snapshot.page && snapshot.page.signature ? snapshot.page.signature : '',
      context: snapshot.context,
      surface: snapshot.surface,
      targetKey: snapshot.targetKey,
      targetChanged: snapshot.targetChanged,
      stale: snapshot.stale,
      revalidating: snapshot.revalidating,
      error: snapshot.error,
      reason: snapshot.reason,
      revision: snapshot.revision
    };
  }

  return { createRepository, createStore, toModuleUpdate };
});
