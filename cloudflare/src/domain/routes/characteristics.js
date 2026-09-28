const {
  getCharacteristics,
  updateCharacteristics,
  updateCharacteristicsFamily
} = require('../characteristics');

async function handleCharacteristicsGet({ client, itemId }) {
  return getCharacteristics(client, itemId);
}

async function handleCharacteristicsUpdate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return updateCharacteristics(client, itemId, body);
}

async function handleCharacteristicsBulkUpdate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return updateCharacteristicsFamily(client, itemId, body);
}

module.exports = {
  handleCharacteristicsBulkUpdate,
  handleCharacteristicsGet,
  handleCharacteristicsUpdate
};
