// see https://www.gnu.org/software/gettext/manual/html_node/Header-Entry.html
/** Header name for "Plural-Forms" */
const PLURAL_FORMS: string = 'Plural-Forms';

/** Map of header keys to header names */
export const HEADERS: Map<string, string> = new Map([
  ['project-id-version', 'Project-Id-Version'],
  ['report-msgid-bugs-to', 'Report-Msgid-Bugs-To'],
  ['pot-creation-date', 'POT-Creation-Date'],
  ['po-revision-date', 'PO-Revision-Date'],
  ['last-translator', 'Last-Translator'],
  ['language-team', 'Language-Team'],
  ['language', 'Language'],
  ['content-type', 'Content-Type'],
  ['content-transfer-encoding', 'Content-Transfer-Encoding'],
  ['plural-forms', PLURAL_FORMS]
]);

const PLURAL_FORM_HEADER_NPLURALS_REGEX: RegExp = /nplurals\s*=\s*(?<nplurals>\d+)/;

/**
 * Parses a header string into an object of key-value pairs
 *
 * @param str Header string
 * @return An object of key-value pairs
 */
export function parseHeader (str: string = ''): Record<string, string> {
  /** @type {string} Header string  */
  return str
    .split('\n')
    .reduce((headers: Record<string, string>, line: string) => {
      const parts = line.split(':');
      let key = (parts.shift() || '').trim();

      if (key) {
        const value = parts.join(':').trim();

        key = HEADERS.get(key.toLowerCase()) || key;

        headers[key] = value;
      }

      return headers;
    }, {});
}

/**
 * Attempts to safely parse 'nplurals" value from "Plural-Forms" header
 *
 * @param headers An object with parsed headers
 * @param fallback Fallback value if "Plural-Forms" header is absent
 * @returns Parsed result
 */
export function parseNPluralFromHeadersSafely (headers: Record<string, string>, fallback: number = 1): number {
  const pluralForms = headers ? headers[PLURAL_FORMS] : false;

  if (!pluralForms) {
    return fallback;
  }

  const {
    groups: { nplurals } = { nplurals: '' + fallback }
  } = pluralForms.match(PLURAL_FORM_HEADER_NPLURALS_REGEX) || {};

  return parseInt(nplurals, 10) || fallback;
}

/**
 * Joins a header object of key value pairs into a header string
 *
 * @param header Object of key value pairs
 * @return An object of key-value pairs
 */
export function generateHeader (header: Record<string, string> = {}): string {
  const keys = Object.keys(header)
    .filter(key => !!key);

  if (!keys.length) {
    return '';
  }

  return keys.map(key =>
    `${key}: ${(header[key] || '').trim()}`
  )
    .join('\n') + '\n';
}

/**
 * Normalizes charset name. Converts utf8 to utf-8, WIN1257 to windows-1257 etc.
 *
 * @param charset Charset name
 * @param defaultCharset Default charset name, defaults to 'iso-8859-1'
 * @return Normalized charset name
 */
export function formatCharset (charset: string = 'iso-8859-1', defaultCharset: string = 'iso-8859-1'): string {
  return charset.toString()
    .toLowerCase()
    .replace(/^utf[-_]?(\d+)$/, 'utf-$1')
    .replace(/^win(?:dows)?[-_]?(\d+)$/, 'windows-$1')
    .replace(/^latin[-_]?(\d+)$/, 'iso-8859-$1')
    .replace(/^(us[-_]?)?ascii$/, 'ascii')
    .replace(/^charset$/, defaultCharset)
    .trim();
}

/**
 * Folds long lines according to PO format
 *
 * @param str PO formatted string to be folded
 * @param maxLen Maximum allowed length for folded lines
 * @return An array of lines
 */
export function foldLine (str: string, maxLen: number = 76): string[] {
  const lines = [];
  const len = str.length;
  let curLine = '';
  let pos = 0;
  let match;

  while (pos < len) {
    curLine = str.substring(pos, pos + maxLen);

    // ensure that the line never ends with a partial escaping
    // make longer lines if needed
    while (curLine.endsWith('\\') && pos + curLine.length < len) {
      curLine += str.charAt(pos + curLine.length + 1); // Append the next character
    }

    // ensure that if possible, line breaks are done at reasonable places
    if ((match = /.*?\\n/.exec(curLine))) {
      // use everything before and including the first line break
      curLine = match[0];
    } else if (pos + curLine.length < len) {
      // if we're not at the end
      if ((match = /.*\s+/.exec(curLine)) && /\S/.test(match[0])) {
        // use everything before and including the last white space character (if anything)
        curLine = match[0];
      } else if ((match = /.*[\x21-\x2f0-9\x5b-\x60\x7b-\x7e]+/.exec(curLine)) && /[^\x21-\x2f0-9\x5b-\x60\x7b-\x7e]/.test(match[0])) {
        // use everything before and including the last "special" character (if anything)
        curLine = match[0];
      }
    }

    lines.push(curLine);
    pos += curLine.length;
  }

  return lines;
}

/**
 * Comparator function for comparing msgid
 *
 * @param left with msgid prev
 * @param right with msgid next
 * @returns comparator index
 */
export function compareMsgid <T>({msgid: left}: { msgid: T; }, {msgid: right}: { msgid: T; }): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/**
 * Custom SyntaxError subclass that includes the lineNumber property.
 */
export class ParserError extends SyntaxError {
  lineNumber: number;
  /**
   * @param message - Error message.
   * @param lineNumber - Line number where the error occurred.
   */
  constructor (message: string, lineNumber: number) {
    super(message);
    this.lineNumber = lineNumber;
  }
}
