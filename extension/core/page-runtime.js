(function (rootScope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else rootScope.OnFramePageRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EDITOR_VISIBLE_KEY = 'onframeEditorVisible';
  const NAVIGATION_EVENT = 'onframe:navigation';

  function createRuntime(services) {
    const Detection = services.Detection;
    const store = services.store;
    const repository = services.repository;
    const hosts = services.hosts;
    const toUserError = services.toUserError;
    const modules = Array.isArray(services.modules) ? services.modules : [];
    const windowRef = services.window || window;
    const documentRef = services.document || document;
    const syncDelayMs = Number(services.syncDelayMs || 120);
    const modulesById = new Map(modules.map((module) => [String(module.id || ''), module]).filter(([id]) => id));
    let activeModule = modules[0] || null;
    let editorVisible = true;
    let syncTimer = null;
    let rootObserver = null;
    let surfaceObserver = null;
    let productRoot = null;
    let requestRevision = 0;
    let started = false;

    async function start() {
      if (started) return;
      started = true;
      hosts.ensureRoot();
      registerRuntimeMessages();
      bindStorageEvents();
      bindPageEvents();
      for (const module of modules) module.start();
      editorVisible = await readEditorVisibility();
      if (!editorVisible) setModulesVisible(false);
      if (editorVisible) scheduleSync('start', { delay: 0 });
    }

    function stop() {
      started = false;
      requestRevision += 1;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
      if (rootObserver) rootObserver.disconnect();
      if (surfaceObserver) surfaceObserver.disconnect();
      rootObserver = null;
      surfaceObserver = null;
      productRoot = null;
      windowRef.removeEventListener(NAVIGATION_EVENT, handleNavigation, true);
      windowRef.removeEventListener('popstate', handleNavigation, true);
      windowRef.removeEventListener('hashchange', handleNavigation, true);
      windowRef.removeEventListener('resize', handleResize);
      documentRef.removeEventListener('click', handlePageInteraction, true);
      documentRef.removeEventListener('change', handlePageInteraction, true);
      documentRef.removeEventListener('visibilitychange', handleVisibility, true);
      for (const module of modules) module.stop();
      repository.clear();
      hosts.stop();
    }

    function scheduleSync(reason = 'page', options = {}) {
      if (!started || !editorVisible) return;
      if (syncTimer) clearTimeout(syncTimer);
      const delay = options.delay === 0 ? 0 : Number(options.delay || syncDelayMs);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void sync(reason, options);
      }, delay);
    }

    async function sync(reason = 'page', options = {}) {
      if (!editorVisible) return;
      hosts.ensureRoot();
      const page = Detection.createPageSnapshot(documentRef, windowRef.location.href);
      bindSurfaceObserver(page.surface);
      const previous = store.getState();
      const targetChanged = page.targetKey !== previous.targetKey || page.surface !== previous.surface;

      if (page.surface !== 'pdp') {
        requestRevision += 1;
        if (targetChanged || previous.page === null) {
          store.publish({
            surface: page.surface,
            targetKey: page.targetKey,
            page,
            context: null,
            phase: 'idle',
            stale: false,
            revalidating: false,
            targetChanged,
            error: '',
            reason,
            revision: requestRevision,
            updatedAt: 0
          });
        } else {
          refreshLayouts();
        }
        return;
      }

      if (!targetChanged && previous.context && !options.force) {
        const cached = repository.get(page.targetKey);
        if (reason === 'visible' && cached && !repository.isFresh(cached)) {
          await loadContext(page, reason, { revalidate: true });
        } else {
          store.publish({ page, targetChanged: false, reason });
          refreshLayouts();
        }
        return;
      }

      if (targetChanged) {
        requestRevision += 1;
        store.publish({
          surface: 'pdp',
          targetKey: page.targetKey,
          page,
          context: null,
          phase: 'identifying',
          stale: false,
          revalidating: false,
          targetChanged: true,
          error: '',
          reason,
          revision: requestRevision,
          updatedAt: 0
        });
      }

      await loadContext(page, reason, {
        force: options.force === true,
        revalidate: !targetChanged
      });
    }

    async function loadContext(page, reason, options = {}) {
      const revision = requestRevision;
      const cached = repository.get(page.targetKey);
      const cachedContext = cached && (cached.full || cached.quick);
      const fresh = !options.force && cached && cached.full && repository.isFresh(cached);

      if (cachedContext) {
        publishContext(cached.full ? 'ready' : 'quick-ready', cachedContext, page, {
          stale: !fresh,
          revalidating: !fresh,
          targetChanged: false,
          reason,
          revision,
          updatedAt: cached.updatedAt || 0
        });
      }
      if (fresh) return cached.full;

      let quickContext = cachedContext || null;
      try {
        if (!quickContext) {
          try {
            quickContext = enrichContext(await repository.resolveQuick(page.targetKey, resolveBody(page)), page);
            if (!isCurrent(page.targetKey, revision)) return null;
            repository.setQuick(page.targetKey, quickContext);
            publishContext('quick-ready', quickContext, page, {
              stale: false,
              revalidating: true,
              targetChanged: false,
              reason,
              revision
            });
          } catch (err) {
            if (!shouldFallbackToFullResolve(err)) throw err;
          }
        }

        const fullBody = resolveBody(page, quickContext);
        const context = enrichContext(await repository.resolveFull(page.targetKey, fullBody), page);
        if (!isCurrent(page.targetKey, revision)) return null;
        const entry = repository.setFull(page.targetKey, context);
        publishContext('ready', context, page, {
          stale: false,
          revalidating: false,
          targetChanged: false,
          error: '',
          reason,
          revision,
          updatedAt: entry.updatedAt
        });
        return context;
      } catch (err) {
        if (!isCurrent(page.targetKey, revision)) return null;
        const error = toUserError(err);
        if (cachedContext || quickContext) {
          publishContext(cached && cached.full ? 'ready' : 'hydration-error', cachedContext || quickContext, page, {
            stale: true,
            revalidating: false,
            targetChanged: false,
            error,
            reason,
            revision
          });
          return cachedContext || quickContext;
        }
        store.publish({
          surface: 'pdp',
          targetKey: page.targetKey,
          page,
          context: null,
          phase: 'error',
          stale: false,
          revalidating: false,
          targetChanged: false,
          error,
          reason,
          revision
        });
        return null;
      }
    }

    function publishContext(phase, context, page, patch = {}) {
      store.publish(Object.assign({
        surface: 'pdp',
        targetKey: page.targetKey,
        page,
        context,
        phase,
        targetChanged: false,
        error: '',
        reason: 'page',
        revision: requestRevision,
        updatedAt: Date.now()
      }, patch));
    }

    function resolveBody(page, quickContext) {
      const ownerAccount = quickContext && quickContext.ownerAccount;
      return {
        url: page.url,
        html: '',
        ownerUserId: ownerAccount && ownerAccount.user_id ? ownerAccount.user_id : undefined,
        pageIdentity: page.pageIdentity,
        itemCandidates: page.itemCandidates,
        userProductCandidates: page.userProductCandidates
      };
    }

    function enrichContext(context, page) {
      const source = context || {};
      const item = source.item || {};
      return Object.assign({}, source, {
        page,
        selectedVariationId: Detection.inferSelectedVariationId(source.variations || [], documentRef, page.url),
        limits: source.pictureLimits || {},
        permissions: {
          picturesEditable: item.picturesEditable !== false,
          pictureEditability: item.pictureEditability || null
        }
      });
    }

    function isCurrent(targetKey, revision) {
      const current = store.getState();
      return current.targetKey === targetKey && requestRevision === revision;
    }

    function shouldFallbackToFullResolve(err) {
      const status = Number(err && (err.status || err.statusCode) ? (err.status || err.statusCode) : 0);
      return ![400, 401, 403, 409].includes(status);
    }

    async function reload(reason = 'manual') {
      const current = store.getState();
      if (current.targetKey) repository.invalidate(current.targetKey);
      await sync(reason, { force: true });
      return activeModule ? activeModule.getStatus() : getRuntimeStatus();
    }

    function invalidate(reason = 'mutation') {
      const current = store.getState();
      if (current.targetKey) repository.invalidate(current.targetKey);
      scheduleSync(reason, { force: true, delay: 0 });
    }

    function bindPageEvents() {
      windowRef.addEventListener(NAVIGATION_EVENT, handleNavigation, true);
      windowRef.addEventListener('popstate', handleNavigation, true);
      windowRef.addEventListener('hashchange', handleNavigation, true);
      windowRef.addEventListener('resize', handleResize);
      documentRef.addEventListener('click', handlePageInteraction, true);
      documentRef.addEventListener('change', handlePageInteraction, true);
      documentRef.addEventListener('visibilitychange', handleVisibility, true);
      bindRootObserver();
    }

    function bindRootObserver() {
      if (typeof MutationObserver !== 'function' || !documentRef.body) return;
      rootObserver = new MutationObserver((mutations) => {
        hosts.ensureRoot();
        if (productRoot && productRoot.isConnected) return;
        if (mutations.some(hasPageRootCandidate)) scheduleSync('anchor');
      });
      rootObserver.observe(documentRef.body, { childList: true, subtree: true });
    }

    function bindSurfaceObserver(surface) {
      if (surfaceObserver) surfaceObserver.disconnect();
      surfaceObserver = null;
      productRoot = surface === 'pdp' ? findProductRoot() : null;
      if (!productRoot || typeof MutationObserver !== 'function') return;
      surfaceObserver = new MutationObserver((mutations) => {
        if (mutations.some(hasVariationMutation)) scheduleSync('variation');
      });
      surfaceObserver.observe(productRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-checked', 'aria-pressed', 'data-testid']
      });
    }

    function findProductRoot() {
      return documentRef.querySelector('#ui-pdp-main-container, .ui-pdp-container--pdp, .ui-pdp');
    }

    function hasPageRootCandidate(mutation) {
      return Array.from(mutation.addedNodes || []).some((node) => {
        if (!node || node.nodeType !== 1) return false;
        if (node.matches && node.matches('#ui-pdp-main-container, .ui-pdp-container--pdp, .ui-pdp')) return true;
        return Boolean(node.querySelector && node.querySelector('#ui-pdp-main-container, .ui-pdp-container--pdp, .ui-pdp'));
      });
    }

    function hasVariationMutation(mutation) {
      const target = mutation.target;
      if (isVariationNode(target)) return true;
      return Array.from(mutation.addedNodes || []).some(isVariationNode);
    }

    function isVariationNode(node) {
      if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return false;
      if (node.closest('#onblide-ml-root, .ui-pdp-gallery, video, [class*="vjs-"], [class*="carousel"], [class*="favorite" i]')) return false;
      return Boolean(node.closest('[data-testid*="variation"], [class*="variation"], [class*="picker"], [class*="attribute"]'));
    }

    function handlePageInteraction(event) {
      if (!productRoot || !event.target || !productRoot.contains(event.target)) return;
      if (event.target.closest && event.target.closest('#onblide-ml-root')) return;
      const control = event.target.closest && event.target.closest('[data-testid*="variation"], [class*="variation"], [class*="picker"], [class*="attribute"], a[href*="attributes="], a[href*="product_trigger_id"]');
      if (control) scheduleSync('interaction', { delay: 80 });
    }

    function handleNavigation() {
      scheduleSync('navigation', { delay: 0 });
    }

    function handleVisibility() {
      if (documentRef.visibilityState === 'visible') scheduleSync('visible', { delay: 0 });
    }

    function handleResize() {
      refreshLayouts();
    }

    function refreshLayouts() {
      for (const module of modules) {
        if (typeof module.refreshLayout === 'function') module.refreshLayout();
      }
    }

    function setModulesVisible(visible) {
      for (const module of modules) {
        if (visible) module.show();
        else module.hide();
      }
    }

    async function setEditorVisibility(visible) {
      editorVisible = visible !== false;
      if (!editorVisible) {
        setModulesVisible(false);
        return getRuntimeStatus();
      }
      await sync('visible');
      setModulesVisible(true);
      return getRuntimeStatus();
    }

    function registerRuntimeMessages() {
      if (!windowRef.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || typeof message.type !== 'string' || !message.type.startsWith('onframe:')) return false;
        handleRuntimeMessage(message).then(sendResponse).catch((err) => sendResponse({ ok: false, error: toUserError(err) }));
        return true;
      });
    }

    async function handleRuntimeMessage(message) {
      if (message.type === 'onframe:getModules') return { ok: true, modules: modules.map(summarizeModule) };
      if (message.type === 'onframe:setEditorVisibility') return setEditorVisibility(message.visible);
      if (message.type === 'onframe:getStatus' && !message.moduleId) return withVisibility(activeModule ? activeModule.getStatus() : getRuntimeStatus());
      const module = resolveMessageModule(message);
      if (!module) return { ok: false, error: 'Módulo indisponível.' };
      if (message.type === 'onframe:getStatus') return withVisibility(module.getStatus());
      if (message.type === 'onframe:showEditor') return module.show();
      if (message.type === 'onframe:hideEditor') return module.hide();
      if (message.type === 'onframe:reloadEditor') return reload('manual');
      return { ok: false, error: 'Comando não reconhecido.' };
    }

    function resolveMessageModule(message) {
      const moduleId = String(message.moduleId || '');
      if (moduleId && modulesById.has(moduleId)) return modulesById.get(moduleId);
      return activeModule;
    }

    function summarizeModule(module) {
      return { id: module.id, label: module.label, active: activeModule === module };
    }

    function getRuntimeStatus() {
      return withVisibility({ ok: true, isProductPage: store.getState().surface === 'pdp' });
    }

    function withVisibility(status) {
      return Object.assign({}, status || {}, {
        ok: status && status.ok === false ? false : true,
        editorVisible
      });
    }

    function bindStorageEvents() {
      if (!windowRef.chrome || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[EDITOR_VISIBLE_KEY]) return;
        void setEditorVisibility(changes[EDITOR_VISIBLE_KEY].newValue !== false);
      });
    }

    function readEditorVisibility() {
      return new Promise((resolve) => {
        if (!windowRef.chrome || !chrome.storage || !chrome.storage.local) return resolve(true);
        chrome.storage.local.get({ [EDITOR_VISIBLE_KEY]: true }, (result) => resolve(result && result[EDITOR_VISIBLE_KEY] !== false));
      });
    }

    return { invalidate, reload, scheduleSync, start, stop, sync };
  }

  return { createRuntime };
});
