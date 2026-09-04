(function (root) {
  const SERVICE = 'http://127.0.0.1:4765';

  function createApi(options = {}) {
    const offlineMessage = options.offlineMessage || 'Serviço local desligado. Abra o OnFrame.';

    return async function api(path, requestOptions = {}) {
      if (canUseRuntimeBridge()) {
        return callViaRuntimeBridge(path, requestOptions, offlineMessage);
      }

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

  function canUseRuntimeBridge() {
    return Boolean(
      root.chrome &&
      root.chrome.runtime &&
      typeof root.chrome.runtime.sendMessage === 'function' &&
      root.chrome.runtime.id
    );
  }

  function callViaRuntimeBridge(path, requestOptions, offlineMessage) {
    return new Promise((resolve, reject) => {
      try {
        root.chrome.runtime.sendMessage({
          type: 'onframe:api',
          path,
          options: serializeRequestOptions(requestOptions)
        }, (response) => {
          const runtimeError = root.chrome.runtime.lastError;
          if (runtimeError) {
            const friendly = new Error(offlineMessage);
            friendly.technicalError = runtimeError.message || String(runtimeError);
            reject(friendly);
            return;
          }
          if (!response || response.ok !== true) {
            const friendly = new Error(response && response.error ? response.error : offlineMessage);
            friendly.status = response && response.status ? response.status : 0;
            friendly.code = response && response.code ? response.code : '';
            friendly.requestId = response && response.requestId ? response.requestId : '';
            friendly.technicalError = response && response.technicalError
              ? response.technicalError
              : (friendly.code || friendly.message);
            reject(friendly);
            return;
          }
          resolve(response.body || {});
        });
      } catch (err) {
        const friendly = new Error(offlineMessage);
        friendly.technicalError = err && err.message ? err.message : String(err);
        reject(friendly);
      }
    });
  }

  function serializeRequestOptions(requestOptions) {
    const options = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
    const serialized = {
      method: options.method || 'GET',
      headers: Object.assign({}, options.headers || {})
    };
    if (Object.prototype.hasOwnProperty.call(options, 'body')) {
      serialized.body = options.body;
    }
    return serialized;
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

  function setDisabledButtonTooltip(button, options = {}) {
    if (!button || !button.ownerDocument) return button;

    const disabled = Boolean(options.disabled);
    const wrapperClass = options.wrapperClass || 'onframe-section-edit-tooltip';
    const tooltipId = String(options.tooltipId || 'onframe-disabled-button-tooltip');
    const tooltipText = String(options.tooltipText || 'Esta ação não está disponível agora.');
    const label = String(options.label || button.textContent || '').trim();
    const document = button.ownerDocument;
    const parent = button.parentElement;
    const wrapper = parent && parent.classList.contains(wrapperClass) ? parent : null;

    button.disabled = disabled;
    if (!disabled) {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-describedby');
      if (wrapper) {
        removeDisabledButtonTooltip(wrapper);
        wrapper.replaceWith(button);
      }
      return button;
    }

    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-describedby', tooltipId);

    const tooltipWrapper = wrapper || document.createElement('span');
    if (!wrapper) {
      tooltipWrapper.className = `ob-tooltip ${wrapperClass}`;
      tooltipWrapper.dataset.placement = 'top';
      button.parentNode.insertBefore(tooltipWrapper, button);
      tooltipWrapper.appendChild(button);
    }

    tooltipWrapper.tabIndex = 0;
    tooltipWrapper.setAttribute('role', 'button');
    tooltipWrapper.setAttribute('aria-label', label);
    tooltipWrapper.setAttribute('aria-disabled', 'true');
    tooltipWrapper.setAttribute('aria-describedby', tooltipId);

    updateDisabledButtonTooltip(tooltipWrapper, {
      document,
      tooltipId,
      tooltipText
    });

    return button;
  }

  function updateDisabledButtonTooltip(wrapper, options) {
    const document = options.document;
    const window = document.defaultView;
    let state = wrapper.__onframeDisabledTooltip;

    if (!state) {
      const tooltip = document.createElement('span');
      tooltip.className = 'ob-tooltip-content onframe-floating-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltip);

      state = {
        tooltip,
        show: null,
        hide: null,
        reposition: null,
        window
      };
      state.show = () => {
        positionDisabledButtonTooltip(wrapper, state);
        tooltip.classList.add('is-open');
      };
      state.hide = () => tooltip.classList.remove('is-open');
      state.reposition = () => {
        if (tooltip.classList.contains('is-open')) positionDisabledButtonTooltip(wrapper, state);
      };
      wrapper.addEventListener('mouseenter', state.show);
      wrapper.addEventListener('mouseleave', state.hide);
      wrapper.addEventListener('focus', state.show);
      wrapper.addEventListener('blur', state.hide);
      if (window) {
        window.addEventListener('resize', state.reposition);
        window.addEventListener('scroll', state.reposition, true);
      }
      wrapper.__onframeDisabledTooltip = state;
    }

    state.tooltip.id = options.tooltipId;
    state.tooltip.textContent = options.tooltipText;
    const arrow = document.createElement('span');
    arrow.className = 'ob-tooltip-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    state.tooltip.appendChild(arrow);
  }

  function positionDisabledButtonTooltip(wrapper, state) {
    const tooltip = state.tooltip;
    const window = state.window;
    if (!wrapper.isConnected || !window) return;

    const gap = 8;
    const viewportPadding = 8;
    const anchor = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const placement = anchor.bottom + tooltipRect.height + gap <= window.innerHeight - viewportPadding ? 'bottom' : 'top';
    const left = Math.min(
      Math.max(viewportPadding, anchor.left + (anchor.width - tooltipRect.width) / 2),
      window.innerWidth - tooltipRect.width - viewportPadding
    );
    const top = placement === 'bottom'
      ? Math.min(anchor.bottom + gap, window.innerHeight - tooltipRect.height - viewportPadding)
      : Math.max(viewportPadding, anchor.top - tooltipRect.height - gap);

    tooltip.dataset.placement = placement;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function removeDisabledButtonTooltip(wrapper) {
    const state = wrapper && wrapper.__onframeDisabledTooltip;
    if (!state) return;
    wrapper.removeEventListener('mouseenter', state.show);
    wrapper.removeEventListener('mouseleave', state.hide);
    wrapper.removeEventListener('focus', state.show);
    wrapper.removeEventListener('blur', state.hide);
    if (state.window) {
      state.window.removeEventListener('resize', state.reposition);
      state.window.removeEventListener('scroll', state.reposition, true);
    }
    state.tooltip.remove();
    delete wrapper.__onframeDisabledTooltip;
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
    removeDisabledButtonTooltip,
    setBadge,
    setDisabledButtonTooltip,
    toUserError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
