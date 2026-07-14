// Scrutari Test: Abstraction Layers
// Validates storage and geo provider interfaces work correctly

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { StorageProvider, MemoryStorageAdapter } from '../lib/storage.js';
import { GeolocationResult } from '../lib/geo.js';

describe('StorageProvider', () => {
  it('writes and reads values', async () => {
    const store = new StorageProvider(new MemoryStorageAdapter());
    await store.set('test-key', { hello: 'world' });
    const val = await store.get('test-key');
    assert.deepEqual(val, { hello: 'world' });
  });

  it('returns null for missing keys', async () => {
    const store = new StorageProvider(new MemoryStorageAdapter());
    const val = await store.get('nonexistent');
    assert.equal(val, null);
  });

  it('deletes values', async () => {
    const store = new StorageProvider(new MemoryStorageAdapter());
    await store.set('temp', 'delete-me');
    await store.delete('temp');
    assert.equal(await store.get('temp'), null);
  });

  it('lists keys', async () => {
    const store = new StorageProvider(new MemoryStorageAdapter());
    await store.set('a', 1);
    await store.set('b', 2);
    const keys = await store.list();
    assert.ok(keys.includes('a'));
    assert.ok(keys.includes('b'));
  });

  it('rejects adapter missing required methods', () => {
    assert.throws(() => new StorageProvider({}), /must implement/);
  });

  it('MemoryStorageAdapter handles concurrent access', async () => {
    const adapter = new MemoryStorageAdapter();
    await Promise.all([
      adapter.set('k1', 'v1'),
      adapter.set('k2', 'v2'),
      adapter.set('k3', 'v3'),
    ]);
    assert.equal(await adapter.get('k1'), 'v1');
    assert.equal(await adapter.get('k2'), 'v2');
    assert.equal(await adapter.get('k3'), 'v3');
  });
});

describe('GeolocationResult', () => {
  it('creates result with defaults', () => {
    const r = new GeolocationResult();
    assert.equal(r.ip, 'unknown');
    assert.equal(r.country, 'unknown');
    assert.equal(r.risk, 'unknown');
  });

  it('creates result with provided data', () => {
    const r = new GeolocationResult({ ip: '203.0.113.42', country: 'DE', type: 'Datacenter' });
    assert.equal(r.ip, '203.0.113.42');
    assert.equal(r.country, 'DE');
    assert.equal(r.type, 'Datacenter');
  });

  it('preserves extra fields', () => {
    const r = new GeolocationResult({ ip: '1.2.3.4' });
    assert.equal(r.ip, '1.2.3.4');
  });
});
