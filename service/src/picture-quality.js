const OFFICIAL_TARGET_SIZE = 1200;

async function buildPictureQualityReport(client, item, options = {}) {
  const selectedVariationId = options.selectedVariationId || null;
  const pictures = selectPicturesForReport(item, selectedVariationId);
  const results = [];

  for (let index = 0; index < pictures.length; index += 1) {
    const picture = pictures[index];
    const role = selectedVariationId ? 'variation_thumbnail' : index === 0 ? 'thumbnail' : 'other';
    const dimensions = await resolvePictureDimensions(client, picture);

    results.push(summarizePictureQuality({
      picture,
      role,
      resolution: buildResolutionSummary(dimensions)
    }));
  }

  return {
    ok: true,
    itemId: item.id,
    selectedVariationId,
    targetSize: OFFICIAL_TARGET_SIZE,
    source: 'mercadolivre_api',
    summary: summarizeReport(results),
    pictures: results
  };
}

async function resolvePictureDimensions(client, picture) {
  const official = extractOfficialDimensions(picture);
  const measured = await resolveMeasuredPictureDimensions(client, picture);
  return chooseBestDimensions(measured, official);
}

async function resolveMeasuredPictureDimensions(client, picture) {
  const best = await downloadBestPictureImage(client, picture);
  return best && best.dimensions ? best.dimensions : null;
}

async function downloadBestPictureImage(client, picture) {
  if (!client || typeof client.downloadImage !== 'function') return null;

  let best = null;
  for (const url of buildPictureDownloadCandidates(picture)) {
    const downloaded = await safeCall(() => client.downloadImage(url), null);
    if (!downloaded || !downloaded.base64) continue;
    const measured = extractImageDimensionsFromBase64(downloaded.base64);
    if (!measured) continue;
    const candidate = {
      url,
      downloaded,
      dimensions: Object.assign({}, measured, { source: 'measured' })
    };
    if (!best || compareDimensions(candidate.dimensions, best.dimensions) > 0) best = candidate;
    if (Math.max(candidate.dimensions.width, candidate.dimensions.height) >= OFFICIAL_TARGET_SIZE) break;
  }
  return best;
}

function chooseBestDimensions(...values) {
  return values.filter(Boolean).sort(compareDimensions).pop() || null;
}

function compareDimensions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const aLong = Math.max(Number(a.width) || 0, Number(a.height) || 0);
  const bLong = Math.max(Number(b.width) || 0, Number(b.height) || 0);
  if (aLong !== bLong) return aLong - bLong;
  return ((Number(a.width) || 0) * (Number(a.height) || 0)) -
    ((Number(b.width) || 0) * (Number(b.height) || 0));
}

function buildPictureDownloadCandidates(picture) {
  const urls = [];
  const sourceUrls = [picture && picture.secure_url, picture && picture.url]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const assetIds = new Set([
    normalizePictureAssetId(picture && picture.id),
    ...sourceUrls.map(extractPictureAssetIdFromUrl)
  ].filter(Boolean));

  for (const assetId of assetIds) {
    urls.push(`https://http2.mlstatic.com/D_NQ_NP_2X_${assetId}-F.webp`);
  }
  urls.push(...sourceUrls);
  return Array.from(new Set(urls));
}

function normalizePictureAssetId(value) {
  const text = String(value || '').trim();
  if (!/^\d{3,8}-[A-Z]{2,4}\d{6,20}_\d{4,8}$/i.test(text)) return null;
  return text;
}

function extractPictureAssetIdFromUrl(value) {
  let pathname = '';
  try {
    pathname = new URL(String(value || '')).pathname;
  } catch (err) {
    pathname = String(value || '');
  }
  const filename = pathname.split('/').pop() || '';
  const withoutExtension = filename.replace(/\.(?:jpe?g|png|webp)(?:\?.*)?$/i, '');
  const withoutPrefix = withoutExtension
    .replace(/^D_/i, '')
    .replace(/^NQ_NP_2X_/i, '')
    .replace(/^NQ_NP_/i, '');
  return normalizePictureAssetId(withoutPrefix.replace(/-[A-Z]$/i, ''));
}

function summarizePictureQuality({ picture, role, resolution }) {
  let status = 'ok';
  const canOptimize = Boolean(resolution && resolution.belowIdeal);

  if (resolution && resolution.belowIdeal) {
    status = 'attention';
  }

  if ((!resolution || !resolution.available) && status === 'ok') {
    status = 'unknown';
  }

  return {
    pictureId: picture.id || null,
    role,
    dimensions: resolution && resolution.available
      ? { width: resolution.width, height: resolution.height, source: resolution.source }
      : null,
    resolution,
    status,
    canFixSize: canOptimize,
    canOptimize,
    message: qualityOkMessage(resolution),
    remedy: canOptimize ? 'Pode otimizar.' : null
  };
}

function buildResolutionSummary(dimensions) {
  if (!dimensions || !dimensions.width || !dimensions.height) {
    return {
      available: false,
      width: null,
      height: null,
      source: null,
      score: null,
      targetLongSide: OFFICIAL_TARGET_SIZE,
      belowIdeal: false,
      optimizedWidth: null,
      optimizedHeight: null
    };
  }

  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  const optimized = calculateOptimizedDimensions(width, height, OFFICIAL_TARGET_SIZE);
  return {
    available: true,
    width,
    height,
    source: dimensions.source || 'measured',
    score: calculateResolutionScore(width, height, OFFICIAL_TARGET_SIZE),
    targetLongSide: OFFICIAL_TARGET_SIZE,
    belowIdeal: Math.max(width, height) < OFFICIAL_TARGET_SIZE,
    optimizedWidth: optimized.width,
    optimizedHeight: optimized.height
  };
}

