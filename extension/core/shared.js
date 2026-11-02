(function (root) {

  function createApi(options = {}) {
    const offlineMessage = options.offlineMessage || 'Entre na extensão do OnFrame para continuar.';

    return async function api(path, requestOptions = {}) {
      if (canUseRuntimeBridge()) {
        return callViaRuntimeBridge(path, requestOptions, offlineMessage);
      }
      const friendly = new Error(offlineMessage);
      friendly.technicalError = 'extension_runtime_unavailable';
      throw friendly;
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

  root.OnFrameShared = {
    createApi,
    isDebugLoggingEnabled,
    toUserError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
