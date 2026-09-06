(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameCommerceSummaryController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createSummaryController(options) {
    const api = options.api;
    const toUserError = options.toUserError;

    async function load(paths) {
      const [priceResult, promotionResult] = await Promise.allSettled([
        api(paths.price),
        api(paths.promotions)
      ]);
      return {
        price: settle(priceResult),
        promotions: settle(promotionResult)
      };
    }

    function settle(result) {
      if (result.status === 'fulfilled') return { value: result.value, error: '' };
      return { value: null, error: toUserError(result.reason) };
    }

    return { load };
  }

  return { createSummaryController };
});
