const {
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteCampaign,
  deleteOffer,
  estimatePromotionImpact,
  estimatePromotionImpacts,
  listCampaigns,
  updateCampaign,
  updateOffer
} = require('../promotions');

async function handlePromotionSummary({ client, itemId }) {
  return buildPromotionSummary(client, itemId);
}

async function handlePromotionEstimate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return estimatePromotionImpact(client, itemId, body);
}

async function handlePromotionEstimates({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return {
    estimates: await estimatePromotionImpacts(client, itemId, body && body.estimates)
  };
}

async function handleCreateOffer({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return createOffer(client, itemId, body);
}

async function handleUpdateOffer({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return updateOffer(client, itemId, body);
}

async function handleDeleteOffer({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return deleteOffer(client, itemId, body);
}

async function handleCampaignList({ client }) {
  return listCampaigns(client);
}

async function handleCreateCampaign({ req, client, readJson }) {
  const body = await readJson(req);
  return createCampaign(client, body);
}

async function handleUpdateCampaign({ req, client, promotionId, readJson }) {
  const body = await readJson(req);
  return updateCampaign(client, promotionId, body);
}

async function handleDeleteCampaign({ req, client, promotionId, readJson }) {
  const body = await readJson(req);
  return deleteCampaign(client, promotionId, body);
}

module.exports = {
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
};
