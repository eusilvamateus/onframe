(function (rootScope) {
  const EDITOR_VISIBLE_KEY = 'onframeEditorVisible';

  rootScope.OnFrameContentShell = {
    createShell
  };

  function createShell(services) {
    const Detection = services.Detection;
    const api = services.api;
    const toUserError = services.toUserError;
    const modules = Array.isArray(services.modules) ? services.modules : [];
    const syncDelayMs = Number(services.syncDelayMs || 350);
    const settleDelayMs = Number(services.settleDelayMs || 120);
    const maxSettleAttempts = Number(services.maxSettleAttempts || 6);
    let syncTimer = null;
    let observer = null;
    let syncRequestId = 0;
    let currentSignature = '';
    let currentContext = null;
    let activeModule = modules[0] || null;
    let editorVisible = true;
    let originalPushState = null;
    let originalReplaceState = null;
    const modulesById = new Map(modules.map((module) => [String(module.id || ''), module]).filter((entry) => entry[0]));

    async function start() {
      registerRuntimeMessages();
      bindStorageEvents();
      bindPageEvents();
      editorVisible = await readEditorVisibility();
      if (editorVisible && isProductPage()) startModules();
      if (editorVisible) schedulePageSync('start', { force: true, delay: 0 });
      if (!editorVisible) setModulesVisible(false);
      window.addEventListener('resize', scheduleRender);
    }

    function stop() {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
      if (observer) observer.disconnect();
      observer = null;
      restoreHistoryEvents();
      for (const module of modules) {
        if (module && typeof module.reset === 'function') module.reset();
      }
    }

    function schedulePageSync(reason = 'page', options = {}) {
      if (syncTimer) clearTimeout(syncTimer);
      const delay = options.delay === 0 ? 0 : Number(options.delay || syncDelayMs);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void syncPageState(reason, options);
      }, delay);
    }

    async function syncPageState(reason = 'page', options = {}) {
      const requestId = ++syncRequestId;
      if (!editorVisible) {
        setModulesVisible(false);
        return;
      }

      if (!isProductPage()) {
        currentSignature = '';
        currentContext = null;
        for (const module of modules) {
          if (shouldResetModule(module)) module.reset();
        }
        return;
      }

      if (!modules.length) return;

      const page = await waitForStableProductPage(requestId);
      if (!page || requestId !== syncRequestId) return;
      if (!options.force && page.signature === currentSignature && currentContext) {
        scheduleRender();
        return;
      }

      currentSignature = page.signature;
      notifyModules({
        status: 'loading',
        signature: page.signature,
        context: currentContext,
        reason
      });

      try {
        const context = await resolvePageContext({ page });
        if (requestId !== syncRequestId) return;
        currentContext = context;
        currentSignature = context && context.page && context.page.signature ? context.page.signature : page.signature;
        notifyModules({
          status: 'ready',
          signature: currentSignature,
          context,
          reason
        });
      } catch (err) {
        if (requestId !== syncRequestId) return;
        currentContext = null;
        notifyModules({
          status: 'error',
          signature: page.signature,
          error: toUserError(err),
          reason
        });
      }
    }

    function registerRuntimeMessages() {
      if (!window.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || typeof message.type !== 'string' || !message.type.startsWith('onframe:')) return false;

        handleRuntimeMessage(message)
          .then(sendResponse)
          .catch((err) => sendResponse({ ok: false, error: toUserError(err) }));
        return true;
      });
    }

    async function handleRuntimeMessage(message) {
      if (message.type === 'onframe:getModules') return { ok: true, modules: modules.map(summarizeModule) };
      if (message.type === 'onframe:setEditorVisibility') return setEditorVisibility(message.visible);
      if (message.type === 'onframe:getStatus' && !message.moduleId) return withShellVisibility(activeModule ? activeModule.getStatus() : getShellStatus());

      const targetModule = resolveMessageModule(message);
      if (!targetModule) return { ok: false, error: 'Módulo indisponível.' };
      if (message.type === 'onframe:getStatus') return withShellVisibility(targetModule.getStatus());
      if (message.type === 'onframe:showEditor') return targetModule.show();
      if (message.type === 'onframe:hideEditor') return targetModule.hide();
      if (message.type === 'onframe:reloadEditor') return reloadPageContext('manual');
      return { ok: false, error: 'Comando não reconhecido.' };
    }

    function resolveMessageModule(message) {
      const moduleId = String(message.moduleId || '');
      if (moduleId && modulesById.has(moduleId)) return modulesById.get(moduleId);
      return activeModule;
    }

    function summarizeModule(module) {
      return {
        id: module.id,
        label: module.label,
        active: activeModule === module
      };
    }

    function startModules() {
      for (const module of modules) {
        if (module && typeof module.start === 'function') module.start();
      }
    }

    async function setEditorVisibility(visible) {
      editorVisible = visible !== false;
      setModulesVisible(editorVisible);
      if (editorVisible) schedulePageSync('visibility', { force: true, delay: 0 });
      return getShellStatus();
    }

    function setModulesVisible(visible) {
      for (const module of modules) {
        if (!module) continue;
        if (visible) {
          if (!module.isLoaded() && !module.isBusy()) module.start();
          else if (typeof module.show === 'function') module.show();
          continue;
        }
        if (typeof module.hide === 'function') module.hide();
      }
    }

    function scheduleRender() {
      for (const module of modules) {
        if (module && typeof module.scheduleRender === 'function') module.scheduleRender();
      }
    }

    function notifyModules(update) {
      for (const module of modules) syncModule(module, update);
    }

    function syncModule(module, update) {
      if (!module) return;
      if (!module.isLoaded() && !module.isBusy() && typeof module.start === 'function') module.start();
      if (typeof module.handlePageContextChange === 'function') {
        module.handlePageContextChange(update);
        return;
      }

      if (update.status === 'ready') module.reload();
      else if (update.status === 'error' && typeof module.scheduleRender === 'function') module.scheduleRender();
    }

    function shouldResetModule(module) {
      if (!module) return false;
      const loaded = typeof module.isLoaded === 'function' && module.isLoaded();
      const hasContextOrError = typeof module.hasContextOrError === 'function' && module.hasContextOrError();
      return loaded || hasContextOrError;
    }

    function isProductPage() {
      return Detection.isProductPageUrl(location.href);
    }

    function getShellStatus() {
      return withShellVisibility({
        ok: true,
        isProductPage: isProductPage(),
        visible: editorVisible
      });
    }

    function withShellVisibility(status) {
      return Object.assign({}, status || {}, {
        ok: status && status.ok === false ? false : true,
        editorVisible
      });
    }

    function bindStorageEvents() {
      if (!window.chrome || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[EDITOR_VISIBLE_KEY]) return;
        void setEditorVisibility(changes[EDITOR_VISIBLE_KEY].newValue !== false);
      });
    }

    function bindPageEvents() {
      patchHistoryEvents();
      window.addEventListener('popstate', () => schedulePageSync('history'), true);
      document.addEventListener('click', handlePageInteraction, true);
      document.addEventListener('change', handlePageInteraction, true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') schedulePageSync('visible', { force: true });
      }, true);

      if (typeof MutationObserver !== 'function') return;
      observer = new MutationObserver((mutations) => {
        if (hasRelevantPageMutation(mutations)) schedulePageSync('mutation');
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'href', 'aria-checked', 'aria-pressed', 'data-testid', 'value']
      });
    }

    function patchHistoryEvents() {
      if (!window.history || originalPushState) return;
      originalPushState = history.pushState;
      originalReplaceState = history.replaceState;
      history.pushState = function onframePushState() {
        const result = originalPushState.apply(this, arguments);
        schedulePageSync('history');
        return result;
      };
      history.replaceState = function onframeReplaceState() {
        const result = originalReplaceState.apply(this, arguments);
        schedulePageSync('history');
        return result;
      };
    }

    function restoreHistoryEvents() {
      if (!originalPushState || !window.history) return;
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      originalPushState = null;
      originalReplaceState = null;
    }

    function handlePageInteraction(event) {
      if (isOnFrameNode(event.target)) return;
      const target = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[aria-checked], [aria-pressed], [data-testid], a[href*="attributes="], a[href*="product_trigger_id"], button')
        : null;
      if (target) schedulePageSync('interaction');
    }

    function hasRelevantPageMutation(mutations) {
      for (const mutation of mutations || []) {
        if (isOnFrameNode(mutation.target)) continue;
        const added = Array.from(mutation.addedNodes || []);
        const removed = Array.from(mutation.removedNodes || []);
        if (added.concat(removed).some((node) => !isOnFrameNode(node))) return true;
        if (mutation.type === 'attributes') return true;
      }
      return false;
    }

    function isOnFrameNode(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.id === 'onblide-ml-root') return true;
      if (typeof node.closest !== 'function') return false;
      return Boolean(node.closest('#onblide-ml-root, .onblide-ml-tray, .onframe-commerce-inline, .onframe-commerce-popover-root, .onblide-ml-dialog-root, .onframe-commerce-modal-root'));
    }

    function readEditorVisibility() {
      return new Promise((resolve) => {
        if (!window.chrome || !chrome.storage || !chrome.storage.local) {
          resolve(true);
          return;
        }
        chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => {
          resolve(result && result[EDITOR_VISIBLE_KEY] !== false);
        });
      });
    }

    function readPageSignature() {
      return Detection.createPageSignature(document, location.href);
    }

    async function resolvePageContext(options = {}) {
      const page = options.page || readProductPageContext();
      const context = await api('/api/resolve', {
        method: 'POST',
        body: JSON.stringify({
          url: page.url,
          html: '',
          pageIdentity: page.pageIdentity,
          itemCandidates: page.itemCandidates,
          userProductCandidates: page.userProductCandidates
        })
      });
      return enrichProductContext(context, page);
    }

    async function reloadPageContext(reason = 'manual') {
      schedulePageSync(reason, { force: true, delay: 0 });
      return activeModule ? activeModule.getStatus() : getShellStatus();
    }

    async function waitForStableProductPage(requestId) {
      let previous = readProductPageContext();
      for (let attempt = 0; attempt < maxSettleAttempts; attempt += 1) {
        await delay(settleDelayMs);
        if (requestId !== syncRequestId) return null;
        if (!isProductPage()) return null;
        const current = readProductPageContext();
        if (current.signature === previous.signature) return current;
        previous = current;
      }
      return previous;
    }

    function readProductPageContext() {
      const url = location.href;
      const pageIdentity = Detection.collectPageIdentity(document, url, { includeScripts: false });
      const itemCandidates = Detection.collectItemIdCandidatesFromPage(document, url, { includeScripts: false });
      const userProductCandidates = Detection.collectUserProductCandidatesFromPage(document, url, { includeScripts: false });
      return {
        url,
        signature: readPageSignature(),
        pageIdentity,
        itemCandidates,
        userProductCandidates
      };
    }

    function enrichProductContext(context, page) {
      const source = context || {};
      const item = source.item || {};
      const selectedVariationId = Detection.inferSelectedVariationId(source.variations || [], document, page.url);
      return Object.assign({}, source, {
        page,
        selectedVariationId,
        limits: source.pictureLimits || {},
        permissions: {
          picturesEditable: item.picturesEditable !== false,
          pictureEditability: item.pictureEditability || null
        }
      });
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    return {
      reloadPageContext,
      resolvePageContext,
      start,
      stop
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