function calculateResolutionScore(width, height, targetLongSide = OFFICIAL_TARGET_SIZE) {
  const longSide = Math.max(Number(width) || 0, Number(height) || 0);
  const target = Number(targetLongSide) || OFFICIAL_TARGET_SIZE;
  if (!longSide || !target) return null;
  return Math.max(1, Math.min(100, Math.round((longSide / target) * 100)));
}

function calculateOptimizedDimensions(width, height, targetLongSide = OFFICIAL_TARGET_SIZE) {
  const sourceWidth = Number(width) || 0;
  const sourceHeight = Number(height) || 0;
  const target = Number(targetLongSide) || OFFICIAL_TARGET_SIZE;
  if (!sourceWidth || !sourceHeight) return { width: target, height: target };

  const longSide = Math.max(sourceWidth, sourceHeight);
  if (longSide === target) return { width: sourceWidth, height: sourceHeight };
  const scale = target / longSide;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

function qualityOkMessage(resolution) {
  if (resolution && resolution.available) {
    return `${resolution.width} x ${resolution.height}px, ${resolution.score}% do ideal.`;
  }
  return 'Sem leitura de dimensão.';
}

function extractOfficialDimensions(picture) {
  const direct = parseSize(picture && (picture.size || picture.max_size));
  if (direct) return direct;

  const variations = picture && Array.isArray(picture.variations) ? picture.variations : [];
  let best = null;
  for (const variation of variations) {
    const parsed = parseSize(variation && variation.size);
    if (!parsed) continue;
    if (!best || parsed.width * parsed.height > best.width * best.height) best = parsed;
  }
  return best;
}

function parseSize(value) {
  const match = String(value || '').match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    source: 'official'
  };
}

function extractImageDimensionsFromBase64(value) {
  const buffer = Buffer.from(stripDataUrl(value), 'base64');
  return extractImageDimensions(buffer);
}

function extractImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  return extractPngDimensions(buffer) || extractJpegDimensions(buffer) || extractWebpDimensions(buffer);
}

function extractPngDimensions(buffer) {
  const isPng = buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a &&
    buffer.toString('ascii', 12, 16) === 'IHDR';
  if (!isPng) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    source: 'measured'
  };
}

function extractJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return null;
    if (isJpegStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        source: 'measured'
      };
    }
    offset += 2 + length;
  }
  return null;
}

function isJpegStartOfFrame(marker) {
  return [
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf
  ].includes(marker);
}

function extractWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) return null;

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return {
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
        source: 'measured'
      };
    }

    if (chunkType === 'VP8L' && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const b0 = buffer[dataOffset + 1];
      const b1 = buffer[dataOffset + 2];
      const b2 = buffer[dataOffset + 3];
      const b3 = buffer[dataOffset + 4];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        source: 'measured'
      };
    }

    if (chunkType === 'VP8 ' && chunkSize >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        source: 'measured'
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function stripDataUrl(value) {
  return String(value || '').replace(/^data:[^,]+,/i, '');
}

function selectPicturesForReport(item, selectedVariationId) {
  const pictures = Array.isArray(item && item.pictures) ? item.pictures : [];
  if (!selectedVariationId || !Array.isArray(item.variations)) return pictures;

  const selected = item.variations.find((variation) => String(variation.id) === String(selectedVariationId));
  if (!selected) return [];
  const pictureIds = selected && Array.isArray(selected.picture_ids) ? selected.picture_ids : [];
  if (!pictureIds.length) return pictures;

  const byId = new Map(pictures.map((picture) => [picture.id, picture]));
  return pictureIds.map((id) => byId.get(id)).filter(Boolean);
}

function summarizeReport(pictures) {
  const total = pictures.length;
  const belowIdealCount = pictures.filter((picture) => picture.resolution && picture.resolution.belowIdeal).length;
  const unknown = pictures.filter((picture) => picture.status === 'unknown').length;
  const optimizableCount = pictures.filter((picture) => picture.canOptimize || picture.canFixSize).length;
  let status = 'ok';
  if (belowIdealCount || unknown) status = 'attention';

  return {
    status,
    total,
    unknown,
    fixable: optimizableCount,
    belowIdealCount,
    optimizableCount,
    message: summarizeMessage({ total, unknown, belowIdealCount })
  };
}

function summarizeMessage({ total, unknown, belowIdealCount }) {
  if (belowIdealCount) return `${belowIdealCount}/${total} abaixo do ideal`;
  if (unknown) return 'Dimensão parcial';
  return 'Fotos em boa resolução';
}

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    return fallback;
  }
}

module.exports = {
  OFFICIAL_TARGET_SIZE,
  buildPictureQualityReport,
  buildResolutionSummary,
  calculateOptimizedDimensions,
  calculateResolutionScore,
  downloadBestPictureImage,
  extractImageDimensions,
  extractImageDimensionsFromBase64,
  extractOfficialDimensions
};
