// Scrutari Storage Adapter: Netlify Blob
// Uses @netlify/blobs for serverless storage on Netlify.

import { getStore } from '@netlify/blobs';

export class NetlifyBlobAdapter {
  constructor(options = {}) {
    this._storeName = options.storeName || 'scrutari-data';
    this._siteID = options.siteID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    this._store = null;
  }

  async _getStore() {
    if (!this._store) {
      this._store = getStore({ name: this._storeName, siteID: this._siteID });
    }
    return this._store;
  }

  async get(key) {
    try {
      const store = await this._getStore();
      return await store.get(key, { type: 'json' });
    } catch (e) {
      return null;
    }
  }

  async set(key, value) {
    const store = await this._getStore();
    if (typeof value !== 'string') {
      value = JSON.stringify(value);
    }
    await store.set(key, value);
  }

  async delete(key) {
    const store = await this._getStore();
    await store.delete(key);
  }

  async list() {
    const store = await this._getStore();
    const result = await store.list();
    return result.keys || [];
  }
}
