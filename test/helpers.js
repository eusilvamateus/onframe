const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  buildCommitPayload,
  collectItemIdCandidates,
  extractItemId,
  normalizeItemId,
  pickMode
} = require('../service/src/items');
const { TokenStore, decrypt, encrypt } = require('../service/src/token-store');
const { MercadoLivreClient } = require('../service/src/meli-client');
const { createApp, sanitizeError, userFriendlyError } = require('../service/src/app');
const updateManager = require('../service/src/update-manager');
const { parseValue } = require('../service/src/dotenv');
const {
  buildPictureQualityReport,
  calculateOptimizedDimensions,
  calculateResolutionScore,
  extractImageDimensions,
  extractOfficialDimensions
} = require('../service/src/picture-quality');
const {
  buildPriceSummary,
  updateStandardPrice
} = require('../service/src/pricing');
const {
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteOffer,
  estimatePromotionImpact
} = require('../service/src/promotions');
const detection = require('../extension/core/detection');
const photosModel = require('../extension/modules/photos/model');
const commerceModel = require('../extension/modules/commerce/model');
const moduleRegistry = require('../extension/core/module-registry');
const icons = require('../extension/core/icons');

function fakePng(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 4, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function fakeWebpVp8x(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 4, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 4, 'ascii');
  buffer.write('VP8X', 12, 4, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function fakeDocument(selectorMap) {
  return {
    body: fakeElement(''),
    querySelector: (selector) => {
      const values = selectorMap[selector] || [];
      return values[0] || null;
    },
    querySelectorAll: (selector) => selectorMap[selector] || []
  };
}

function fakeElement(text, attributes = {}) {
  return {
    textContent: text,
    innerText: text,
    href: attributes.href || '',
    content: attributes.content || '',
    getAttribute: (name) => attributes[name] || ''
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      server.url = `http://127.0.0.1:${address.port}`;
      resolve(server);
    });
  });
}

module.exports = {
  test,
  assert,
  fs,
  os,
  path,
  vm,
  buildCommitPayload,
  collectItemIdCandidates,
  extractItemId,
  normalizeItemId,
  pickMode,
  MercadoLivreClient,
  TokenStore,
  decrypt,
  encrypt,
  createApp,
  sanitizeError,
  userFriendlyError,
  parseValue,
  buildPictureQualityReport,
  calculateOptimizedDimensions,
  calculateResolutionScore,
  extractImageDimensions,
  extractOfficialDimensions,
  buildPriceSummary,
  updateStandardPrice,
  updateManager,
  buildPromotionSummary,
  createCampaign,
  createOffer,
  deleteOffer,
  estimatePromotionImpact,
  detection,
  photosModel,
  commerceModel,
  moduleRegistry,
  icons,
  fakePng,
  fakeWebpVp8x,
  fakeDocument,
  fakeElement,
  listen
};
