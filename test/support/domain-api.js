const http = require('http');
const { URL } = require('url');
const { ownerUserIdFromUrl, resolveItemClient } = require('../../cloudflare/src/domain/account-client');
const { sanitizeError, userFriendlyError } = require('../../cloudflare/src/domain/errors');
const { createItemRouteCache, handleResolve, handleResolveQuick } = require('../../cloudflare/src/domain/routes/items');
const { handlePriceSummary, handleStandardPriceUpdate } = require('../../cloudflare/src/domain/routes/pricing');
const { handleBulkCommit, handleBulkPreview } = require('../../cloudflare/src/domain/routes/bulk');
const { handleDescriptionBulkUpdate, handleDescriptionGet, handleDescriptionUpdate } = require('../../cloudflare/src/domain/routes/descriptions');
const { handleCharacteristicsBulkUpdate, handleCharacteristicsGet, handleCharacteristicsUpdate } = require('../../cloudflare/src/domain/routes/characteristics');
const { handlePictureCommit, handlePictureFixSize, handlePictureQuality, handlePictureUpload } = require('../../cloudflare/src/domain/routes/pictures');
const {
  handleCampaignList,
  handleCreateCampaign,
  handleCreateOffer,
  handleDeleteCampaign,
  handleDeleteOffer,
  handlePromotionEstimate,
  handlePromotionEstimates,
  handlePromotionSummary,
  handleUpdateCampaign,
  handleUpdateOffer
} = require('../../cloudflare/src/domain/routes/promotions');

