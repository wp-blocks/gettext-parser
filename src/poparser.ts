import { Transform, type TransformOptions } from "node:stream";
import {
	formatCharset,
	ParserError,
	parseHeader,
	parseNPluralFromHeadersSafely,
} from "./shared.js";
import type {
	GetTextComment,
	GetTextTranslation,
	GetTextTranslations,
	ParserOptions,
	Translations,
} from "./types.js";

/** Po parser options*/
type Options = { defaultCharset?: string; validation?: boolean };

/** A single Node object in the PO file */
export interface Node {
	key?: string;
	type?: number;
	value: string;
	quote?: string;
	obsolete?: boolean;
	comments?: GetTextComment | undefined;
}

type DoneCallback = (...args: unknown[]) => void;

/**
 * Parses a PO object into translation table
 *
 * @param input PO object
 * @param [options] Optional options with defaultCharset and validation
 */
export function poParse(input: string | Buffer, options: Options = {}) {
	const parser = new Parser(input, options);

	return parser.parse();
}

/**
 * Parses a PO stream, emits translation table in object mode
 *
 * @param [options] Optional options with defaultCharset and validation
 * @param [transformOptions] Optional stream options
 */
export function poStream(
	options: Options = {},
	transformOptions: TransformOptions = {},
) {
	return new PoParserTransform(options, transformOptions);
}

/**
 * Creates a PO parser object.
 * If a PO object is a string, UTF-8 will be used as the charset
 *
 * @param fileContents PO object
 * @param options Options with defaultCharset and validation
 */
class Parser {
	_validation: boolean;
	_charset: string;
	_lex: Node[];
	_escaped: boolean;
	_node: Partial<Node>;
	_state: number;
	_lineNumber: number;
	_fileContents: string | Buffer;

	states = {
		none: 0x01,
		header: 0x02,
		msgctxt: 0x03,
		msgid: 0x04,
		msgid_plural: 0x05,
		msgstr: 0x06,
		msgstr_plural: 0x07,
		obsolete: 0x08,
		comment: 0x09,
		eol: 0x0a,
	};

