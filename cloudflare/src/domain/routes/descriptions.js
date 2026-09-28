const {
  getDescription,
  updateDescriptionFamily,
  upsertDescription
} = require('../descriptions');

async function handleDescriptionGet({ client, itemId }) {
  return getDescription(client, itemId);
}

async function handleDescriptionUpdate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return upsertDescription(client, itemId, body);
}

async function handleDescriptionBulkUpdate({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return updateDescriptionFamily(client, itemId, body);
}

module.exports = {
  handleDescriptionBulkUpdate,
  handleDescriptionGet,
  handleDescriptionUpdate
};
