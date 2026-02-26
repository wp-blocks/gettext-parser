import {
	compareMsgid,
	extractCharset,
	formatCharset,
	generateHeader,
	HEADERS,
	updateContentTypeCharset,
} from "./shared.js";
import type {
	GetTextTranslation,
	GetTextTranslations,
	Size,
	TranslationBuffers,
	Translations,
} from "./types.js";

/**
 * Exposes general compiler function. Takes a translation
 * object as a parameter and returns binary MO object
 *
 * @param table Translation object
 * @return Compiled binary MO object
 */
export default function (table: GetTextTranslations): Buffer {
	const compiler = new Compiler(table);

	return compiler.compile();
}

/**
 * Prepare the header object to be compatible with MO compiler
 * @param {Record<string, string>} headers the headers
 * @return {Record<string, string>} The prepared header
 */
function prepareMoHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	return Object.keys(headers).reduce(
		(result: Record<string, string>, key: string) => {
			const lowerKey = key.toLowerCase();

			if (HEADERS.has(lowerKey)) {
				// POT-Creation-Date is removed in MO (see https://savannah.gnu.org/bugs/?49654)
				if (lowerKey !== "pot-creation-date") {
					const value = HEADERS.get(lowerKey);
					if (value) {
						result[value] = headers[key];
					}
				}
			} else {
				result[key] = headers[key];
			}

			return result;
		},
		{} as Record<string, string>,
	);
}

/**
 * Prepare the translation object to be compatible with MO compiler
 * @param {Translations} translations
 * @return {Translations}
 */
function prepareTranslations(translations: Translations): Translations {
	return Object.keys(translations).reduce((result, msgctxt) => {
		const context = translations[msgctxt];
		const msgs = Object.keys(context).reduce(
			(result: Record<string, GetTextTranslation>, msgid) => {
				const TranslationMsgstr = context[msgid].msgstr;
				const hasTranslation = TranslationMsgstr.some((item) => !!item.length);

				if (hasTranslation) {
					result[msgid] = context[msgid];
				}

				return result;
			},
			{},
		);

		if (Object.keys(msgs).length) {
			result[msgctxt] = msgs;
		}

		return result;
	}, {} as Translations);
}

/**
 * Creates a MO compiler object
 */
class Compiler {
	_table: GetTextTranslations;
	_translations: TranslationBuffers[];
	_writeFunc: string;
	MAGIC: number;

	/**
	 * @param table Translation table as defined in the README
	 */
	constructor(table: GetTextTranslations) {
		/** The translation table */
		this._table = {
			charset: undefined,
			translations: prepareTranslations(table?.translations ?? {}),
			headers: prepareMoHeaders(table?.headers ?? {}),
		} as GetTextTranslations;

		this._translations = [];

		this._writeFunc = "writeUInt32LE";

		this._handleCharset();

		this.MAGIC = 0x950412de;
	}

	/**
	 * Handles header values, replaces or adds (if needed) a charset property
	 */
	_handleCharset() {
		const headerValue = this._table.headers["Content-Type"] || "text/plain";
		const existingCharset = extractCharset(headerValue);
		const charset = formatCharset(
			this._table.charset || existingCharset || "utf-8",
		);

		this._table.charset = charset;

		if (existingCharset) {
			this._table.headers["Content-Type"] = updateContentTypeCharset(
				headerValue,
				formatCharset(existingCharset),
			);
		} else {
			this._table.headers["Content-Type"] = headerValue.split(";")[0].trim();
		}
	}

	/**
	 * Generates an array of translation strings
	 * in the form of [{msgid:..., msgstr: ...}]
	 *
	 */
	_generateList(): TranslationBuffers[] {
		const list: TranslationBuffers[] = [];
		const nodeCharset = (
			this._table.charset === "iso-8859-1" ? "latin1" : "utf8"
		) as BufferEncoding;

		if ("headers" in this._table) {
			list.push({
				msgid: Buffer.alloc(0),
				msgstr: Buffer.from(generateHeader(this._table.headers), nodeCharset),
			} as any);
		}

		Object.keys(this._table.translations).forEach((msgctxt) => {
			if (typeof this._table.translations[msgctxt] !== "object") {
				return;
			}

			Object.keys(this._table.translations[msgctxt]).forEach((msgid) => {
				if (typeof this._table.translations[msgctxt][msgid] !== "object") {
					return;
				}

				if (msgctxt === "" && msgid === "") {
					return;
				}

				const msgidPlural =
					this._table.translations[msgctxt][msgid].msgid_plural;
				let key = msgid;

				if (msgctxt) {
					key = `${msgctxt}\u0004${key}`;
				}

				if (msgidPlural) {
					key += `\u0000${msgidPlural}`;
				}

				const value = ([] as string[])
					.concat(this._table.translations[msgctxt][msgid].msgstr ?? [])
					.join("\u0000");

				list.push({
					msgid: Buffer.from(key, nodeCharset),
					msgstr: Buffer.from(value, nodeCharset),
				} as any);
			});
		});

		return list;
	}