	constructor(
		fileContents: string | Buffer,
		{ defaultCharset = "iso-8859-1", validation = false }: Options,
	) {
		this._validation = validation;
		this._charset = defaultCharset;

		this._lex = [];
		this._escaped = false;
		this._node = {};
		this._state = this.types.none;
		this._lineNumber = 1;

		if (typeof fileContents === "string") {
			this._charset = "utf-8";
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
	parse(): GetTextTranslations {
		this._lexer(this._fileContents.toString());

		return this._finalize(this._lex);
	}

	/**
	 * Detects charset for PO strings from the header
	 *
	 * @param buf Header value
	 */
	_handleCharset(buf: string | Buffer = "") {
		const str = buf.toString();
		let pos;
		let headers = "";
		let match;

		if ((pos = str.search(/^\s*msgid/im)) >= 0) {
			pos = pos + str.substring(pos + 5).search(/^\s*(msgid|msgctxt)/im);
			headers = str.substring(0, pos >= 0 ? pos + 5 : str.length);
		}

		if (
			(match = headers.match(/[; ]charset\s*=\s*([\w-]+)(?:[\s;]|\\n)*"\s*$/im))
		) {
			this._charset = formatCharset(match[1], this._charset);
		}

		if (this._charset === "utf-8") {
			return str;
		}

		return this._toString(buf);
	}

	/**
	 * Converts buffer to string
	 * @param buf Buffer to convert
	 * @return Converted string
	 */
	_toString(buf: string | Buffer): string {
		const decoder = new TextDecoder(this._charset);
		return decoder.decode(typeof buf === "string" ? Buffer.from(buf) : buf);
	}

	/**
	 * Value types for lexer
	 */
	types = {
		none: 0x01,
		comments: 0x02,
		key: 0x03,
		string: 0x04,
		obsolete: 0x08,
	};

	/**
	 * String matches for lexer
	 */
	symbols = {
		whitespace: /\s/,
		key: /[\w\-[\]]/,
		keyNames: /^(?:msgctxt|msgid(?:_plural)?|msgstr(?:\[\d+])?)$/,
	};
	/**
	 * Token parser. Parsed state can be found from this._lex
	 *
	 * @param chunk String
	 * @throws {ParserError} Throws a SyntaxError if the value doesn't match the key names.
	 */
	_lexer(chunk: string) {
		let chr;

		for (let i = 0, len = chunk.length; i < len; i++) {
			chr = chunk.charAt(i);

			if (chr === "\n") {
				this._lineNumber += 1;
			}

			switch (this._state) {
				case this.states.none:
				case this.states.obsolete:
					if (chr === '"' || chr === "'") {
						this._node = {
							type: this.types.string,
							value: "",
							quote: chr,
						};
						this._lex.push(this._node as Node);
						this._state = this.types.string;
					} else if (chr === "#") {
						this._node = {
							type: this.types.comments,
							value: "",
						};
						this._lex.push(this._node as Node);
						this._state = this.types.comments;
					} else if (!chr.match(this.symbols.whitespace)) {
						this._node = {
							type: this.types.key,
							value: chr,
						};
						if (this._state === this.states.obsolete) {
							this._node.obsolete = true;
						}
						this._lex.push(this._node as Node);
						this._state = this.types.key;
					}
					break;
				case this.types.comments:
					if (chr === "\n") {
						this._state = this.types.none;
					} else if (chr === "~" && this._node.value === "") {
						this._node.value += chr;
						this._state = this.types.obsolete;
					} else if (chr !== "\r") {
						this._node.value += chr;
					}
					break;
				case this.types.string:
					if (this._escaped) {
						switch (chr) {
							case "t":
								this._node.value += "\t";
								break;
							case "n":
								this._node.value += "\n";
								break;
							case "r":
								this._node.value += "\r";
								break;
							default:
								this._node.value += chr;
						}
						this._escaped = false;
					} else {
						if (chr === this._node.quote) {
							this._state = this.types.none;
						} else if (chr === "\\") {
							this._escaped = true;
							break;
						} else {
							this._node.value += chr;
						}
						this._escaped = false;
					}
					break;
				case this.types.key:
					if (!chr.match(this.symbols.key)) {
						if (!this._node.value?.match(this.symbols.keyNames)) {
							throw new ParserError(
								`Error parsing PO data: Invalid key name "${this._node.value}" at line ${this._lineNumber}. This can be caused by an unescaped quote character in a msgid or msgstr value.`,
								this._lineNumber,
							);
						}
						this._state = this.types.none;
						i--;
					} else {
						this._node.value += chr;
					}
					break;
			}
		}
	}

	/**
	 * Join multi line strings
	 *
	 * @param tokens Parsed tokens
	 * @return Parsed tokens, with multi line strings joined into one
	 */
	_joinStringValues(tokens: Node[]): Node[] {
		const response: Node[] = [];
		let lastNode;

		for (let i = 0, len = tokens.length; i < len; i++) {
			if (
				lastNode &&
				tokens[i].type === this.types.string &&
				lastNode.type === this.types.string
			) {
				lastNode.value += tokens[i].value ?? "";
			} else if (
				lastNode &&
				tokens[i].type === this.types.comments &&
				lastNode.type === this.types.comments
			) {
				lastNode.value += "\n" + tokens[i].value;
			} else {
				response.push(tokens[i]);
				lastNode = tokens[i];
			}
		}

		return response;
	}

	/**
	 * Parse comments into separate comment blocks
	 *
	 * @param tokens Parsed tokens
	 */
	_parseComments(tokens: Node[]) {
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
				previous: [],
			};

			const lines: string[] = (node.value || "").split(/\n/);

			for (const line of lines) {
				switch (line.charAt(0) || "") {
					case ":":
						comment.reference.push(line.substring(1).trim());
						break;
					case ".":
						comment.extracted.push(line.substring(1).replace(/^\s+/, ""));
						break;
					case ",":
						comment.flag.push(line.substring(1).replace(/^\s+/, ""));
						break;
					case "|":
						comment.previous.push(line.substring(1).replace(/^\s+/, ""));
						break;
					case "~":
						break;
					default:
						comment.translator.push(line.replace(/^\s+/, ""));
				}
			}

			const finalToken = node as unknown as Omit<Node, "value"> & {
				value: Record<string, string>;
			};

			finalToken.value = {};

			for (const key of Object.keys(comment)) {
				if (key && comment[key]?.length) {
					finalToken.value[key] = comment[key].join("\n");
				}
			}
		}
	}

	/**
	 * Join gettext keys with values
	 *
	 * @param tokens - Parsed tokens containing key-value pairs
	 * @return An array of Nodes representing joined tokens
	 */
	_handleKeys(tokens: (Node & { value?: string })[]): Node[] {
		const response: Node[] = [];
		let lastNode: Partial<Node> & { comments?: string } = {};

		for (let i = 0, len = tokens.length; i < len; i++) {
			if (tokens[i].type === this.types.key) {
				lastNode = {
					key: tokens[i].value,
				};
				if (tokens[i].obsolete) {
					lastNode.obsolete = true;
				}
				if (i && tokens[i - 1].type === this.types.comments) {
					lastNode.comments = tokens[i - 1].value;
				}
				lastNode.value = "";
				response.push(lastNode as Node);
			} else if (tokens[i].type === this.types.string && lastNode) {
				lastNode.value += tokens[i].value;
			}
		}

		return response;
	}

	/**
	 * Separate different values into individual translation objects
	 *
	 * @param {Node[]} tokens Parsed tokens
	 * @return {GetTextTranslation[]} Tokens
	 */
	_handleValues(tokens: Node[]): GetTextTranslation[] {
		const response = [];
		/** Translation object */
		let lastNode: Partial<GetTextTranslation> = {};
		let curContext: string | undefined;
		let curComments: GetTextComment | undefined;

		for (let i = 0, len = tokens.length; i < len; i++) {
			const tokenKey = tokens[i].key;
			if (!tokenKey) continue;
			if (tokenKey.toLowerCase() === "msgctxt") {
				curContext = tokens[i].value;
				curComments = tokens[i].comments;
			} else if (tokenKey.toLowerCase() === "msgid") {
				lastNode = {
					msgid: tokens[i].value,
					msgstr: [],
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
			} else if (tokenKey.toLowerCase() === "msgid_plural") {
				if (lastNode) {
					if (this._validation && "msgid_plural" in lastNode) {
						throw new SyntaxError(
							`Multiple msgid_plural error: entry "${lastNode.msgid}" in "${lastNode.msgctxt || ""}" context has multiple msgid_plural declarations.`,
						);
					}

					lastNode.msgid_plural = tokens[i].value;
				}

				if (tokens[i].comments && !lastNode.comments) {
					lastNode.comments = tokens[i].comments;
				}

				curContext = undefined;
				curComments = undefined;
			} else if (tokenKey.substring(0, 6).toLowerCase() === "msgstr") {
				if (lastNode) {
					const strData = lastNode.msgstr || [];
					const tokenValue = tokens[i].value;
					lastNode.msgstr = strData.concat(tokenValue);
				}

				if (tokens[i].comments && !lastNode.comments) {
					lastNode.comments = tokens[i].comments;
				}

				curContext = undefined;
				curComments = undefined;
			}
		}

		return response as GetTextTranslation[];
	}

	/**
	 * Validate token
	 *
	 * @param token Parsed token
	 * @param translations Translation table
	 * @param msgctxt Message entry context
	 * @param nplurals Number of expected plural forms
	 * @throws {Error} Will throw an error if token validation fails
	 */
	_validateToken(
		{
			msgid = "",
			msgid_plural = "", // eslint-disable-line camelcase
			msgstr = [],
		}: GetTextTranslation,
		translations: Translations,
		msgctxt: string,
		nplurals: number,
	) {
		if (msgid in translations[msgctxt]) {
			throw new SyntaxError(
				`Duplicate msgid error: entry "${msgid}" in "${msgctxt}" context has already been declared.`,
			);
			// eslint-disable-next-line camelcase
		} else if (msgid_plural && msgstr.length !== nplurals) {
			// eslint-disable-next-line camelcase
			throw new RangeError(
				`Plural forms range error: Expected to find ${nplurals} forms but got ${msgstr.length} for entry "${msgid_plural}" in "${msgctxt}" context.`,
			);
			// eslint-disable-next-line camelcase
		} else if (!msgid_plural && msgstr.length !== 1) {
			throw new RangeError(
				`Translation string range error: Extected 1 msgstr definitions associated with "${msgid}" in "${msgctxt}" context, found ${msgstr.length}.`,
			);
		}
	}

	/**
	 * Compose a translation table from tokens object
	 *
	 * @param {GetTextTranslation[]} tokens Parsed tokens
	 * @return {GetTextTranslations} Translation table
	 */
	_normalize(tokens: GetTextTranslation[]): GetTextTranslations {
		/**
		 * Translation table to be returned
		 */
		const table: Omit<GetTextTranslations, "headers"> &
			Partial<Pick<GetTextTranslations, "headers">> = {
			charset: this._charset,
			headers: undefined,
			translations: {},
		};
		let nplurals = 1;

		for (let i = 0, len = tokens.length; i < len; i++) {
			const msgctxt: string = tokens[i].msgctxt || "";

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
	}

	/**
	 * Converts parsed tokens to a translation table
	 *
	 * @param tokens Parsed tokens
	 * @returns Translation table
	 */
	_finalize(tokens: Node[]): GetTextTranslations {
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
	}
}

/**
 * Creates a transform stream for parsing PO input
 * @constructor
 *
 * @param options Optional options with defaultCharset and validation
 * @param transformOptions Optional stream options
 */
class PoParserTransform extends Transform {
	options: ParserOptions;
	_parser: boolean | Parser;
	_tokens: {};
	_cache: Buffer[];
	_cacheSize: number;
	initialTreshold: number;

	constructor(
		options: ParserOptions,
		transformOptions: TransformOptions & { initialTreshold?: number },
	) {
		const { initialTreshold, ..._transformOptions } = transformOptions;
		super({
			..._transformOptions,
			readableObjectMode: true,
			writableObjectMode: false,
		});

		this.options = options;
		this._parser = false;
		this._tokens = {};

		this._cache = [];
		this._cacheSize = 0;

		this.initialTreshold = transformOptions.initialTreshold || 2 * 1024;
	}

	/**
	 * Processes a chunk of the input stream
	 * @param chunk Chunk of the input stream
	 * @param encoding Encoding of the chunk
	 * @param done Callback to call when the chunk is processed
	 */
	_transform(
		chunk: Buffer,
		encoding: BufferEncoding,
		callback: (error?: Error | null, data?: any) => void,
	) {
		if (!chunk || !chunk.length) {
			return callback();
		}

		if (!this._parser) {
			this._cache.push(chunk);
			this._cacheSize += chunk.length;

			// wait until the first 1kb before parsing headers for charset
			if (this._cacheSize < this.initialTreshold) {
				return setImmediate(callback);
			} else if (this._cacheSize) {
				chunk = Buffer.concat(this._cache as Uint8Array[], this._cacheSize);
				this._cacheSize = 0;
				this._cache = [];
			}

			this._parser = new Parser(chunk, this.options);
		} else if (this._cacheSize) {
			// this only happens if we had an uncompleted 8bit sequence from last iteration
			this._cache.push(chunk);
			this._cacheSize += chunk.length;
			chunk = Buffer.concat(this._cache as Uint8Array[], this._cacheSize);
			this._cacheSize = 0;
			this._cache = [];
		}

		// cache 8bit bytes from end of the chunk
		// helps if chunk ends in the middle of an utf-8 sequence
		let len = 0;
		for (let i = chunk.length - 1; i >= 0; i--) {
			if (chunk[i] >= 0x80) {
				len++;
				continue;
			}
			break;
		}
		// it seems we found some 8bit bytes from end of the string, so let's cache these
		if (len) {
			this._cache = [chunk.subarray(chunk.length - len)];
			this._cacheSize = this._cache[0].length;
			chunk = chunk.subarray(0, chunk.length - len);
		}

		// chunk might be empty if it only continued of 8bit bytes and these were all cached
		if (chunk.length) {
			try {
				(this._parser as Parser)._lexer(
					(this._parser as Parser)._toString(chunk),
				);
			} catch (error) {
				setImmediate(() => {
					callback(error as Error | null);
				});

				return;
			}
		}

		setImmediate(callback);
	}

	/**
	 * Once all inputs have been processed, emit the parsed translation table as an object
	 *
	 * @param done Callback to call when the chunk is processed
	 */
	_flush(callback: (error?: Error | null, data?: any) => void) {
		let chunk;

		if (this._cacheSize) {
			chunk = Buffer.concat(this._cache as Uint8Array[], this._cacheSize);
		}

		if (!this._parser && chunk) {
			this._parser = new Parser(chunk, this.options);
		}

		if (chunk && this._parser) {
			try {
				(this._parser as Parser)._lexer(
					(this._parser as Parser)._toString(chunk),
				);
			} catch (error) {
				setImmediate(() => {
					callback(error as Error | null);
				});

				return;
			}
		}

		if (this._parser) {
			this.push(
				(this._parser as Parser)._finalize((this._parser as Parser)._lex),
			);
		}

		setImmediate(callback);
	}
}
