import { promisify } from 'node:util';
import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { mo } from '../lib/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

describe('MO Parser', () => {
  describe('UTF-8', () => {
    test('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8.mo')),
        readFile(path.join(__dirname, 'fixtures/utf8-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      assert.deepStrictEqual(parsed, JSON.parse(json));
    });
  });

  describe('Latin-13', () => {
    test('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/latin13.mo')),
        readFile(path.join(__dirname, 'fixtures/latin13-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      assert.deepStrictEqual(parsed, JSON.parse(json));
    });
  });
});
