// @ts-check
// Scrutari Storage Abstraction
// Provider-agnostic interface for key-value storage.

/** @typedef {{ get: (key: string) => Promise<any>, set: (key: string, value: any) => Promise<void>, delete?: (key: string) => Promise<void>, list?: () => Promise<string[]> }} StorageAdapter */

export class StorageProvider {
  /** @param {StorageAdapter} adapter */
  constructor(adapter) {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
      throw new Error('Storage adapter must implement get(key) and set(key, value)');
    }
    /** @type {StorageAdapter} */
    this._adapter = adapter;
  }

  /** @param {string} key @returns {Promise<any>} */
  async get(key) {
    return this._adapter.get(key);
  }

  /** @param {string} key @param {any} value */
  async set(key, value) {
    if (typeof value !== 'string') {
      value = JSON.stringify(value);
    }
    await this._adapter.set(key, value);
  }

  /** @param {string} key */
  async delete(key) {
    if (typeof this._adapter.delete === 'function') {
      await this._adapter.delete(key);
    }
  }

  /** @returns {Promise<string[]>} */
  async list() {
    if (typeof this._adapter.list === 'function') {
      return this._adapter.list();
    }
    throw new Error('Storage adapter does not support list()');
  }
}

export class MemoryStorageAdapter {
  constructor() {
    /** @type {Map<string, any>} */
    this._data = new Map();
  }

  /** @param {string} key @returns {Promise<any>} */
  async get(key) {
    const raw = this._data.get(key);
    if (raw === undefined || raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  /** @param {string} key @param {any} value */
  async set(key, value) {
    this._data.set(key, value);
  }

  /** @param {string} key */
  async delete(key) {
    this._data.delete(key);
  }

  /** @returns {Promise<string[]>} */
  async list() {
    return Array.from(this._data.keys());
  }

  clear() {
    this._data.clear();
  }
}
