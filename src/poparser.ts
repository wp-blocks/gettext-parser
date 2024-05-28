import encoding from 'encoding';
import { formatCharset, parseHeader, parseNPluralFromHeadersSafely, ParserError } from './shared.js';
import { Transform, TransformOptions } from 'readable-stream';
import util from 'util';
import {PoParserTransform, GetTextComment, GetTextTranslation, GetTextTranslations, ParserOptions, Translations} from "./types.js";

/** Po parser options*/
type Options = { defaultCharset?: string; validation?: boolean; };

/** A single Node object in the PO file */
export interface Node {
    key?: string;
    type?: number;
    value: string;
    quote?: string;
    obsolete?: boolean;
    comments?: GetTextComment | undefined;
}

type DoneCallback = (...args: unknown[]) => void

/**
 * Parses a PO object into translation table
 *
 * @param input PO object
 * @param [options] Optional options with defaultCharset and validation
 */
export function poParse (input: string | Buffer, options: Options = {}) {
  const parser = new Parser(input, options);

  return parser.parse();
}

/**
 * Parses a PO stream, emits translation table in object mode
 *
 * @param [options] Optional options with defaultCharset and validation
 * @param [transformOptions] Optional stream options
 */
export function poStream (options: Options = {}, transformOptions: TransformOptions = {}) {
  return new PoParserTransform(options, transformOptions);
}

type Parser = {
  _validation: boolean;
  _charset: string;
  _lex: Node[];
  _escaped: boolean;
  _node:  Partial<Node>;
  _state: number;
  _lineNumber: number;
  _fileContents: string | Buffer;
  _handleCharset: (buf: string | Buffer) => string;
  states: {
      none: number;
      header: number;
      msgctxt: number;
      msgid: number;
      msgid_plural: number;
      msgstr: number;
      msgstr_plural: number;
      obsolete: number;
      comment: number;
      eol: number;
  }
}

/**
 * Creates a PO parser object.
 * If a PO object is a string, UTF-8 will be used as the charset
 *
 * @param fileContents PO object
 * @param options Options with defaultCharset and validation
 */
function Parser (this: Parser, fileContents: string | Buffer, {defaultCharset = 'iso-8859-1', validation = false}: Options) {
  this._validation = validation;
  this._charset = defaultCharset;

  this._lex = [];
  this._escaped = false;
  this._node = {};
  this._state = this.states.none;
  this._lineNumber = 1;

  if (typeof fileContents === 'string') {
    this._charset = 'utf-8';
    this._fileContents = fileContents;
  } else {
    this._fileContents = this._handleCharset(fileContents);
  }
}

/**
 * Parses the PO object and returns translation table
 *
 * @return {Object} Translation table
 */
Parser.prototype.parse = function (): GetTextTranslations {
  this._lexer(this._fileContents);

  return this._finalize(this._lex);
};

/**
 * Detects charset for PO strings from the header
 *
 * @param buf Header value
 */
