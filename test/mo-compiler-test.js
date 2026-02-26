import { promisify } from 'node:util';
import path from 'node:path';
import { mo } from '../lib/index.mjs';
import { readFile as fsReadFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

describe('MO Compiler', () => {
  describe('UTF-8', () => {
    test('should compile', async () => {
      const [json, moData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-po.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/utf8.mo'))
      ]);

      const compiled = mo.compile(JSON.parse(json));

      assert.deepStrictEqual(compiled.toString('utf8'), moData.toString('utf8'));
    });
  });

});
