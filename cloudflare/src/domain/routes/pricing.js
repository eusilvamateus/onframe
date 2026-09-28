const {
  buildPriceSummary,
  updateStandardPrice
} = require('../pricing');

async function handlePriceSummary({ client, itemId }) {
  return buildPriceSummary(client, itemId);
}

async function handleStandardPriceUpdate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return updateStandardPrice(client, itemId, body);
}

module.exports = {
  handlePriceSummary,
  handleStandardPriceUpdate
};
