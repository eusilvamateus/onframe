const {
  OFFICIAL_TARGET_SIZE,
  buildPictureQualityReport,
  calculateOptimizedDimensions,
  downloadBestPictureImage,
  extractImageDimensionsFromBase64,
  extractOfficialDimensions
} = require('../picture-quality');
const { buildCommitPayload, pickMode } = require('../items');
const {
  assertEditablePicturesItem,
  assertOwnedItem,
  findItemPicture,
  loadPictureLimits,
  summarizeItem
} = require('../item-context');
const { sanitizeError } = require('../errors');

async function handlePictureUpload({ req, client, itemId, readJson }) {
  const item = await assertOwnedItem(client, itemId);
  assertEditablePicturesItem(item);
  const body = await readJson(req, { maxBytes: 15 * 1024 * 1024 });
  return client.uploadPicture({
    filename: body.filename || 'picture.jpg',
    mimeType: body.mimeType || 'image/jpeg',
    base64: body.base64 || ''
  });
}

async function handlePictureQuality({ url, client, itemId }) {
  const item = await assertOwnedItem(client, itemId);
  return buildPictureQualityReport(client, item, {
    selectedVariationId: url.searchParams.get('variation_id') || null
  });
}

async function handlePictureFixSize({ req, client, itemId, readJson }) {
  const item = await assertOwnedItem(client, itemId);
  assertEditablePicturesItem(item);
  const body = await readJson(req);
  const picture = findItemPicture(item, body.pictureId);
  if (!picture) {
    const err = new Error('Foto não encontrada.');
    err.statusCode = 404;
    throw err;
  }
  if (!picture.secure_url && !picture.url && !picture.id) {
    const err = new Error('Foto sem URL para ajuste.');
    err.statusCode = 400;
    throw err;
  }
  const bestImage = await downloadBestPictureImage(client, picture);
  if (!bestImage || !bestImage.downloaded) {
    const err = new Error('Não consegui baixar a foto.');
    err.statusCode = 400;
    throw err;
  }

  const downloaded = bestImage.downloaded;
  const originalDimensions = extractImageDimensionsFromBase64(downloaded.base64) ||
    bestImage.dimensions ||
    extractOfficialDimensions(picture);
  const optimizedDimensions = originalDimensions
    ? calculateOptimizedDimensions(originalDimensions.width, originalDimensions.height, OFFICIAL_TARGET_SIZE)
    : null;
  return {
    ok: true,
    pictureId: picture.id,
    filename: `${picture.id || 'picture'}-onframe.jpg`,
    mimeType: downloaded.mimeType,
    originalDimensions,
    optimizedDimensions,
    targetLongSide: OFFICIAL_TARGET_SIZE,
    base64: `data:${downloaded.mimeType};base64,${downloaded.base64}`
  };
}

async function handlePictureCommit({ req, client, itemId, readJson }) {
  const item = await assertOwnedItem(client, itemId);
  assertEditablePicturesItem(item);
  const body = await readJson(req);
  const pictureLimits = await loadPictureLimits(client, item);
  const payload = buildCommitPayload(item, body, { pictureLimits });
  logEvent('pictures_commit_start', {
    itemId,
    pictures: payload.pictures.length,
    variations: Array.isArray(payload.variations) ? payload.variations.length : 0
  });

  let updated;
  try {
    updated = await client.updateItem(itemId, payload);
  } catch (err) {
    logEvent('pictures_commit_error', { itemId, error: sanitizeError(err) });
    throw err;
  }
  logEvent('pictures_commit_success', { itemId, status: updated.status || null });
  return {
    ok: true,
    mode: pickMode(updated),
    item: summarizeItem(updated)
  };
}

function logEvent(event, data) {
  console.log(JSON.stringify(Object.assign({
    time: new Date().toISOString(),
    event
  }, data || {})));
}

module.exports = {
  handlePictureCommit,
  handlePictureFixSize,
  handlePictureQuality,
  handlePictureUpload
};
