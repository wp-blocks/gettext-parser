import { HEADERS, foldLine, compareMsgid, formatCharset, generateHeader } from './shared.js';
import contentType from 'content-type';

import encoding from 'encoding';
import {Compiler, GetTextComment, GetTextTranslation, GetTextTranslations, ParserOptions, Translations} from "./types.js";


type PreOutputTranslation = Partial<Omit<GetTextTranslation, 'msgstr'>> & { msgstr?: string | string[]; };

/**
 * Exposes general compiler function. Takes a translation
 * object as a parameter and returns PO object
 *
 * @param table Translation object
 * @param options Options
 * @return The compiled PO object
 */
export default function (table: GetTextTranslations, options: ParserOptions): Buffer {
  const compiler = new Compiler(table, options);

  return compiler.compile();
}

/**
 * Takes the header object and converts all headers into the lowercase format
 *
 * @param headersRaw the headers to prepare
 * @returns the headers in the lowercase format
 */
export function preparePoHeaders (headersRaw: Record<string, string>): Record<string, string> {
  return Object.keys(headersRaw).reduce((result: Record<string, string>, key) => {
    const lowerKey = key.toLowerCase();
    const value = HEADERS.get(lowerKey);

    if (typeof value === 'string') {
      result[value] = headersRaw[key];
    } else {
      result[key] = headersRaw[key];
    }

    return result;
  }, {});
}

/**
 * Creates a PO compiler object.
 *
 * @constructor
 * @param table Translation table to be compiled
 * @param options Options
 */
function Compiler (this: Compiler, table: GetTextTranslations, options: ParserOptions) {
  this._table = table ?? {
    headers: {},
    charset: undefined,
    translations: {}
  };
  this._table.translations = { ...this._table.translations };

  /** _options The Options object */
  this._options = {
    foldLength: 76,
    escapeCharacters: true,
    sort: false,
    eol: '\n',
    ...options
  };

  this._table.headers = preparePoHeaders(this._table.headers ?? {});

  this._translations = [];

  this._handleCharset();
}

/**
 * Converts a comment object to a comment string. The comment object is
 * in the form of {translator: '', reference: '', extracted: '', flag: '', previous: ''}
 *
 * @param {Record<string, string>} comments A comments object
 * @return {string} A comment string for the PO file
 */
Compiler.prototype._drawComments = function (comments: { [x: string]: string; }): string {
  /** @var {Record<string, string[]>[]} lines The comment lines to be returned */
  const lines = [];
  /** @var {{key: GetTextComment, prefix: string}} type The comment type */
  const types = [{
    key: 'translator',
    prefix: '# '
  }, {
    key: 'reference',
    prefix: '#: '
  }, {
    key: 'extracted',
    prefix: '#. '
  }, {
    key: 'flag',
    prefix: '#, '
  }, {
    key: 'previous',
    prefix: '#| '
  }];

  for (const type of types) {
    /** @var {string} value The comment type */
    const value = type.key;

    // ignore empty comments
    if (!(value in comments)) { continue; }

    const commentLines = comments[value].split(/\r?\n|\r/);

    // add comment lines to comments Array
    for (const line of commentLines) {
      lines.push(`${type.prefix}${line}`);
    }
  }

  return lines.length ? lines.join(this._options.eol) : '';
};

/**
 * Builds a PO string for a single translation object
 *
 * @param block Translation object
 * @param override Properties of this object will override `block` properties
 * @param obsolete Block is obsolete and must be commented out
 * @return Translation string for a single object
 */
Compiler.prototype._drawBlock = function (block: PreOutputTranslation, override: Partial<PreOutputTranslation> = {}, obsolete: boolean = false): string {
  const response = [];
  const msgctxt = override.msgctxt || block.msgctxt;
  const msgid = override.msgid || block.msgid;
  const msgidPlural = override.msgid_plural || block.msgid_plural;
  const msgstrData = override.msgstr || block.msgstr;
  const msgstr = Array.isArray(msgstrData) ? [...msgstrData] : [msgstrData];

  const comments: GetTextComment|undefined = override.comments || block.comments;
  if (comments) {
    const drawnComments = this._drawComments(comments);
    if (drawnComments) {
      response.push(drawnComments);
    }
  }

  if (msgctxt) {
    response.push(this._addPOString('msgctxt', msgctxt, obsolete));
  }

  response.push(this._addPOString('msgid', msgid || '', obsolete));

  if (msgidPlural) {
    response.push(this._addPOString('msgid_plural', msgidPlural, obsolete));

    msgstr.forEach((msgstr, i) => {
      response.push(this._addPOString(`msgstr[${i}]`, msgstr || '', obsolete));
    });
  } else {
    response.push(this._addPOString('msgstr', msgstr[0] || '', obsolete));
  }

  return response.join(this._options.eol);
};