function createApp(options = {}) {
  const store = options.store || null;
  const client = options.client || {};
  const clientFactory = options.clientFactory || (() => client);
  const itemRouteCache = options.itemRouteCache || createItemRouteCache();

  return http.createServer(async (req, res) => {
    const requestId = String(Date.now());
    res.setHeader('x-onframe-request-id', requestId);
    try {
      const url = new URL(req.url, 'http://test.invalid');
      const route = req.method + ' ' + url.pathname;
      const resolveItemRequestClient = (itemId) => resolveItemClient({
        itemId,
        ownerUserId: ownerUserIdFromUrl(url),
        store,
        client,
        clientFactory
      });
      const resolveBulkRequestClient = async (subjectId) => {
        if (!/^MLBU\d+$/iu.test(String(subjectId || ''))) return resolveItemRequestClient(subjectId);
        const ownerUserId = ownerUserIdFromUrl(url);
        if (!ownerUserId || !store || typeof store.readAccount !== 'function') return client;
        const account = await store.readAccount(ownerUserId);
        if (!account || !account.refresh_token) {
          const error = new Error('Conta conectada não encontrada para este anúncio.');
          error.statusCode = 403;
          throw error;
        }
        if (account.enabled === false) {
          const error = new Error('Esta conta está desativada no OnFrame. Ative a conta para editar este anúncio.');
          error.statusCode = 403;
          throw error;
        }
        return clientFactory(account);
      };

      if (route === 'POST /api/resolve') {
        return sendRouteResult(res, await handleResolve({ req, client, store, clientFactory, readJson }), requestId);
      }
      if (route === 'POST /api/resolve/quick') {
        return sendRouteResult(res, await handleResolveQuick({ req, client, store, clientFactory, readJson, cache: itemRouteCache }), requestId);
      }

      const priceSummaryMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pricing\/summary$/u);
      if (route.startsWith('GET ') && priceSummaryMatch) return sendJson(res, 200, await handlePriceSummary({ client: await resolveItemRequestClient(priceSummaryMatch[1]), itemId: priceSummaryMatch[1] }));
      const standardPriceMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pricing\/standard$/u);
      if (route.startsWith('PUT ') && standardPriceMatch) return sendJson(res, 200, await handleStandardPriceUpdate({ req, client: await resolveItemRequestClient(standardPriceMatch[1]), itemId: standardPriceMatch[1], readJson }));

      const bulkPreviewMatch = url.pathname.match(/^\/api\/items\/((?:MLB|MLBU)\d+)\/bulk\/preview$/u);
      if (route.startsWith('POST ') && bulkPreviewMatch) return sendJson(res, 200, await handleBulkPreview({ req, client: await resolveBulkRequestClient(bulkPreviewMatch[1]), itemId: bulkPreviewMatch[1], readJson }));
      const bulkCommitMatch = url.pathname.match(/^\/api\/items\/((?:MLB|MLBU)\d+)\/bulk\/commit$/u);
      if (route.startsWith('POST ') && bulkCommitMatch) return sendJson(res, 200, await handleBulkCommit({ req, client: await resolveBulkRequestClient(bulkCommitMatch[1]), itemId: bulkCommitMatch[1], readJson }));

      const descriptionMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/description$/u);
      if (route.startsWith('GET ') && descriptionMatch) return sendJson(res, 200, await handleDescriptionGet({ client: await resolveItemRequestClient(descriptionMatch[1]), itemId: descriptionMatch[1] }));
      if (route.startsWith('PUT ') && descriptionMatch) return sendJson(res, 200, await handleDescriptionUpdate({ req, client: await resolveItemRequestClient(descriptionMatch[1]), itemId: descriptionMatch[1], readJson }));
      const descriptionBulkMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/description\/bulk$/u);
      if (route.startsWith('POST ') && descriptionBulkMatch) return sendJson(res, 200, await handleDescriptionBulkUpdate({ req, client: await resolveBulkRequestClient(descriptionBulkMatch[1]), itemId: descriptionBulkMatch[1], readJson }));

      const characteristicsMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/characteristics$/u);
      if (route.startsWith('GET ') && characteristicsMatch) return sendJson(res, 200, await handleCharacteristicsGet({ client: await resolveItemRequestClient(characteristicsMatch[1]), itemId: characteristicsMatch[1] }));
      if (route.startsWith('PUT ') && characteristicsMatch) return sendJson(res, 200, await handleCharacteristicsUpdate({ req, client: await resolveItemRequestClient(characteristicsMatch[1]), itemId: characteristicsMatch[1], readJson }));
      const characteristicsBulkMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/characteristics\/bulk$/u);
      if (route.startsWith('POST ') && characteristicsBulkMatch) return sendJson(res, 200, await handleCharacteristicsBulkUpdate({ req, client: await resolveBulkRequestClient(characteristicsBulkMatch[1]), itemId: characteristicsBulkMatch[1], readJson }));

      const promotionSummaryMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/summary$/u);
      if (route.startsWith('GET ') && promotionSummaryMatch) return sendJson(res, 200, await handlePromotionSummary({ client: await resolveItemRequestClient(promotionSummaryMatch[1]), itemId: promotionSummaryMatch[1] }));
      const promotionEstimatesMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/estimates$/u);
      if (route.startsWith('POST ') && promotionEstimatesMatch) return sendJson(res, 200, await handlePromotionEstimates({ req, client: await resolveItemRequestClient(promotionEstimatesMatch[1]), itemId: promotionEstimatesMatch[1], readJson }));
      const promotionEstimateMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/estimate$/u);
      if (route.startsWith('POST ') && promotionEstimateMatch) return sendJson(res, 200, await handlePromotionEstimate({ req, client: await resolveItemRequestClient(promotionEstimateMatch[1]), itemId: promotionEstimateMatch[1], readJson }));
      const offerMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/promotions\/offers$/u);
      if (route.startsWith('POST ') && offerMatch) return sendJson(res, 200, await handleCreateOffer({ req, client: await resolveItemRequestClient(offerMatch[1]), itemId: offerMatch[1], readJson }));
      if (route.startsWith('PUT ') && offerMatch) return sendJson(res, 200, await handleUpdateOffer({ req, client: await resolveItemRequestClient(offerMatch[1]), itemId: offerMatch[1], readJson }));
      if (route.startsWith('DELETE ') && offerMatch) return sendJson(res, 200, await handleDeleteOffer({ req, client: await resolveItemRequestClient(offerMatch[1]), itemId: offerMatch[1], readJson }));

      if (route === 'GET /api/promotions/campaigns') return sendJson(res, 200, await handleCampaignList({ client }));
      if (route === 'POST /api/promotions/campaigns') return sendJson(res, 200, await handleCreateCampaign({ req, client, readJson }));
      const campaignMatch = url.pathname.match(/^\/api\/promotions\/campaigns\/([^/]+)$/u);
      if (route.startsWith('PUT ') && campaignMatch) return sendJson(res, 200, await handleUpdateCampaign({ req, client, promotionId: decodeURIComponent(campaignMatch[1]), readJson }));
      if (route.startsWith('DELETE ') && campaignMatch) return sendJson(res, 200, await handleDeleteCampaign({ req, client, promotionId: decodeURIComponent(campaignMatch[1]), readJson }));

      const uploadMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/upload$/u);
      if (route.startsWith('POST ') && uploadMatch) return sendJson(res, 200, await handlePictureUpload({ req, client: await resolveItemRequestClient(uploadMatch[1]), itemId: uploadMatch[1], readJson }));
      const qualityMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/quality$/u);
      if (route.startsWith('GET ') && qualityMatch) return sendJson(res, 200, await handlePictureQuality({ url, client: await resolveItemRequestClient(qualityMatch[1]), itemId: qualityMatch[1] }));
      const fixSizeMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/fix-size$/u);
      if (route.startsWith('POST ') && fixSizeMatch) return sendJson(res, 200, await handlePictureFixSize({ req, client: await resolveItemRequestClient(fixSizeMatch[1]), itemId: fixSizeMatch[1], readJson }));
      const commitMatch = url.pathname.match(/^\/api\/items\/(MLB\d+)\/pictures\/commit$/u);
      if (route.startsWith('POST ') && commitMatch) return sendJson(res, 200, await handlePictureCommit({ req, client: await resolveItemRequestClient(commitMatch[1]), itemId: commitMatch[1], readJson }));

      const error = new Error('Endpoint não encontrado.');
      error.statusCode = 404;
      error.code = 'endpoint_not_found';
      throw error;
    } catch (error) {
      sendError(res, error, requestId);
    }
  });
}

function sendRouteResult(res, result, requestId) {
  return sendJson(res, result.statusCode || 200, result.payload || result, requestId);
}

async function readJson(req, options = {}) {
  const maxBytes = options.maxBytes || 1024 * 1024;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Payload excede o limite permitido.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json') && !(contentType.includes('text/plain') && !req.headers.origin)) {
    const error = new Error('Content-Type inválido. Use application/json.');
    error.statusCode = 415;
    error.code = 'invalid_content_type';
    throw error;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON inválido.');
    error.statusCode = 400;
    error.code = 'invalid_json';
    throw error;
  }
}

function sendError(res, error, requestId) {
  const status = Number(error && error.statusCode || 500);
  return sendJson(res, status, {
    error: userFriendlyError(error, sanitizeError(error), status),
    code: error && error.code ? error.code : statusToCode(status),
    requestId
  });
}

function statusToCode(status) {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  return 'internal_error';
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = { createApp, sanitizeError, userFriendlyError };
