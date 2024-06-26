import { promisify } from 'node:util';
import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as chai from 'chai';
import { mo } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fsReadFile);

const expect = chai.expect;
chai.config.includeStack = true;

describe('MO Parser', () => {
  describe('UTF-8 LE', () => {
    it('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-le.mo')),
        readFile(path.join(__dirname, 'fixtures/utf8-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      expect(parsed).to.deep.equal(JSON.parse(json));
    });
  });

  describe('UTF-8 BE', () => {
    it('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/utf8-be.mo')),
        readFile(path.join(__dirname, 'fixtures/utf8-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      expect(parsed).to.deep.equal(JSON.parse(json));
    });
  });

  describe('Latin-13 LE', () => {
    it('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/latin13-le.mo')),
        readFile(path.join(__dirname, 'fixtures/latin13-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      expect(parsed).to.deep.equal(JSON.parse(json));
    });
  });

  describe('Latin-13 BE', () => {
    it('should parse', async () => {
      const [moData, json] = await Promise.all([
        readFile(path.join(__dirname, 'fixtures/latin13-be.mo')),
        readFile(path.join(__dirname, 'fixtures/latin13-mo.json'), 'utf8')
      ]);

      const parsed = mo.parse(moData);

      expect(parsed).to.deep.equal(JSON.parse(json));
    });
  });
});
