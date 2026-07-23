(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OnblideMlDetection = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createPageSignature(documentRef, href) {
    const identity = collectPageIdentity(documentRef, href, { includeScripts: false });
    return JSON.stringify({
      productPage: isProductPageUrl(href),
      itemKey: createPageItemKey(identity, href),
      selectionKey: createSelectionKey(documentRef, href),
      pageIdentity: identity
    });
  }

  function createPageItemKey(identity, href) {
    const source = identity || {};
    return source.denounceItemId ||
      source.pdpFilterItemId ||
      source.urlItemId ||
      source.urlUserProductId ||
      source.canonicalItemId ||
      source.catalogProductId ||
      normalizeUrlForSignature(href);
  }

  function createSelectionKey(documentRef, href) {
    return {
      selectedValues: collectVisibleSelectedValues(documentRef),
      queryValues: collectQueryAttributeValues(href)
    };
  }

  function inferSelectedVariationId(variations, documentRef, href) {
    const list = Array.isArray(variations) ? variations : [];
    if (!list.length) return null;

    const visibleValues = collectVisibleSelectedValues(documentRef);
    const queryValues = collectQueryAttributeValues(href);
    let best = null;
    let bestScore = -1;

    for (const variation of list) {
      const values = (variation.attribute_combinations || [])
        .map((attribute) => normalizeText(attribute.value_name || attribute.name || ''))
        .filter(Boolean);
      let score = 0;
      for (const value of values) {
        if (visibleValues.some((text) => text.includes(value) || value.includes(text))) score += 4;
        if (queryValues.some((text) => text.includes(value) || value.includes(text))) score += 2;
      }
      if (score > bestScore) {
        best = variation;
        bestScore = score;
      }
    }

    return String((best || list[0]).id);
  }

  function collectVisibleSelectedValues(documentRef) {
    const values = [];
    const documentLike = documentRef || {};
    const textRoot = firstElement(documentLike, [
      '.ui-pdp-container',
      '.ui-pdp',
      'main'
    ]);
    const scopedText = elementText(textRoot || documentLike.body || '');
    const matches = scopedText.matchAll(/\b(?:Cor(?:\s+[^:\n\r]{1,40})?|Nome do desenho|Estampa|Modelo|Voltagem)\s*:\s*([^\n\r]+)/gi);
    for (const match of matches) values.push(normalizeText(match[1]));

    const selectors = [
      '[aria-checked="true"]',
      '[aria-pressed="true"]',
      '.andes-button--selected',
      '[data-testid*="selected"]'
    ];
    for (const selector of selectors) {
      for (const element of queryAll(documentLike, selector)) {
        values.push(normalizeText(elementText(element)));
        values.push(normalizeText(element.getAttribute ? element.getAttribute('aria-label') : ''));
        values.push(normalizeText(element.getAttribute ? element.getAttribute('title') : ''));
      }
    }

    return unique(values.filter(Boolean)).slice(0, 24);
  }

  function collectQueryAttributeValues(href) {
    const values = [];
    let raw = '';
    try {
      raw = new URL(String(href || ''), 'https://produto.mercadolivre.com.br').searchParams.get('attributes') || '';
    } catch (e) {
      raw = '';
    }
    for (const pair of raw.split(',')) {
      const encoded = pair.split(':')[1];
      if (!encoded) continue;
      try {
        values.push(normalizeText(atob(encoded)));
      } catch (e) {
        values.push(normalizeText(encoded));
      }
    }
    return unique(values.filter(Boolean));
  }

  function collectItemIdCandidatesFromPage(documentRef, href, options = {}) {
    const candidates = [];
    const documentLike = documentRef || {};

    addItemCandidates(candidates, href, /produto\.mercadolivre\.com\.br\/[^"'<>]*?\b(MLB-?\d{9,13})\b/ig, null, { skipExcludedContext: false });
    addItemCandidates(candidates, href, /[?&]pdp_filters=([^&]+)/ig, extractItemIdFromEncodedFilter, { skipExcludedContext: false });

    for (const element of queryAll(documentLike, 'link[rel="canonical"], meta[property="og:url"], meta[name="twitter:url"]')) {
      addItemCandidatesFromElement(candidates, element);
    }

    for (const element of collectSelectedCandidateElements(documentLike)) {
      addItemCandidatesFromElement(candidates, element);
    }

    if (options.includeScripts !== false) {
      for (const script of queryAll(documentLike, 'script')) {
        const text = elementText(script);
        addItemCandidates(candidates, text, /"item_?id"\s*:\s*"?(MLB-?\d{9,13})"?/ig, null, { skipExcludedContext: false });
        addItemCandidates(candidates, text, /"id"\s*:\s*"(MLB-?\d{9,13})"/ig, (context) => /\b(item|product|listing|permalink|produto\.mercadolivre)\b/i.test(context));
      }
    }

    return unique(candidates);
  }

  function collectPageIdentity(documentRef, href, options = {}) {
    const documentLike = documentRef || {};
    const url = String(href || '');
    const canonicalValues = queryAll(documentLike, 'link[rel="canonical"], meta[property="og:url"], meta[name="twitter:url"]')
      .flatMap(elementCandidateValues);
    const identity = {
      denounceItemId: extractDenounceItemId(documentLike),
      urlItemId: extractItemIdFromProductUrl(url),
      canonicalItemId: firstItemIdFromValues(canonicalValues),
      urlUserProductId: firstUserProductIdFromValues([url]),
      pdpFilterItemId: extractPdpFilterItemId(url),
      productTriggerItemId: extractProductTriggerItemId(url),
      catalogProductId: extractCatalogProductId(url) || firstCatalogProductIdFromValues(canonicalValues),
      weakItemCandidates: collectWeakItemCandidatesFromPage(documentLike, url, options),
      weakUserProductCandidates: collectWeakUserProductCandidatesFromPage(documentLike, url, options)
    };
    return identity;
  }

  function collectWeakItemCandidatesFromPage(documentLike, href, options = {}) {
    const candidates = [];
    for (const element of collectSelectedCandidateElements(documentLike)) {
      addItemCandidatesFromElement(candidates, element);
    }
    if (options.includeScripts !== false) {
      for (const script of queryAll(documentLike, 'script')) {
        const text = elementText(script);
        addItemCandidates(candidates, text, /"item_?id"\s*:\s*"?(MLB-?\d{9,13})"?/ig, null, { skipExcludedContext: false });
        addItemCandidates(candidates, text, /"id"\s*:\s*"(MLB-?\d{9,13})"/ig, (context) => /\b(item|product|listing|permalink|produto\.mercadolivre)\b/i.test(context));
      }
    }
    return unique(candidates).filter((candidate) => ![
      extractItemIdFromProductUrl(href),
      extractPdpFilterItemId(href),
      extractProductTriggerItemId(href)
    ].includes(candidate));
  }

  function collectWeakUserProductCandidatesFromPage(documentLike, href, options = {}) {
    const candidates = [];
    for (const element of collectSelectedCandidateElements(documentLike)) {
      addUserProductCandidatesFromElement(candidates, element);
    }
    if (options.includeScripts !== false) {
      for (const script of queryAll(documentLike, 'script')) {
        addUserProductCandidates(candidates, elementText(script));
      }
    }
    return unique(candidates).filter((candidate) => candidate !== firstUserProductIdFromValues([href]));
  }

  function collectUserProductCandidatesFromPage(documentRef, href, options = {}) {
    const candidates = [];
    addUserProductCandidates(candidates, href);

    const documentLike = documentRef || {};
    for (const element of collectSelectedCandidateElements(documentLike)) {
      addUserProductCandidatesFromElement(candidates, element);
    }

    const selectors = [
      'link[rel="canonical"]',
      'meta[property="og:url"]',
      'meta[name="twitter:url"]',
      'a[href*="MLBU"]',
      '[data-testid*="selected"]',
      '[aria-checked="true"]',
      '[aria-pressed="true"]'
    ];
    for (const element of queryAll(documentLike, selectors.join(','))) {
      addUserProductCandidatesFromElement(candidates, element);
    }

    if (options.includeScripts !== false) {
      for (const script of queryAll(documentLike, 'script')) {
        addUserProductCandidates(candidates, elementText(script));
      }
    }

    return unique(candidates);
  }

  function collectSelectedCandidateElements(documentLike) {
    const selectors = [
      '[aria-checked="true"]',
      '[aria-pressed="true"]',
      '.andes-button--selected',
      '[data-testid*="selected"]'
    ];
    const elements = [];
    for (const selector of selectors) {
      for (const element of queryAll(documentLike, selector)) {
        elements.push(element);
        const link = closestLink(element);
        if (link) elements.push(link);
      }
    }
    return elements;
  }

  function addItemCandidatesFromElement(candidates, element) {
    for (const value of elementCandidateValues(element)) {
      addItemCandidates(candidates, value, /produto\.mercadolivre\.com\.br\/[^"'<>]*?\b(MLB-?\d{9,13})\b/ig, null, { skipExcludedContext: false });
      addItemCandidates(candidates, value, /[?&]pdp_filters=([^&]+)/ig, extractItemIdFromEncodedFilter, { skipExcludedContext: false });
      addItemCandidates(candidates, value, /\b(MLB-?\d{9,13})\b/ig, null, { skipExcludedContext: false });
    }
  }

  function addUserProductCandidatesFromElement(candidates, element) {
    for (const value of elementCandidateValues(element)) {
      addUserProductCandidates(candidates, value);
    }
  }

  function elementCandidateValues(element) {
    return [
      element && element.href,
      element && element.content,
      elementText(element),
      getAttribute(element, 'href'),
      getAttribute(element, 'content'),
      getAttribute(element, 'data-testid'),
      getAttribute(element, 'aria-label'),
      getAttribute(element, 'title'),
      getAttribute(element, 'value')
    ];
  }

  function addItemCandidates(candidates, text, pattern, contextGuard, options = {}) {
    for (const match of String(text || '').matchAll(pattern)) {
      const context = String(text || '').slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
      if (options.skipExcludedContext !== false && /\b(category_id|categoryId|domain_id|domainId|family_id|familyId|catalog_product_id|catalogProductId|picture_id|pictureId|thumbnail|secure_url|pictures?)\b/i.test(context)) continue;
      if (contextGuard && typeof contextGuard === 'function') {
        const guarded = contextGuard(context, match);
        if (guarded === false) continue;
        if (typeof guarded === 'string') {
          const itemId = normalizeItemId(guarded);
          if (itemId) candidates.push(itemId);
          continue;
        }
      }
      const itemId = normalizeItemId(match[1] || match[0]);
      if (itemId) candidates.push(itemId);
    }
  }

  function addUserProductCandidates(candidates, value) {
    for (const match of String(value || '').matchAll(/\bMLBU\d{6,}\b/ig)) {
      candidates.push(match[0].toUpperCase());
    }
  }

  function extractItemIdFromEncodedFilter(context, match) {
    try {
      const decoded = decodeURIComponent(match[1] || '');
      const idMatch = decoded.match(/\bitem_id:?(MLB\d{9,13})\b/i);
      return idMatch ? idMatch[1] : false;
    } catch (e) {
      return false;
    }
  }

  function extractPdpFilterItemId(value) {
    try {
      const parsed = new URL(String(value || ''), 'https://www.mercadolivre.com.br');
      const filter = parsed.searchParams.get('pdp_filters') || '';
      const idMatch = filter.match(/\bitem_id:?(MLB\d{6,13})\b/i);
      return idMatch ? normalizeStrongItemId(idMatch[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function extractProductTriggerItemId(value) {
    try {
      const parsed = new URL(String(value || ''), 'https://www.mercadolivre.com.br');
      return normalizeStrongItemId(parsed.searchParams.get('product_trigger_id'));
    } catch (e) {
      return null;
    }
  }

  function extractItemIdFromProductUrl(value) {
    const match = String(value || '').match(/produto\.mercadolivre\.com\.br\/[^"'<>]*?\b(MLB-?\d{9,13})\b/i);
    return match ? normalizeItemId(match[1]) : null;
  }

  function extractDenounceItemId(documentLike) {
    const selectors = [
      'a[href*="/noindex/denounce"][href*="item_id=MLB"]',
      '#denounce',
      '.ui-vpp-denounce'
    ];
    for (const selector of selectors) {
      for (const element of queryAll(documentLike, selector)) {
        const fromHref = extractDenounceItemIdFromHref(element && element.href) ||
          extractDenounceItemIdFromHref(getAttribute(element, 'href'));
        if (fromHref) return fromHref;

        const fromText = extractDenounceItemIdFromText(elementText(element));
        if (fromText) return fromText;
      }
    }
    return null;
  }

  function extractDenounceItemIdFromHref(value) {
    try {
      const parsed = new URL(String(value || ''), 'https://www.mercadolivre.com.br');
      return normalizeStrongItemId(parsed.searchParams.get('item_id'));
    } catch (e) {
      return null;
    }
  }

  function extractDenounceItemIdFromText(value) {
    const match = String(value || '').match(/\bAn[uú]ncio\s*#?\s*(MLB)?[-\s]*(\d{6,13})\b/i);
    return match ? normalizeStrongItemId(`MLB${match[2]}`) : null;
  }

  function extractCatalogProductId(value) {
    const match = String(value || '').match(/mercadolivre\.com\.br\/[^?#]+\/(?:p|up)\/(MLB\d{6,13}|MLBU\d{6,})/i);
    if (!match) return null;
    return /^MLBU/i.test(match[1]) ? null : normalizeStrongItemId(match[1]);
  }

  function firstItemIdFromValues(values) {
    for (const value of values || []) {
      const fromUrl = extractItemIdFromProductUrl(value);
      if (fromUrl) return fromUrl;
      const direct = normalizeItemId(value);
      if (direct) return direct;
    }
    return null;
  }

  function firstCatalogProductIdFromValues(values) {
    for (const value of values || []) {
      const id = extractCatalogProductId(value);
      if (id) return id;
    }
    return null;
  }

  function firstUserProductIdFromValues(values) {
    for (const value of values || []) {
      const match = String(value || '').toUpperCase().match(/\bMLBU\d{6,}\b/);
      if (match) return match[0];
    }
    return null;
  }

  function normalizeItemId(value) {
    const match = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/MLB\d{9,13}/);
    return match ? match[0] : null;
  }

  function normalizeStrongItemId(value) {
    const match = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(/MLB\d{6,13}/);
    return match ? match[0] : null;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isProductPageUrl(value) {
    return /produto\.mercadolivre\.com\.br\/MLB-?\d{9,13}/i.test(value) ||
      /mercadolivre\.com\.br\/[^?#]+\/p\/MLB\d+/i.test(value) ||
      /mercadolivre\.com\.br\/[^?#]+\/up\/MLBU\d+/i.test(value) ||
      /[?&]pdp_filters=[^&]*item_id/i.test(value);
  }

  function normalizeUrlForSignature(href) {
    try {
      const url = new URL(String(href || ''), 'https://produto.mercadolivre.com.br');
      url.hash = '';
      return url.toString();
    } catch (e) {
      return String(href || '').split('#')[0];
    }
  }

  function queryAll(documentLike, selector) {
    if (!documentLike || typeof documentLike.querySelectorAll !== 'function') return [];
    try {
      return Array.from(documentLike.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function firstElement(documentLike, selectors) {
    if (!documentLike || typeof documentLike.querySelector !== 'function') return null;
    for (const selector of selectors) {
      try {
        const element = documentLike.querySelector(selector);
        if (element) return element;
      } catch (e) {
        // Ignore selectors unsupported by a test double.
      }
    }
    return null;
  }

  function elementText(element) {
    if (!element) return '';
    if (typeof element === 'string') return element;
    return String(element.innerText || element.textContent || '');
  }

  function getAttribute(element, name) {
    if (!element || typeof element.getAttribute !== 'function') return '';
    return element.getAttribute(name) || '';
  }

  function closestLink(element) {
    if (!element || typeof element.closest !== 'function') return null;
    try {
      return element.closest('a[href]');
    } catch (e) {
      return null;
    }
  }

  function unique(values) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  }

  return {
    collectItemIdCandidatesFromPage,
    collectPageIdentity,
    collectQueryAttributeValues,
    collectUserProductCandidatesFromPage,
    collectVisibleSelectedValues,
    createPageItemKey,
    createPageSignature,
    createSelectionKey,
    inferSelectedVariationId,
    isProductPageUrl,
    normalizeItemId,
    normalizeText
  };
});
