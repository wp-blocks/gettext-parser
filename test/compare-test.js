import { promisify } from 'node:util';
import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import assert from 'node:assert';

import originalGettextParser from 'gettext-parser';
import * as forkedGettextParser from '../lib/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

describe('Compare with original gettext-parser', () => {
    describe('PO Parser', () => {
        test('should parse utf8.po identically', async () => {
            const poData = await readFile(path.join(__dirname, 'fixtures/utf8.po'));
            const originalParsed = originalGettextParser.po.parse(poData);
            const forkedParsed = forkedGettextParser.po.parse(poData);
            // We shouldn't assert on strict equality of Date objects or undefined vs non-existent keys, 
            // but deepStrictEqual will cover basic deep comparison.
            assert.deepStrictEqual(forkedParsed, originalParsed);
        });

        test('should parse latin13.po identically', async () => {
            const poData = await readFile(path.join(__dirname, 'fixtures/latin13.po'));
            const originalParsed = originalGettextParser.po.parse(poData);
            const forkedParsed = forkedGettextParser.po.parse(poData);
            assert.deepStrictEqual(forkedParsed, originalParsed);
        });
    });

    describe('MO Parser', () => {
        test('should parse utf8.mo identically', async () => {
            const moData = await readFile(path.join(__dirname, 'fixtures/utf8.mo'));
            const originalParsed = originalGettextParser.mo.parse(moData);
            const forkedParsed = forkedGettextParser.mo.parse(moData);
            assert.deepStrictEqual(forkedParsed, originalParsed);
        });

        test('should parse latin13.mo identically', async () => {
            const moData = await readFile(path.join(__dirname, 'fixtures/latin13.mo'));
            const originalParsed = originalGettextParser.mo.parse(moData);
            const forkedParsed = forkedGettextParser.mo.parse(moData);
            assert.deepStrictEqual(forkedParsed, originalParsed);
        });
    });

    describe('PO Compiler', () => {
        test('should compile utf8-po.json identically', async () => {
            const json = await readFile(path.join(__dirname, 'fixtures/utf8-po.json'), 'utf8');
            const parsed = JSON.parse(json);
            const originalCompiled = originalGettextParser.po.compile(parsed);
            const forkedCompiled = forkedGettextParser.po.compile(parsed);
            assert.deepStrictEqual(forkedCompiled, originalCompiled);
        });
    });

    describe('MO Compiler', () => {
        test('should compile utf8-mo.json identically', async () => {
            const json = await readFile(path.join(__dirname, 'fixtures/utf8-mo.json'), 'utf8');
            const parsed = JSON.parse(json);
            const originalCompiled = originalGettextParser.mo.compile(parsed);
            const forkedCompiled = forkedGettextParser.mo.compile(parsed);
            assert.deepStrictEqual(forkedCompiled, originalCompiled);
        });
    });
});