/**
 * Escapes and joins a key and a value for the PO string
 *
 * @param key Key name
 * @param value Key value
 * @param obsolete PO string is obsolete and must be commented out
 * @return Joined and escaped key-value pair
 */
Compiler.prototype._addPOString = function (key: string = '', value: string = '', obsolete: boolean = false): string {
  key = key.toString();
  if (obsolete) {
    key = '#~ ' + key;
  }

    let { foldLength, eol, escapeCharacters } = this._options;

  // escape newlines and quotes
  if (escapeCharacters) {
    value = value.toString()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r');
  }

  value = value.replace(/\n/g, '\\n'); // need to escape new line characters regardless

  let lines = [value];

  if (obsolete) {
    eol = eol + '#~ ';
  }

  if (foldLength && foldLength > 0) {
    lines = foldLine(value, foldLength);
  } else {
    // split only on new lines
    if (escapeCharacters) {
      lines = value.split(/\\n/g);
      for (let i = 0; i < lines.length - 1; i++) {
        lines[i] = `${lines[i]}\\n`;
      }
      if (lines.length && lines[lines.length - 1] === '') {
        lines.splice(-1, 1);
      }
    }
  }

  if (lines.length < 2) {
    return `${key} "${lines.shift() || ''}"`;
  }

  return `${key} ""${eol}"${lines.join(`"${eol}"`)}"`;
};

/**
 * Handles header values, replaces or adds (if needed) a charset property
 */
Compiler.prototype._handleCharset = function () {
  if (this._table.headers) {
    const ct = contentType.parse(this._table.headers['Content-Type'] || 'text/plain');

    const charset = formatCharset(this._table.charset || ct.parameters.charset || 'utf-8');

    // clean up content-type charset independently using fallback if missing
    if (ct.parameters.charset) {
      ct.parameters.charset = formatCharset(ct.parameters.charset);
    }

    this._table.charset = charset;
    this._table.headers['Content-Type'] = contentType.format(ct);
  }
};

/**
 * Flatten and sort translations object
 *
 * @param section Object to be prepared (translations or obsolete)
 * @returns  Prepared array
 */
Compiler.prototype._prepareSection = function (section: Translations): PreOutputTranslation[] | undefined {
  /** response Prepared array */
  let response: GetTextTranslation[] = [];

  for (const msgctxt in section) {
    if (typeof section[msgctxt] !== 'object') {
      return;
    }

    for (const msgid of Object.keys(section[msgctxt])) {
      if (typeof section[msgctxt][msgid] !== 'object') {
        continue;
      }

      if (msgctxt === '' && msgid === '') {
        continue;
      }

      response.push(section[msgctxt][msgid]);
    }
  }

  const { sort } = this._options;

  if (sort) {
    if (typeof sort === 'function') {
      response = response.sort(sort);
    } else {
      response = response.sort(compareMsgid);
    }
  }

  return response;
};

/**
 * Compiles a translation object into a PO object
 *
 * @interface
 * @return Compiled a PO object
 */
Compiler.prototype.compile = function (): Buffer {
  if (!this._table.translations) {
    throw new Error('No translations found');
  }

  /** headerBlock */
  const headerBlock: PreOutputTranslation = (this._table.translations[''] && this._table.translations['']['']) || {};

  /** Translations */
  const translations = this._prepareSection(this._table.translations);
  let response: (PreOutputTranslation|string)[] = (translations?.map((t: unknown[]) => this._drawBlock(t)));

  if (typeof this._table.obsolete === 'object') {
    const obsolete = this._prepareSection(this._table.obsolete);
    if (obsolete && obsolete.length) {
      response = response?.concat(obsolete.map((r: unknown[]) => this._drawBlock(r, {}, true)));
    }
  }

  const eol = this._options.eol ?? '\n';

  response?.unshift(this._drawBlock(headerBlock, {
    msgstr: generateHeader(this._table.headers)
  }));

  if (this._table.charset === 'utf-8' || this._table.charset === 'ascii') {
    return Buffer.from(response?.join(eol + eol) + eol, 'utf-8');
  }

  return encoding.convert(response?.join(eol + eol) + eol, this._table.charset);
};
