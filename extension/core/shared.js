(function (root) {
  const SERVICE = 'http://127.0.0.1:4765';

  function createApi(options = {}) {
    const offlineMessage = options.offlineMessage || 'Serviço local desligado. Abra o OnFrame.';

    return async function api(path, requestOptions = {}) {
      let response;
      try {
        response = await fetch(`${SERVICE}${path}`, Object.assign({
          headers: { 'content-type': 'application/json' }
        }, requestOptions));
      } catch (err) {
        const friendly = new Error(offlineMessage);
        friendly.technicalError = err && err.message ? err.message : String(err);
        throw friendly;
      }

      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const err = new Error(body.error || `Falha na ação. Código ${response.status}.`);
        err.status = response.status;
        err.technicalError = body.technicalError || body.error || `HTTP ${response.status}`;
        throw err;
      }
      return body;
    };
  }

  function toUserError(err, options = {}) {
    if (err && err.technicalError && options.logPrefix && isDebugLoggingEnabled()) {
      try {
        if (root.console && typeof root.console.warn === 'function') {
          root.console.warn(options.logPrefix, err.technicalError);
        }
      } catch (e) {
        // Debug logging must never become a user-facing extension error.
      }
    }
    return err && err.message ? err.message : 'Não consegui concluir. Tente de novo.';
  }

  function isDebugLoggingEnabled() {
    try {
      return Boolean(root.localStorage && root.localStorage.getItem('onframeDebug') === '1');
    } catch (e) {
      return false;
    }
  }

  function setBadge(element, text, tone) {
    if (!element) return;
    element.textContent = text;
    element.className = `ob-badge ${badgeTone(tone)}`;
  }

  function addIcon(button, name, size = 16) {
    if (!button || !root.OnblideIcons || button.dataset.iconReady) return;
    button.insertAdjacentHTML('afterbegin', root.OnblideIcons.render(name, size));
    button.dataset.iconReady = 'true';
  }

  function badgeTone(tone) {
    if (tone === 'ok') return 'green';
    if (tone === 'warn') return 'orange';
    if (tone === 'error') return 'red';
    if (tone === 'blue') return 'blue';
    return 'grey';
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  root.OnFrameShared = {
    SERVICE,
    addIcon,
    badgeTone,
    createApi,
    escapeAttribute,
    escapeHtml,
    isDebugLoggingEnabled,
    setBadge,
    toUserError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
