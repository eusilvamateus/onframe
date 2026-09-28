// @ts-nocheck

// The existing service modules are intentionally reused while their public
// HTTP contract is moved to the Worker. They remain CommonJS and are covered
// by the repository's established service test suite.
export { createItemRouteCache, handleResolve, handleResolveQuick } from '../../service/src/routes/items.js';
export { handlePriceSummary, handleStandardPriceUpdate } from '../../service/src/routes/pricing.js';
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
} from '../../service/src/routes/promotions.js';
export { handleDescriptionBulkUpdate, handleDescriptionGet, handleDescriptionUpdate } from '../../service/src/routes/descriptions.js';
export {
  handleCharacteristicsBulkUpdate,
  handleCharacteristicsGet,
  handleCharacteristicsUpdate
} from '../../service/src/routes/characteristics.js';
export { handlePictureCommit, handlePictureFixSize, handlePictureQuality, handlePictureUpload } from '../../service/src/routes/pictures.js';
export { handleBulkCommit, handleBulkPreview } from '../../service/src/routes/bulk.js';
export { resolveItemClient } from '../../service/src/account-client.js';
export { sanitizeError, userFriendlyError } from '../../service/src/errors.js';
