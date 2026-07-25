const {
  buildBulkPreview,
  commitBulkAction
} = require('../bulk-actions');

async function handleBulkPreview({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return buildBulkPreview(client, itemId, body);
}

async function handleBulkCommit({ req, client, itemId, readJson }) {
  const body = await readJson(req);
  return commitBulkAction(client, itemId, body);
}

module.exports = {
  handleBulkCommit,
  handleBulkPreview
};
