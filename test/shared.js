import { promisify } from 'node:util';
import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { compareMsgid, foldLine, formatCharset, generateHeader, parseHeader, parseNPluralFromHeadersSafely } from '../lib/shared.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

describe('Shared functions', () => {
  describe('formatCharset', () => {
    test('should default to iso-8859-1', () => {
      assert.strictEqual(formatCharset(), 'iso-8859-1');
    });

    test('should normalize UTF8 to utf-8', () => {
      assert.strictEqual(formatCharset('UTF8'), 'utf-8');
    });
  });

  describe('parseHeader', () => {
    test('should return an empty object by default', () => {
      assert.deepStrictEqual(parseHeader(), {});
    });

    test('should convert a header string into an object', async () => {
      const str = `Project-Id-Version: project 1.0.2
POT-Creation-Date: 2012-05-18 14:28:00+03:00
content-type: text/plain; charset=utf-8
Plural-Forms: nplurals=2; plural=(n!=1);
mime-version: 1.0
X-Poedit-SourceCharset: UTF-8`;

      const headers = parseHeader(str);

      const expectedKeys = [
        'Project-Id-Version',
        'POT-Creation-Date',
        'Content-Type',
        'Plural-Forms',
        'mime-version',
        'X-Poedit-SourceCharset'
      ];

      for (const key of expectedKeys) {
        assert.ok(Object.hasOwn(headers, key));
      }
    });
  });

  describe('generateHeader', () => {
    test('should return an empty string by default', () => {
      assert.strictEqual(generateHeader(), '');
    });

    test('should convert a header object into a string', async () => {
      const json = await readFile(path.join(__dirname, 'fixtures/headers-case.json'), 'utf8');
      const { headers } = JSON.parse(json);

      const headerKeys = Object.keys(headers);
      const headerString = generateHeader(headers);

      headerKeys.forEach(key => {
        assert.ok(headerString.includes(key));
        assert.ok(headerString.includes(headers[key]));
      });

      assert.match(headerString, /\n$/, 'Non-empty header has to end with newline');
    });
  });

  describe('foldLine', () => {
    test('should not fold when not necessary', () => {
      const line = 'abc def ghi';
      const folded = foldLine(line);

      assert.strictEqual(line, folded.join(''));
      assert.strictEqual(folded.length, 1);
    });

    test('should force fold with newline', () => {
      const line = 'abc \ndef \nghi';
      const folded = foldLine(line);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['abc \n', 'def \n', 'ghi']);
      assert.strictEqual(folded.length, 3);
    });

    test('should fold the line into multiple lines with the right length', () => {
      const line = Array.from({ length: 75 }, () => 'a').join('') + '\\aaaaa\\aaaa';
      const folded = foldLine(line);
      assert.strictEqual(folded.length, 2);
      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\',
        'aaaaa\\aaaa'
      ]);
    });

    test('should fold at default length', () => {
      const expected = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum pretium ',
        'a nunc ac fringilla. Nulla laoreet tincidunt tincidunt. Proin tristique ',
        'vestibulum mauris non aliquam. Vivamus volutpat odio nisl, sed placerat ',
        'turpis sodales a. Vestibulum quis lectus ac elit sagittis sodales ac a ',
        'felis. Nulla iaculis, nisl ut mattis fringilla, tortor quam tincidunt ',
        'lorem, quis feugiat purus felis ut velit. Donec euismod eros ut leo ',
        'lobortis tristique.'
      ];
      const folded = foldLine(expected.join(''));
      assert.deepStrictEqual(folded, expected);
      assert.strictEqual(folded.length, 7);
    });

    test('should force fold white space', () => {
      const line = 'abc def ghi';
      const folded = foldLine(line, 5);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['abc ', 'def ', 'ghi']);
      assert.strictEqual(folded.length, 3);
    });

    test('should ignore leading spaces', () => {
      const line = '    abc def ghi';
      const folded = foldLine(line, 5);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['    a', 'bc ', 'def ', 'ghi']);
      assert.strictEqual(folded.length, 4);
    });

    test('should force fold special character', () => {
      const line = 'abcdef--ghi';
      const folded = foldLine(line, 5);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['abcde', 'f--', 'ghi']);
      assert.strictEqual(folded.length, 3);
    });

    test('should force fold last special character', () => {
      const line = 'ab--cdef--ghi';
      const folded = foldLine(line, 10);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['ab--cdef--', 'ghi']);
      assert.strictEqual(folded.length, 2);
    });

    test('should force fold only if at least one non-special character', () => {
      const line = '--abcdefghi';
      const folded = foldLine(line, 5);

      assert.strictEqual(line, folded.join(''));
      assert.deepStrictEqual(folded, ['--abc', 'defgh', 'i']);
      assert.strictEqual(folded.length, 3);
    });
  });

  describe('parseNPluralFromHeadersSafely', () => {
    test('should return parsed value', () => {
      const headers = { 'Plural-Forms': 'nplurals=10; plural=n' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 10);
    });

    test('should return parsed value (missing plural declaration)', () => {
      const headers = { 'Plural-Forms': 'nplurals=10' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 10);
    });

    test('should return fallback value ("Plural-Forms" header is absent)', () => {
      const nplurals = parseNPluralFromHeadersSafely();

      assert.strictEqual(nplurals, 1);
    });

    test('should return fallback value (nplurals is not declared)', () => {
      const headers = { 'Plural-Forms': '; plural=n' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 1);
    });

    test('should return fallback value (nplurals is set to zero)', () => {
      const headers = { 'Plural-Forms': 'nplurals=0' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 1);
    });

    test('should return fallback value (nplurals is set to negative value)', () => {
      const headers = { 'Plural-Forms': 'nplurals=-99' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 1);
    });

    test('should return fallback value (failed to parse nplurals value)', () => {
      const headers = { 'Plural-Forms': 'nplurals=foo' };
      const nplurals = parseNPluralFromHeadersSafely(headers);

      assert.strictEqual(nplurals, 1);
    });
  });
});

describe('Strings Sorting function', () => {
  test('should return -1 when left msgid is less than right msgid', () => {
    const result = compareMsgid({ msgid: 'a' }, { msgid: 'b' });
    assert.strictEqual(result, -1);
  });

  test('should return 1 when left msgid is greater than right msgid', () => {
    const result = compareMsgid({ msgid: 'b' }, { msgid: 'a' });
    assert.strictEqual(result, 1);
  });

  test('should return 0 when left msgid is equal to right msgid', () => {
    const result = compareMsgid({ msgid: 'a' }, { msgid: 'a' });
    assert.strictEqual(result, 0);
  });

  test('should return -1 when msgid is the uppercased version of the other msgid', () => {
    const result = compareMsgid({ msgid: 'A' }, { msgid: 'a' });
    assert.strictEqual(result, -1);
  });

  test('should return 1 when the msgid is a number and other is a string', () => {
    const result = compareMsgid({ msgid: 'A' }, { msgid: '1' });
    assert.strictEqual(result, 1);
  });

  test('should return the right result using buffer comparison', () => {
    const result = compareMsgid({ msgid: Buffer.from('a') }, { msgid: Buffer.from('b') });
    assert.strictEqual(result, -1);
  });

  test('should return the right result using buffer (both directions)', () => {
    const result = compareMsgid({ msgid: Buffer.from('c') }, { msgid: Buffer.from('b') });
    assert.strictEqual(result, 1);
  });

  test('should return the right result using buffer comparison (checking uppercase)', () => {
    const result = compareMsgid({ msgid: Buffer.from('A') }, { msgid: Buffer.from('a') });
    assert.strictEqual(result, -1);
  });
});
