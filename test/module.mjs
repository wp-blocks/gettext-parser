import { describe, test } from 'node:test';
import assert from 'node:assert';
import { mo, po } from '../lib/index.mjs';

describe('esm module', () => {
  test('should allow named imports', () => {
    assert.strictEqual(typeof po.parse, 'function');
    assert.strictEqual(typeof po.compile, 'function');
    assert.strictEqual(typeof mo.parse, 'function');
    assert.strictEqual(typeof mo.compile, 'function');
  });
});
