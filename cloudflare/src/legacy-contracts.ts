// @ts-nocheck

// The commercial domain stays CommonJS while the Worker owns its HTTP
// boundary. The modules below are runtime-compatible with Workers and are
// covered by the established domain test suite.
export { createItemRouteCache, handleResolve, handleResolveQuick } from './domain/routes/items.js';
export { handlePriceSummary, handleStandardPriceUpdate } from './domain/routes/pricing.js';
export {
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
} from './domain/routes/promotions.js';
export { handleDescriptionBulkUpdate, handleDescriptionGet, handleDescriptionUpdate } from './domain/routes/descriptions.js';
export {
  handleCharacteristicsBulkUpdate,
  handleCharacteristicsGet,
  handleCharacteristicsUpdate
} from './domain/routes/characteristics.js';
export { handlePictureCommit, handlePictureFixSize, handlePictureQuality, handlePictureUpload } from './domain/routes/pictures.js';
export { handleBulkCommit, handleBulkPreview } from './domain/routes/bulk.js';
export { resolveItemClient } from './domain/account-client.js';
export { sanitizeError, userFriendlyError } from './domain/errors.js';