	/**
	 * Calculate buffer size for the final binary object
	 *
	 * @param list An array of translation strings from _generateList
	 * @return Size data of {msgid, msgstr, total}
	 */
	_calculateSize(list: TranslationBuffers[]): Size {
		let msgidLength = 0;
		let msgstrLength = 0;

		list.forEach((translation) => {
			msgidLength += translation.msgid.length + 1; // + extra 0x00
			msgstrLength += translation.msgstr.length + 1; // + extra 0x00
		});

		const totalLength =
			4 + // magic number
			4 + // revision
			4 + // string count
			4 + // original string table offset
			4 + // translation string table offset
			4 + // hash table size
			4 + // hash table offset
			(4 + 4) * list.length + // original string table
			(4 + 4) * list.length + // translations string table
			msgidLength + // originals
			msgstrLength; // translations

		return {
			msgid: msgidLength,
			msgstr: msgstrLength,
			total: totalLength,
		};
	}

	/**
	 * Generates the binary MO object from the translation list
	 *
	 * @param list translation list
	 * @param size Byte size information
	 * @return Compiled MO object
	 */
	_build(list: TranslationBuffers[], size: Size): Buffer {
		const returnBuffer = Buffer.alloc(size.total);
		const writeFunc = this._writeFunc as "writeUInt32LE" | "writeUInt32BE";
		let curPosition = 0;
		let i;
		let len;

		// magic
		returnBuffer[writeFunc](this.MAGIC, 0);

		// revision
		returnBuffer[writeFunc](0, 4);

		// string count
		returnBuffer[writeFunc](list.length, 8);

		// original string table offset
		returnBuffer[writeFunc](28, 12);

		// translation string table offset
		returnBuffer[writeFunc](28 + (4 + 4) * list.length, 16);

		// hash table size
		returnBuffer[writeFunc](0, 20);

		// hash table offset
		returnBuffer[writeFunc](28 + (4 + 4) * list.length * 2, 24);

		// Build original table
		curPosition = 28 + 2 * (4 + 4) * list.length;
		for (i = 0, len = list.length; i < len; i++) {
			const msgidLength = list[i].msgid as unknown as Buffer;
			msgidLength.copy(returnBuffer, curPosition);
			returnBuffer.writeUInt32LE(list[i].msgid.length, 28 + i * 8);
			returnBuffer.writeUInt32LE(curPosition, 28 + i * 8 + 4);
			returnBuffer[curPosition + list[i].msgid.length] = 0x00;
			curPosition += list[i].msgid.length + 1;
		}

		// build translation table
		for (i = 0, len = list.length; i < len; i++) {
			const msgstrLength = list[i].msgstr as unknown as Buffer;
			msgstrLength.copy(returnBuffer, curPosition);
			returnBuffer.writeUInt32LE(
				list[i].msgstr.length,
				28 + (4 + 4) * list.length + i * 8,
			);
			returnBuffer.writeUInt32LE(
				curPosition,
				28 + (4 + 4) * list.length + i * 8 + 4,
			);
			returnBuffer[curPosition + list[i].msgstr.length] = 0x00;
			curPosition += list[i].msgstr.length + 1;
		}

		return returnBuffer;
	}

	/**
	 * Compiles a translation object into a binary MO object
	 *
	 * @interface
	 * @return {Buffer} Compiled MO object
	 */
	compile(): Buffer {
		const list = this._generateList();
		const size = this._calculateSize(list);

		list.sort(compareMsgid);

		return this._build(list, size);
	}
}
