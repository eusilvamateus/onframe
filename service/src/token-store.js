const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

class TokenStore {
  constructor({ env } = {}) {
    this.env = env || process.env;
    this.filePath = this.env.ML_TOKEN_STORE_PATH || path.join(
      this.env.APPDATA || os.homedir(),
      'Onblide',
      'mercadolivre-photo-manager',
      'tokens.json'
    );
  }

  async read() {
    const database = await this.readDatabase();
    if (!database || !database.activeUserId) return null;
    return database.accounts[String(database.activeUserId)] || null;
  }

  async readDatabase() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const payload = JSON.parse(raw);
      const decrypted = JSON.parse(decrypt(payload, getKey(this.env)));
      if (!decrypted || decrypted.v !== 2 || !decrypted.accounts || typeof decrypted.accounts !== 'object') {
        return null;
      }
      return normalizeDatabase(decrypted);
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      return null;
    }
  }

  async write(token, account) {
    const database = await this.readDatabase() || createEmptyDatabase();
    const entry = buildAccountEntry(token, account, database.accounts[String(token && token.user_id ? token.user_id : '')]);
    const userId = String(entry.user_id);
    database.accounts[userId] = entry;
    database.activeUserId = userId;
    await this.writeDatabase(database);
    return entry;
  }

  async listAccounts() {
    const database = await this.readDatabase() || createEmptyDatabase();
    return summarizeAccounts(database);
  }

  async listAccountTokens() {
    const database = await this.readDatabase() || createEmptyDatabase();
    return Object.values(database.accounts).map((account) => Object.assign({}, account, {
      active: String(account.user_id) === String(database.activeUserId || '')
    }));
  }

  async readAccount(userId) {
    const database = await this.readDatabase() || createEmptyDatabase();
    return database.accounts[String(userId || '').trim()] || null;
  }

  async setActive(userId) {
    const database = await this.readDatabase() || createEmptyDatabase();
    const normalized = String(userId || '').trim();
    if (!normalized || !database.accounts[normalized]) {
      const err = new Error('Conta não encontrada.');
      err.statusCode = 404;
      throw err;
    }
    database.activeUserId = normalized;
    await this.writeDatabase(database);
    return database.accounts[normalized];
  }

  async setAccountEnabled(userId, enabled) {
    const database = await this.readDatabase() || createEmptyDatabase();
    const normalized = String(userId || '').trim();
    if (!normalized || !database.accounts[normalized]) {
      const err = new Error('Conta não encontrada.');
      err.statusCode = 404;
      throw err;
    }
    database.accounts[normalized].enabled = enabled !== false;
    database.accounts[normalized].updated_at = Date.now();
    await this.writeDatabase(database);
    return database.accounts[normalized];
  }

  async removeAccount(userId) {
    const database = await this.readDatabase() || createEmptyDatabase();
    const normalized = String(userId || '').trim();
    if (!normalized || !database.accounts[normalized]) return null;
    const removed = database.accounts[normalized];
    delete database.accounts[normalized];
    if (String(database.activeUserId || '') === normalized) {
      database.activeUserId = Object.keys(database.accounts)[0] || null;
    }
    await this.writeDatabase(database);
    return removed;
  }

  async clear() {
    const active = await this.read();
    if (!active || !active.user_id) return;
    await this.removeAccount(active.user_id);
  }

  async clearAll() {
    try {
      await fs.unlink(this.filePath);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  async writeDatabase(database) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const encrypted = encrypt(JSON.stringify(normalizeDatabase(database)), getKey(this.env));
    await fs.writeFile(this.filePath, JSON.stringify(encrypted), { mode: 0o600 });
  }
}

function summarizeAccounts(database) {
  return Object.values(database.accounts || {}).map((account) => ({
      user_id: account.user_id,
      nickname: account.nickname || null,
      site_id: account.site_id || null,
      permalink: account.permalink || null,
      status: account.status || null,
      expires_at: account.expires_at || null,
      connected_at: account.connected_at || null,
      updated_at: account.updated_at || null,
      enabled: account.enabled !== false,
      active: String(account.user_id) === String(database.activeUserId || '')
  }));
}

function createEmptyDatabase() {
  return {
    v: 2,
    activeUserId: null,
    accounts: {}
  };
}

function normalizeDatabase(database) {
  const normalized = createEmptyDatabase();
  normalized.activeUserId = database.activeUserId ? String(database.activeUserId) : null;
  for (const [key, account] of Object.entries(database.accounts || {})) {
    if (!account || !account.user_id || !account.refresh_token) continue;
    normalized.accounts[String(account.user_id)] = Object.assign({}, account, {
      user_id: account.user_id,
      enabled: account.enabled !== false
    });
    if (String(key) !== String(account.user_id)) {
      normalized.accounts[String(account.user_id)] = normalized.accounts[String(key)] || normalized.accounts[String(account.user_id)];
    }
  }
  if (normalized.activeUserId && !normalized.accounts[normalized.activeUserId]) {
    normalized.activeUserId = Object.keys(normalized.accounts)[0] || null;
  }
  if (!normalized.activeUserId) {
    normalized.activeUserId = Object.keys(normalized.accounts)[0] || null;
  }
  return normalized;
}

function buildAccountEntry(token, account, existing) {
  const now = Date.now();
  const merged = Object.assign({}, existing || {}, token || {});
  const userId = merged.user_id || account && (account.id || account.user_id);
  if (!userId) {
    const err = new Error('Token sem user_id.');
    err.statusCode = 400;
    throw err;
  }

  return Object.assign({}, merged, {
    user_id: userId,
    nickname: account && account.nickname ? account.nickname : merged.nickname || null,
    site_id: account && account.site_id ? account.site_id : merged.site_id || null,
    permalink: account && account.permalink ? account.permalink : merged.permalink || null,
    status: account && account.status ? account.status : merged.status || null,
    enabled: merged.enabled !== false,
    connected_at: merged.connected_at || now,
    updated_at: now
  });
}

function getKey(env) {
  const secret = env.ONBLIDE_TOKEN_SECRET || `${os.userInfo().username}@${os.hostname()}:onblide-mercadolivre`;
  return crypto.scryptSync(secret, 'onblide-ml-token-store-v1', 32);
}

function encrypt(plainText, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url')
  };
}

function decrypt(payload, key) {
  if (!payload || payload.alg !== 'aes-256-gcm') throw new Error('Token store invalido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  TokenStore,
  decrypt,
  encrypt
};