Parser.prototype._handleCharset = function (buf: string | Buffer = '') {
  /** @type {string} */
  const str = buf.toString();
  let pos;
  let headers = '';
  let match;

  if ((pos = str.search(/^\s*msgid/im)) >= 0) {
    pos = pos + str.substring(pos + 5).search(/^\s*(msgid|msgctxt)/im);
    headers = str.substring(0, pos >= 0 ? pos + 5 : str.length);
  }

  if ((match = headers.match(/[; ]charset\s*=\s*([\w-]+)(?:[\s;]|\\n)*"\s*$/mi))) {
    this._charset = formatCharset(match[1], this._charset);
  }

  if (this._charset === 'utf-8') {
    return str;
  }

  return this._toString(buf);
};

/**
 * Converts buffer to string
 * @param buf Buffer to convert
 * @return Converted string
 */
Parser.prototype._toString = function (buf: string | Buffer): string {
  return encoding.convert(buf, 'utf-8', this._charset).toString('utf-8');
};

/**
 * State constants for parsing FSM
 */
Parser.prototype.states = {
  none: 0x01,
  comments: 0x02,
  key: 0x03,
  string: 0x04,
  obsolete: 0x05
};

/**
 * Value types for lexer
 */
Parser.prototype.types = {
  comments: 0x01,
  key: 0x02,
  string: 0x03,
  obsolete: 0x04
};

/**
 * String matches for lexer
 */
Parser.prototype.symbols = {
  whitespace: /\s/,
  key: /[\w\-[\]]/,
  keyNames: /^(?:msgctxt|msgid(?:_plural)?|msgstr(?:\[\d+])?)$/
};
/**
 * Token parser. Parsed state can be found from this._lex
 *
 * @param chunk String
 * @throws {ParserError} Throws a SyntaxError if the value doesn't match the key names.
 */
Parser.prototype._lexer = function (chunk: string) {
  let chr;

  for (let i = 0, len = chunk.length; i < len; i++) {
    chr = chunk.charAt(i);

    if (chr === '\n') {
      this._lineNumber += 1;
    }

    switch (this._state) {
      case this.states.none:
      case this.states.obsolete:
        if (chr === '"' || chr === "'") {
          this._node = {
            type: this.types.string,
            value: '',
            quote: chr
          };
          this._lex.push(/** @type {Node} */ (this._node));
          this._state = this.states.string;
        } else if (chr === '#') {
          this._node = {
            type: this.types.comments,
            value: ''
          };
          this._lex.push(/** @type {Node} */ (this._node));
          this._state = this.states.comments;
        } else if (!chr.match(this.symbols.whitespace)) {
          this._node = {
            type: this.types.key,
            value: chr
          };
          if (this._state === this.states.obsolete) {
            this._node.obsolete = true;
          }
          this._lex.push(/** @type {Node} */ (this._node));
          this._state = this.states.key;
        }
        break;
      case this.states.comments:
        if (chr === '\n') {
          this._state = this.states.none;
        } else if (chr === '~' && this._node.value === '') {
          this._node.value += chr;
          this._state = this.states.obsolete;
        } else if (chr !== '\r') {
          this._node.value += chr;
        }
        break;
      case this.states.string:
        if (this._escaped) {
          switch (chr) {
            case 't':
              this._node.value += '\t';
              break;
            case 'n':
              this._node.value += '\n';
              break;
            case 'r':
              this._node.value += '\r';
              break;
            default:
              this._node.value += chr;
          }
          this._escaped = false;
        } else {
          if (chr === this._node.quote) {
            this._state = this.states.none;
          } else if (chr === '\\') {
            this._escaped = true;
            break;
          } else {
            this._node.value += chr;
          }
          this._escaped = false;
        }
        break;
      case this.states.key:
        if (!chr.match(this.symbols.key)) {
          if (!this._node.value?.match(this.symbols.keyNames)) {
            throw new ParserError(`Error parsing PO data: Invalid key name "${this._node.value}" at line ${this._lineNumber}. This can be caused by an unescaped quote character in a msgid or msgstr value.`, this._lineNumber);
          }
          this._state = this.states.none;
          i--;
        } else {
          this._node.value += chr;
        }
        break;
    }
  }
};

/**
 * Join multi line strings
 *
 * @param tokens Parsed tokens
 * @return Parsed tokens, with multi line strings joined into one
 */
Parser.prototype._joinStringValues = function (tokens: Node[]): Node[] {
  const response: Node[] = [];
  let lastNode;

  for (let i = 0, len = tokens.length; i < len; i++) {
    if (lastNode && tokens[i].type === this.types.string && lastNode.type === this.types.string) {
      lastNode.value += tokens[i].value ?? '';
    } else if (lastNode && tokens[i].type === this.types.comments && lastNode.type === this.types.comments) {
      lastNode.value += '\n' + tokens[i].value;
    } else {
      response.push(tokens[i]);
      lastNode = tokens[i];
    }
  }

  return response;
};

/**
 * Parse comments into separate comment blocks
 *
 * @param tokens Parsed tokens
 */
Parser.prototype._parseComments = function (tokens: Node[]) {
  for (const node of tokens) {
    if (!node || node.type !== this.types.comments) {
      continue;
    }

    const comment: {
        [key: string]: string[];
    } = {
      translator: [],
      extracted: [],
      reference: [],
      flag: [],
      previous: []
    };

    const lines: string[] = (node.value || '').split(/\n/);

    for (const line of lines) {
      switch (line.charAt(0) || '') {
        case ':':
          comment.reference.push(line.substring(1).trim());
          break;
        case '.':
          comment.extracted.push(line.substring(1).replace(/^\s+/, ''));
          break;
        case ',':
          comment.flag.push(line.substring(1).replace(/^\s+/, ''));
          break;
        case '|':
          comment.previous.push(line.substring(1).replace(/^\s+/, ''));
          break;
        case '~':
          break;
        default:
          comment.translator.push(line.replace(/^\s+/, ''));
      }
    }

    const finalToken = node as unknown as Omit<Node, 'value'> & { value: Record<string, string>};

    finalToken.value = {};

    for (const key of Object.keys(comment)) {
      if (key && comment[key]?.length) {
        finalToken.value[key] = comment[key].join('\n');
      }
    }
  }
};

/**
 * Join gettext keys with values
 *
 * @param tokens - Parsed tokens containing key-value pairs
 * @return An array of Nodes representing joined tokens
 */
Parser.prototype._handleKeys = function (tokens: (Node & { value?: string })[]): Node[] {
  const response: Node[] = [];
  let lastNode: Partial<Node> & { comments?: string; } = {};

  for (let i = 0, len = tokens.length; i < len; i++) {
    if (tokens[i].type === this.types.key) {
      lastNode = {
        key: tokens[i].value
      };
      if (tokens[i].obsolete) {
        lastNode.obsolete = true;
      }
      if (i && tokens[i - 1].type === this.types.comments) {
        lastNode.comments = tokens[i - 1].value;
      }
      lastNode.value = '';
      response.push((lastNode as Node));
    } else if (tokens[i].type === this.types.string && lastNode) {
      lastNode.value += tokens[i].value;
    }
  }

  return response;
};

/**
 * Separate different values into individual translation objects
 *
 * @param {Node[]} tokens Parsed tokens
 * @return {GetTextTranslation[]} Tokens
 */
Parser.prototype._handleValues = function (tokens: Node[]): GetTextTranslation[] {
  const response = [];
  /** Translation object */
  let lastNode: Partial<GetTextTranslation> = {};
  let curContext: string | undefined;
  let curComments: GetTextComment | undefined;

  for (let i = 0, len = tokens.length; i < len; i++) {
    const tokenKey = tokens[i].key;
    if (!tokenKey) continue;
    if (tokenKey.toLowerCase() === 'msgctxt') {
      curContext = tokens[i].value;
      curComments = tokens[i].comments;
    } else if (tokenKey.toLowerCase() === 'msgid') {
      lastNode = {
        msgid: tokens[i].value,
        msgstr: []
      };
      if (tokens[i].obsolete) {
        lastNode.obsolete = true;
      }

      if (curContext) {
        lastNode.msgctxt = curContext;
      }

      if (curComments) {
        lastNode.comments = curComments;
      }

      if (tokens[i].comments && !lastNode.comments) {
        lastNode.comments = tokens[i].comments;
      }

      curContext = undefined;
      curComments = undefined;
      response.push(lastNode);
    } else if (tokenKey.toLowerCase() === 'msgid_plural') {
      if (lastNode) {
        if (this._validation && 'msgid_plural' in lastNode) {
          throw new SyntaxError(`Multiple msgid_plural error: entry "${lastNode.msgid}" in "${lastNode.msgctxt || ''}" context has multiple msgid_plural declarations.`);
        }

        lastNode.msgid_plural = tokens[i].value;
      }

      if (tokens[i].comments && !lastNode.comments) {
        lastNode.comments = tokens[i].comments;
      }

      curContext = undefined;
      curComments = undefined;
    } else if (tokenKey.substring(0, 6).toLowerCase() === 'msgstr') {
      if (lastNode) {
        const strData = lastNode.msgstr || [];
        const tokenValue = tokens[i].value;
        lastNode.msgstr = (strData).concat(tokenValue);
      }

      if (tokens[i].comments && !lastNode.comments) {
        lastNode.comments = tokens[i].comments;
      }

      curContext = undefined;
      curComments = undefined;
    }
  }

  return response as GetTextTranslation[];
};

/**
 * Validate token
 *
 * @param token Parsed token
 * @param translations Translation table
 * @param msgctxt Message entry context
 * @param nplurals Number of expected plural forms
 * @throws {Error} Will throw an error if token validation fails
 */
Parser.prototype._validateToken = function (
  {
    msgid = '',
    msgid_plural = '', // eslint-disable-line camelcase
    msgstr = []
  }: GetTextTranslation,
  translations: Translations,
  msgctxt: string,
  nplurals: number
) {
  if (msgid in translations[msgctxt]) {
    throw new SyntaxError(`Duplicate msgid error: entry "${msgid}" in "${msgctxt}" context has already been declared.`);
    // eslint-disable-next-line camelcase
  } else if (msgid_plural && msgstr.length !== nplurals) {
    // eslint-disable-next-line camelcase
    throw new RangeError(`Plural forms range error: Expected to find ${nplurals} forms but got ${msgstr.length} for entry "${msgid_plural}" in "${msgctxt}" context.`);
    // eslint-disable-next-line camelcase
  } else if (!msgid_plural && msgstr.length !== 1) {
    throw new RangeError(`Translation string range error: Extected 1 msgstr definitions associated with "${msgid}" in "${msgctxt}" context, found ${msgstr.length}.`);
  }
};

/**
 * Compose a translation table from tokens object
 *
 * @param {GetTextTranslation[]} tokens Parsed tokens
 * @return {GetTextTranslations} Translation table
 */
Parser.prototype._normalize = function (tokens: GetTextTranslation[]): GetTextTranslations {
  /**
   * Translation table to be returned
   */
  const table: Omit<GetTextTranslations, 'headers'> & Partial<Pick<GetTextTranslations, 'headers'>> = {
    charset: this._charset,
    headers: undefined,
    translations: {}
  };
  let nplurals = 1;

  for (let i = 0, len = tokens.length; i < len; i++) {
    const msgctxt: string = tokens[i].msgctxt || '';

    if (tokens[i].obsolete) {
      if (!table.obsolete) {
        table.obsolete = {};
      }

      if (!table.obsolete[msgctxt]) {
        table.obsolete[msgctxt] = {};
      }

      delete tokens[i].obsolete;

      table.obsolete[msgctxt][tokens[i].msgid] = tokens[i];

      continue;
    }

    if (!table.translations[msgctxt]) {
      table.translations[msgctxt] = {};
    }

    if (!table.headers && !msgctxt && !tokens[i].msgid) {
      table.headers = parseHeader(tokens[i].msgstr[0]);
      nplurals = parseNPluralFromHeadersSafely(table.headers, nplurals);
    }

    if (this._validation) {
      this._validateToken(tokens[i], table.translations, msgctxt, nplurals);
    }

    const token = tokens[i];
    table.translations[msgctxt][token.msgid] = token;
  }

  return table as GetTextTranslations;
};

/**
 * Converts parsed tokens to a translation table
 *
 * @param tokens Parsed tokens
 * @returns Translation table
 */
Parser.prototype._finalize = function (tokens: Node[]): GetTextTranslations {
  /**
   * Translation table
   */
  let data = this._joinStringValues(tokens);

  this._parseComments(data);

  // The PO parser gettext keys with values
  data = this._handleKeys(data);

  // The PO parser individual translation objects
  const dataset = this._handleValues(data);
  return this._normalize(dataset);
};



/**
 * Creates a transform stream for parsing PO input
 * @constructor
 *
 * @param options Optional options with defaultCharset and validation
 * @param transformOptions Optional stream options
 */
function PoParserTransform (this: PoParserTransform & Transform, options: ParserOptions, transformOptions: TransformOptions & { initialTreshold?: number; }) {
  const { initialTreshold, ..._transformOptions } = transformOptions;
  this.options = options;
  this._parser = false;
  this._tokens = {};

  this._cache = [];
  this._cacheSize = 0;

  this.initialTreshold = transformOptions.initialTreshold || 2 * 1024;

  Transform.call(this, _transformOptions);

  this._writableState.objectMode = false;
  this._readableState.objectMode = true;
}
util.inherits(PoParserTransform, Transform);

/**
   * Processes a chunk of the input stream
   * @param chunk Chunk of the input stream
   * @param encoding Encoding of the chunk
   * @param done Callback to call when the chunk is processed
   */
PoParserTransform.prototype._transform = function (chunk: Buffer, encoding: string, done: DoneCallback) {
  let i;
  let len = 0;

  if (!chunk || !chunk.length) {
    return done();
  }

  if (!this._parser) {
    this._cache.push(chunk);
    this._cacheSize += chunk.length;

    // wait until the first 1kb before parsing headers for charset
    if (this._cacheSize < this.initialTreshold) {
      return setImmediate(done);
    } else if (this._cacheSize) {
      chunk = Buffer.concat(this._cache, this._cacheSize);
      this._cacheSize = 0;
      this._cache = [];
    }

    this._parser = new Parser(chunk, this.options);
  } else if (this._cacheSize) {
    // this only happens if we had an uncompleted 8bit sequence from the last iteration
    this._cache.push(chunk);
    this._cacheSize += chunk.length;
    chunk = Buffer.concat(this._cache, this._cacheSize);
    this._cacheSize = 0;
    this._cache = [];
  }

  // cache 8bit bytes from the end of the chunk
  // helps if the chunk ends in the middle of an utf-8 sequence
  for (i = chunk.length - 1; i >= 0; i--) {
    if (chunk[i] >= 0x80) {
      len++;
      continue;
    }
    break;
  }
  // it seems we found some 8bit bytes from the end of the string, so let's cache these
  if (len) {
    this._cache = [chunk.subarray(chunk.length - len)];
    this._cacheSize = this._cache[0].length;
    chunk = chunk.subarray(0, chunk.length - len);
  }

  // chunk might be empty if it only continued of 8bit bytes and these were all cached
  if (chunk.length) {
    try {
      this._parser._lexer(this._parser._toString(chunk));
    } catch (/** @type {any} error */error) {
      setImmediate(() => {
        done(error);
      });

      return;
    }
  }

  setImmediate(done);
};

/**
   * Once all inputs have been processed, emit the parsed translation table as an object
   *
   * @param done Callback to call when the chunk is processed
   */
PoParserTransform.prototype._flush = function (done: DoneCallback) {
  let chunk;

  if (this._cacheSize) {
    chunk = Buffer.concat(this._cache, this._cacheSize);
  }

  if (!this._parser && chunk) {
    this._parser = new Parser(chunk, this.options);
  }

  if (chunk && this._parser) {
    try {
      this._parser._lexer(this._parser._toString(chunk));
    } catch (error) {
      setImmediate(() => {
        done(error);
      });

      return;
    }
  }

  if (this._parser) {
    (this).push(this._parser._finalize(this._parser._lex));
  }

  setImmediate(done);
};
