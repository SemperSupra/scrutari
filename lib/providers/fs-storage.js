// @ts-check
// Scrutari Storage Adapter: Filesystem

import * as fs from 'fs';
import * as path from 'path';

export class FileSystemStorageAdapter {
  /** @param {string} baseDir */
  constructor(baseDir) {
    this._baseDir = baseDir;
    fs.mkdirSync(baseDir, { recursive: true });
  }

  /** @param {string} key @returns {string} */
  _filePath(key) {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this._baseDir, safe + '.json');
  }

  /** @param {string} key @returns {Promise<any>} */
  async get(key) {
    const filePath = this._filePath(key);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      // Return null on corrupt or missing data
    }
    return null;
  }

  /** @param {string} key @param {any} value */
  async set(key, value) {
    const filePath = this._filePath(key);
    const tmpPath = filePath + '.tmp';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    fs.writeFileSync(tmpPath, str, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  /** @param {string} key */
  async delete(key) {
    const filePath = this._filePath(key);
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  /** @returns {Promise<string[]>} */
  async list() {
    try {
      return fs.readdirSync(this._baseDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (e) { return []; }
  }
}
