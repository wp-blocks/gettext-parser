import {Transform} from "readable-stream";

/**
 * Represents a GetText comment.
 */
export interface GetTextComment {
    translator?: string;
    reference?: string;
    extracted?: string;
    flag?: string;
    previous?: string;
}

/**
 * Represents a GetText translation.
 */
export interface GetTextTranslation {
    msgctxt?: string;
    msgid: string;
    msgid_plural?: string;
    msgstr: string[];
    comments?: GetTextComment;
    obsolete?: boolean;
}

/**
 * The translation index.
 */
export type Translations = Record<string, Record<string, GetTextTranslation>>

/**
 * Represents GetText translations.
 */
export interface GetTextTranslations {
    charset: string | undefined;
    headers: Record<string, string>;
    obsolete?: Translations;
    translations: Translations;
}

/**
 * Options for the parser.
 */
export type ParserOptions = {
    defaultCharset?: string;
    validation?: boolean;
    foldLength?: number;
    escapeCharacters?: boolean;
    sort?: boolean;
    eol?: string;
}

/**
 * Type definition for write functions.
 */
export type WriteFunc = 'writeUInt32LE' | 'writeUInt32BE';

/**
 * Type definition for read functions.
 */
export type ReadFunc = 'readUInt32LE' | 'readUInt32BE';


/** The size of the MO object */
export type Size = {
    msgid: number,
    msgstr: number,
    total: number
}

/** The translation object as a buffer */
export type TranslationBuffers = {
    msgid: Buffer,
    msgstr: Buffer
}

export type Compiler = {
    _options: ParserOptions;
    _table: GetTextTranslations,
    _translations: TranslationBuffers[],
    _writeFunc: WriteFunc,
    _handleCharset: () => void,
    _generateList: () => TranslationBuffers[],
    _build: (list: TranslationBuffers[], size: Size) => Buffer,
    compile: () => Buffer,
    /**
     * Magic bytes for the generated binary data
     * MAGIC file header magic value of mo file
     */
    MAGIC: number,
}

export type Parser = {
    _validation: boolean;
    _charset: string;
    _lex: any[];
    _escaped: boolean;
    _node: any;
    _state: any;
    _lineNumber: number;
    _fileContents: string | Buffer;
}

export type PoParserTransform = {
    options: ParserOptions,
    initialTreshold?: number,
    _parser?: Parser|false,
    _tokens?: {},
    _cache?: Buffer[],
    _cacheSize?: number
};
