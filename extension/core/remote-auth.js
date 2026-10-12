(function () {
  const REMOTE_SERVICE = 'https://onframe.onblide.com';
  const SUPABASE_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co$/u;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return EMAIL_PATTERN.test(email) ? email : '';
  }

  async function loadConfig() {
    const response = await fetch(`${REMOTE_SERVICE}/v1/auth/config`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit'
    });
    const payload = await response.json().catch(() => ({}));
    const supabaseUrl = String(payload && payload.supabaseUrl || '');
    const supabasePublishableKey = String(payload && payload.supabasePublishableKey || '');
    if (!response.ok || !SUPABASE_ORIGIN_PATTERN.test(supabaseUrl) || !supabasePublishableKey) {
      throw new Error('Não foi possível preparar o acesso ao OnFrame.');
    }
    return { supabaseUrl, supabasePublishableKey, emailOtpLength: payload.emailOtpLength === 8 ? 8 : 6, capabilities: { accountSecurity: payload.capabilities?.accountSecurity === 1 } };
  }

  async function request(config, path, body, options = {}) {
    const url = new URL(`/auth/v1/${path}`, config.supabaseUrl);
    if (options.redirectTo) url.searchParams.set('redirect_to', options.redirectTo);
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        authorization: `Bearer ${options.accessToken || config.supabasePublishableKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || payload.error_description || payload.error || 'auth_request_failed');
      error.code = payload.code || payload.error || 'auth_request_failed';
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function randomNonce() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function isChallengeAvailable() {
    const response = await fetch(`${REMOTE_SERVICE}/auth/challenge`, {
      headers: { accept: 'text/html' },
      cache: 'no-store',
      credentials: 'omit'
    });
    const contentType = String(response.headers.get('content-type') || '');
    return response.ok && /^text\/html(?:;|$)/iu.test(contentType);
  }

  function createChallenge(container, onChange, onUnavailable = () => {}) {
    let frame = null;
    let nonce = '';
    let token = '';
    let available = false;
    let loading = false;
    let destroyed = false;
    let mountId = 0;
    let widgetReady = false;
    let pending = null;

    function challengeError() {
      const error = new Error('A confirmação de segurança está indisponível. Tente novamente.');
      error.code = 'captcha_unavailable';
      return error;
    }

    function settle(error, value) {
      if (!pending) return;
      const request = pending;
      pending = null;
      clearTimeout(request.timer);
      if (error) request.reject(error);
      else request.resolve(value);
    }

    function requestToken() {
      if (widgetReady && frame && pending) {
        frame.contentWindow.postMessage({ type: 'onframe:turnstile:execute', nonce }, REMOTE_SERVICE);
      }
    }

    function clear(nextToken = '') {
      token = nextToken;
      onChange(token);
    }

    function unmountUnavailable() {
      settle(challengeError());
      available = false;
      loading = false;
      widgetReady = false;
      clear();
      if (frame) frame.remove();
      frame = null;
      container.replaceChildren();
      container.hidden = true;
      onUnavailable();
    }

    function onMessage(event) {
      if (event.origin !== REMOTE_SERVICE || !frame || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'onframe:turnstile' || data.nonce !== nonce) return;
      if (data.status === 'ready') {
        widgetReady = true;
        requestToken();
        return;
      }
      if (data.status === 'interaction') {
        container.dataset.interactive = 'true';
        return;
      }
      if (data.status === 'idle') {
        delete container.dataset.interactive;
        return;
      }
      if (data.token) {
        clear(String(data.token));
        settle(null, token);
        return;
      }
      if (data.status === 'error') {
        unmountUnavailable();
        return;
      }
      clear();
    }

    async function mount() {
      settle(challengeError());
      clear();
      available = false;
      loading = true;
      widgetReady = false;
      delete container.dataset.interactive;
      if (frame) frame.remove();
      frame = null;
      container.replaceChildren();
      container.hidden = true;
      const currentMountId = ++mountId;

      try {
        if (!await isChallengeAvailable() || destroyed || currentMountId !== mountId) {
          if (!destroyed && currentMountId === mountId) unmountUnavailable();
          return;
        }
      } catch (_) {
        if (!destroyed && currentMountId === mountId) unmountUnavailable();
        return;
      }

      nonce = randomNonce();
      available = true;
      loading = false;
      frame = document.createElement('iframe');
      frame.className = 'ob-auth-challenge-frame';
      frame.title = 'Confirmação de segurança';
      frame.src = `${REMOTE_SERVICE}/auth/challenge?nonce=${encodeURIComponent(nonce)}&parentOrigin=${encodeURIComponent(window.location.origin)}`;
      frame.setAttribute('scrolling', 'no');
      container.replaceChildren(frame);
      container.hidden = false;
    }

    window.addEventListener('message', onMessage);
    let mountPromise = mount();
    return {
      getToken: () => token,
      isAvailable: () => available,
      isLoading: () => loading,
      execute: async () => {
        if (!destroyed && !available && !loading) mountPromise = mount();
        await mountPromise;
        if (destroyed || !available || !frame) throw challengeError();
        if (token) return token;
        if (pending) return pending.promise;
        let resolve;
        let reject;
        const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
        const timer = setTimeout(() => unmountUnavailable(), 60000);
        pending = { promise, resolve, reject, timer };
        requestToken();
        return promise;
      },
      reset: () => { mountPromise = mount(); },
      destroy: () => {
        destroyed = true;
        loading = false;
        mountId += 1;
        settle(challengeError());
        window.removeEventListener('message', onMessage);
        if (frame) frame.remove();
        container.replaceChildren();
        container.hidden = true;
        delete container.dataset.interactive;
      }
    };
  }

  function authErrorMessage(error, fallback) {
    const code = String(error && error.code || '');
    const status = Number(error && error.status || 0);
    if (code === 'weak_password') return 'Escolha uma senha mais forte.';
    if (code === 'captcha_failed') return 'A confirmação de segurança expirou. Tente novamente.';
    if (code === 'captcha_unavailable') return 'A confirmação de segurança está indisponível. Tente novamente.';
    if (code === 'email_not_confirmed') return 'Confirme seu e-mail para continuar.';
    if (code === 'over_email_send_rate_limit' || status === 429) return 'Aguarde um minuto antes de solicitar outro código.';
    if (status >= 500) return 'O serviço de autenticação está indisponível. Tente novamente em instantes.';
    if (code === 'auth_request_failed' && status) return `${fallback} (HTTP ${status})`;
    return fallback;
  }

  window.OnFrameRemoteAuth = {
    authErrorMessage,
    createChallenge,
    loadConfig,
    normalizeEmail,
    request
  };
})();
