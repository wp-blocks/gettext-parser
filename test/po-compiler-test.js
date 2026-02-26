import { readFile as fsReadFile } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { EOL } from 'node:os';
import { fileURLToPath } from 'node:url';
import { po } from '../lib/index.mjs';
import { describe, test } from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

describe('PO Compiler', () => {
  describe('Headers', () => {
    test('should keep tile casing', async () => {
      const [json, poData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/headers-case.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/headers-case.po'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, poData);
    });
  });

  describe('UTF-8', () => {
    test('should compile', async () => {
      const [json, poData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-po.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/utf8.po'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, poData);
    });
  });



  describe('Plurals', () => {
    test('should compile correct plurals in POT files', async () => {
      const [json, pot] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/plural-pot.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/plural.pot'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, pot);
    });
  });

  describe('Message folding', () => {
    test('should compile without folding', async () => {
      const [json, poData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-po.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/utf8-no-folding.po'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { foldLength: 0, eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, poData);
    });

    test('should compile with different folding', async () => {
      const [json, poData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-po.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/utf8-folding-100.po'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { foldLength: 100, eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, poData);
    });
  });

  describe('Sorting', () => {
    test('should sort output entries by msgid when `sort` is `true`', async () => {
      const [json, pot] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/sort-test.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/sort-test.pot'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { sort: true, eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, pot);
    });

    test('should sort entries using a custom `sort` function', async () => {
      function compareMsgidAndMsgctxt(left, right) {
        if (left.msgid > right.msgid) {
          return 1;
        }

        if (right.msgid > left.msgid) {
          return -1;
        }

        if (left.msgctxt > right.msgctxt) {
          return 1;
        }

        if (right.msgctxt > left.msgctxt) {
          return -1;
        }

        return 0;
      }

      const [json1, json2, pot] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/sort-with-msgctxt-test-1.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/sort-with-msgctxt-test-2.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/sort-with-msgctxt-test.pot'), 'utf8')
      ]);

      const compiled1 = po.compile(JSON.parse(json1), { sort: compareMsgidAndMsgctxt, eol: EOL })
        .toString('utf8');
      const compiled2 = po.compile(JSON.parse(json2), { sort: compareMsgidAndMsgctxt, eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled1, compiled2);
      assert.strictEqual(compiled1, pot);
      assert.strictEqual(compiled2, pot);
    });
  });

  describe('Skip escaping characters', () => {
    test('should compile without escaping characters', async () => {
      const [json, poData] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-skip-escape-characters.json'), 'utf8'),
        readFile(path.join(__dirname, 'fixtures/utf8-skip-escape-characters.po'), 'utf8')
      ]);

      const compiled = po.compile(JSON.parse(json), { escapeCharacters: false, foldLength: 0, eol: EOL })
        .toString('utf8');

      assert.strictEqual(compiled, poData);
    });
  });
});
