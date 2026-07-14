// Scrutari Storage Adapter: Filesystem
// Uses local filesystem for data storage (Docker, dev, self-hosted).
// Uses atomic write (write to temp file, rename) for crash safety.

import fs from 'fs';
import path from 'path';

export class FileSystemStorageAdapter {
  constructor(baseDir) {
    this._baseDir = baseDir;
    fs.mkdirSync(baseDir, { recursive: true });
  }

  _filePath(key) {
    // Sanitize key — prevent directory traversal
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this._baseDir, safe + '.json');
  }

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

  async set(key, value) {
    const filePath = this._filePath(key);
    const tmpPath = filePath + '.tmp';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    fs.writeFileSync(tmpPath, str, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  async delete(key) {
    const filePath = this._filePath(key);
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // File doesn't exist — no-op
    }
  }

  async list() {
    try {
      return fs.readdirSync(this._baseDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (e) {
      return [];
    }
  }
}
