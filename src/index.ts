import moCompiler from "./mocompiler.js";
import moParser from "./moparser.js";
import poCompiler from "./pocompiler.js";
import { poParse, poStream } from "./poparser.js";

/**
 * Translation parser and compiler for PO files
 * @see https://www.gnu.org/software/gettext/manual/html_node/PO.html
 */
export const po = {
	parse: poParse,
	createParseStream: poStream,
	compile: poCompiler,
};

/**
 * Translation parser and compiler for MO files
 * @see https://www.gnu.org/software/gettext/manual/html_node/MO.html
 */
export const mo = {
	parse: moParser,
	compile: moCompiler,
};

export default { mo, po };
