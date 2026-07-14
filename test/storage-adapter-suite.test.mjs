// Scrutari Storage Adapter Abstract Test Suite
// Every storage adapter must pass these tests to be considered compliant.
// Import this file's testStorageAdapter function into your specific adapter test.
// Self-test at the bottom validates the MemoryStorageAdapter.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../lib/storage.js';

export function testStorageAdapter(name, createAdapter) {
  describe(`Storage adapter: ${name}`, () => {
    it('writes and reads string values', async () => {
      const store = createAdapter();
      await store.set('key1', 'value1');
      const val = await store.get('key1');
      assert.equal(val, 'value1');
    });

    it('writes and reads JSON values', async () => {
      const store = createAdapter();
      await store.set('obj', { a: 1, b: [2, 3] });
      assert.deepEqual(await store.get('obj'), { a: 1, b: [2, 3] });
    });

    it('returns null for missing keys', async () => {
      const store = createAdapter();
      assert.equal(await store.get('nonexistent'), null);
    });

    it('deletes keys', async () => {
      const store = createAdapter();
      await store.set('temp', 'x');
      await store.delete('temp');
      assert.equal(await store.get('temp'), null);
    });

    it('overwrites existing keys', async () => {
      const store = createAdapter();
      await store.set('k', 'v1');
      await store.set('k', 'v2');
      assert.equal(await store.get('k'), 'v2');
    });

    it('handles deeply nested objects', async () => {
      const store = createAdapter();
      const deep = { level1: { level2: { level3: { level4: 'deep' } } } };
      await store.set('deep', deep);
      assert.deepEqual(await store.get('deep'), deep);
    });

    it('handles special characters in keys', async () => {
      const store = createAdapter();
      await store.set('key.with.dots', 1);
      await store.set('key-with-dashes', 2);
      assert.equal(await store.get('key.with.dots'), 1);
      assert.equal(await store.get('key-with-dashes'), 2);
    });

    it('is idempotent on repeated writes', async () => {
      const store = createAdapter();
      await store.set('idemp', { data: 'test' });
      await store.set('idemp', { data: 'test' });
      assert.deepEqual(await store.get('idemp'), { data: 'test' });
    });
  });
}

// Self-test against MemoryStorageAdapter
testStorageAdapter('MemoryStorageAdapter', () => new MemoryStorageAdapter());
