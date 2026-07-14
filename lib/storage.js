// Scrutari Storage Abstraction
// Provider-agnostic interface for key-value storage.
// Supports Netlify Blob, filesystem, AWS S3, etc.
//
// Usage:
//   import { StorageProvider } from './lib/storage.js';
//   const store = new StorageProvider(adapter);
//   await store.set('key', value);
//   const value = await store.get('key');

// Storage adapter interface:
//   get(key) → Promise<any>  — retrieve value, null if not found
//   set(key, value) → Promise<void> — store value
//   delete(key) → Promise<void> — remove key
//   list() → Promise<string[]> — list all keys

export class StorageProvider {
  constructor(adapter) {
    if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
      throw new Error('Storage adapter must implement get(key) and set(key, value)');
    }
    this._adapter = adapter;
  }

  async get(key) {
    return this._adapter.get(key);
  }

  async set(key, value) {
    if (typeof value !== 'string') {
      value = JSON.stringify(value);
    }
    await this._adapter.set(key, value);
  }

  async delete(key) {
    if (typeof this._adapter.delete === 'function') {
      await this._adapter.delete(key);
    }
  }

  async list() {
    if (typeof this._adapter.list === 'function') {
      return this._adapter.list();
    }
    throw new Error('Storage adapter does not support list()');
  }
}

// In-memory adapter for testing
export class MemoryStorageAdapter {
  constructor() {
    this._data = new Map();
  }

  async get(key) {
    const raw = this._data.get(key);
    if (raw === undefined || raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  async set(key, value) {
    this._data.set(key, value);
  }

  async delete(key) {
    this._data.delete(key);
  }

  async list() {
    return Array.from(this._data.keys());
  }

  clear() {
    this._data.clear();
  }
}
