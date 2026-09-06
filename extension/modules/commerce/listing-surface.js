(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameCommerceListingSurface = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createListingSurface(options) {
    const api = options.api;
    const Detection = options.Detection;
    const extractItemId = options.extractItemId;
    const onOwned = options.onOwned || (() => {});
    const onUnavailable = options.onUnavailable || (() => {});
    const onRemove = options.onRemove || (() => {});
    const toUserError = options.toUserError || ((err) => String(err && err.message ? err.message : err));
    const records = new Map();
    const cache = new Map();
    const queue = [];
    let resolving = 0;
    let intersectionObserver = null;
    let mutationObserver = null;
    let scanTimer = null;
    let container = null;
    let active = false;

    function start() {
      if (!Detection.isListingPageUrl(location.href)) return;
      active = true;
      bindContainer();
      scheduleScan(0);
    }

    function stop() {
      active = false;
      if (intersectionObserver) intersectionObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      if (scanTimer) clearTimeout(scanTimer);
      intersectionObserver = null;
      mutationObserver = null;
      scanTimer = null;
      container = null;
      records.forEach((record) => onRemove(record));
      records.clear();
      cache.clear();
      queue.length = 0;
      resolving = 0;
    }

    function bindContainer() {
      const next = findContainer();
      if (!next || next === container) return;
      if (mutationObserver) mutationObserver.disconnect();
      container = next;
      if (typeof MutationObserver === 'function') {
        mutationObserver = new MutationObserver((mutations) => {
          if (mutations.some((mutation) => mutation.type === 'childList')) scheduleScan();
        });
        mutationObserver.observe(container, { childList: true, subtree: true });
      }
      if (!intersectionObserver && typeof IntersectionObserver === 'function') {
        intersectionObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const record = records.get(entry.target);
            if (record) queueResolution(record.itemId);
            intersectionObserver.unobserve(entry.target);
          }
        }, { rootMargin: '180px 0px' });
      }
    }

    function findContainer() {
      return document.querySelector('ol.ui-search-layout, .ui-search-layout, [data-testid="search-results"], main');
    }

    function scheduleScan(delay = 120) {
      if (!active || scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
      }, delay);
    }

    function scan() {
      if (!active || !Detection.isListingPageUrl(location.href)) return;
      if (!container || !container.isConnected) bindContainer();
      if (!container) return;
      const selector = isStorefront() ? '.poly-card' : 'li.ui-search-layout__item';
      const cards = Array.from(container.querySelectorAll(selector));
      const currentCards = new Set(cards);

      records.forEach((record, card) => {
        if (!card.isConnected || !currentCards.has(card)) removeRecord(record);
      });

      for (const card of cards) registerCard(card);
    }

    function registerCard(card) {
      if (!card || !card.isConnected || card.closest('#onblide-ml-root')) return;
      const link = card.querySelector('a.poly-component__title[href]');
      const itemId = extractItemId(link && link.href);
      const current = records.get(card);
      if (!itemId || !link) {
        if (current) removeRecord(current);
        return;
      }
      if (current && current.itemId === itemId) return;
      if (current) removeRecord(current);

      const record = {
        card,
        link,
        itemId,
        controls: null,
        badge: null,
        media: null,
        context: null,
        priceSummary: null,
        promotionSummary: null,
        priceError: '',
        promotionError: '',
        priceLoading: false,
        promotionLoading: false
      };
      records.set(card, record);
      observe(record);
    }

    function observe(record) {
      const cached = cache.get(record.itemId);
      if (cached && cached.status === 'owned') return onOwned(record, cached.context);
      if (cached && cached.status !== 'queued' && cached.status !== 'loading') return;
      if (intersectionObserver) intersectionObserver.observe(record.card);
      else queueResolution(record.itemId);
    }

    function queueResolution(itemId) {
      const current = cache.get(itemId);
      if (current && ['queued', 'loading', 'owned', 'not-owned', 'error'].includes(current.status)) return;
      cache.set(itemId, { status: 'queued', context: null });
      queue.push(itemId);
      drain();
    }

    function drain() {
      while (active && resolving < 3 && queue.length) {
        const itemId = queue.shift();
        const entry = cache.get(itemId);
        if (!entry || entry.status !== 'queued') continue;
        resolving += 1;
        entry.status = 'loading';
        void resolveItem(itemId).finally(() => {
          resolving = Math.max(0, resolving - 1);
          drain();
        });
      }
    }

    async function resolveItem(itemId) {
      const entry = cache.get(itemId);
      if (!entry || !active) return;
      try {
        const context = await api('/api/resolve/quick', {
          method: 'POST',
          body: JSON.stringify({
            url: location.href,
            html: '',
            pageIdentity: { canonicalItemId: itemId }
          })
        });
        if (!context || !context.item || String(context.item.id || '') !== itemId) throw new Error('Não foi possível confirmar este anúncio.');
        entry.status = 'owned';
        entry.context = context;
      } catch (err) {
        entry.status = Number(err && err.status) === 403 || Number(err && err.status) === 404 ? 'not-owned' : 'error';
        entry.error = toUserError(err);
      }

      records.forEach((record) => {
        if (record.itemId !== itemId) return;
        if (entry.status === 'owned') onOwned(record, entry.context);
        else onUnavailable(record, entry.error || '');
      });
    }

    function removeRecord(record) {
      if (!record) return;
      if (intersectionObserver) intersectionObserver.unobserve(record.card);
      records.delete(record.card);
      onRemove(record);
    }

    function isStorefront() {
      return String(location.hostname || '').toLowerCase() !== 'lista.mercadolivre.com.br';
    }

    return { records, scan, scheduleScan, start, stop };
  }

  return { createListingSurface };
});
