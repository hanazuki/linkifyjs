import { tokenize } from '@nfrasser/simple-html-tokenizer';
import * as linkify from './linkify';

const { Options } = linkify.options;
const StartTag = 'StartTag';
const EndTag = 'EndTag';
const Chars = 'Chars';
const Comment = 'Comment';

/**
 * @param {string} str html string to link
 * @param {object} [opts] linkify options
 * @returns {string} resulting string
 */
export default function linkifyHtml(str, opts = {}) {
	// `tokens` and `token` in this section refer to tokens generated by the
	// HTML parser, not linkify's parser
	const tokens = tokenize(str);
	const linkifiedTokens = [];
	const linkified = [];

	opts = new Options(opts);

	// Linkify the tokens given by the parser
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		if (token.type === StartTag) {
			linkifiedTokens.push(token);

			// Ignore all the contents of ignored tags
			let tagName = token.tagName.toUpperCase();
			let isIgnored = tagName === 'A' || opts.ignoreTags.indexOf(tagName) >= 0;
			if (!isIgnored) { continue; }

			let preskipLen = linkifiedTokens.length;
			skipTagTokens(tagName, tokens, ++i, linkifiedTokens);
			i += linkifiedTokens.length - preskipLen - 1;
			continue;

		} else if (token.type !== Chars) {
			// Skip this token, it's not important
			linkifiedTokens.push(token);
			continue;
		}

		// Valid text token, linkify it!
		const linkifedChars = linkifyChars(token.chars, opts);
		linkifiedTokens.push.apply(linkifiedTokens, linkifedChars);
	}

	// Convert the tokens back into a string
	for (let i = 0; i < linkifiedTokens.length; i++) {
		const token = linkifiedTokens[i];
		switch (token.type) {
		case StartTag: {
			let link = '<' + token.tagName;
			if (token.attributes.length > 0) {
				let attrs = attrsToStrings(token.attributes);
				link += ' ' + attrs.join(' ');
			}
			link += '>';
			linkified.push(link);
			break;
		}
		case EndTag:
			linkified.push(`</${token.tagName}>`);
			break;
		case Chars:
			linkified.push(escapeText(token.chars));
			break;
		case Comment:
			linkified.push(`<!--${escapeText(token.chars)}-->`);
			break;
		}
	}

	return linkified.join('');
}

/**
	`tokens` and `token` in this section referes to tokens returned by
	`linkify.tokenize`. `linkified` will contain HTML Parser-style tokens
*/
function linkifyChars(str, opts) {
	const tokens = linkify.tokenize(str);
	const result = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		if (token.t === 'nl' && opts.nl2br) {
			result.push({
				type: StartTag,
				tagName: 'br',
				attributes: [],
				selfClosing: true
			});
			continue;
		} else if (!token.isLink || !opts.check(token)) {
			result.push({type: Chars, chars: token.toString()});
			continue;
		}

		let {
			formatted,
			formattedHref,
			tagName,
			className,
			target,
			rel,
			attributes,
			truncate
		} = opts.resolve(token);

		// Build up attributes
		const attributeArray = [['href', formattedHref]];

		if (className) { attributeArray.push(['class', className]); }
		if (target) { attributeArray.push(['target', target]); }
		if (rel) { attributeArray.push(['rel', rel]); }
		if (truncate && formatted.length > truncate) { formatted = formatted.substring(0, truncate) + '…'; }

		for (const attr in attributes) {
			attributeArray.push([attr, attributes[attr]]);
		}

		// Add the required tokens
		result.push({
			type: StartTag,
			tagName: tagName,
			attributes: attributeArray,
			selfClosing: false
		});
		result.push({ type: Chars, chars: formatted });
		result.push({ type: EndTag, tagName: tagName });
	}

	return result;
}

/**
	Returns a list of tokens skipped until the closing tag of tagName.

	* `tagName` is the closing tag which will prompt us to stop skipping
	* `tokens` is the array of tokens generated by HTML5Tokenizer which
	* `i` is the index immediately after the opening tag to skip
	* `skippedTokens` is an array which skipped tokens are being pushed into

	Caveats

	* Assumes that i is the first token after the given opening tagName
	* The closing tag will be skipped, but nothing after it
	* Will track whether there is a nested tag of the same type
*/
function skipTagTokens(tagName, tokens, i, skippedTokens) {

	// number of tokens of this type on the [fictional] stack
	let stackCount = 1;

	while (i < tokens.length && stackCount > 0) {
		let token = tokens[i];

		if (token.type === StartTag && token.tagName.toUpperCase() === tagName) {
			// Nested tag of the same type, "add to stack"
			stackCount++;
		} else if (token.type === EndTag && token.tagName.toUpperCase() === tagName) {
			// Closing tag
			stackCount--;
		}

		skippedTokens.push(token);
		i++;
	}

	// Note that if stackCount > 0 here, the HTML is probably invalid
	return skippedTokens;
}

function escapeText(text) {
	// Not required, HTML tokenizer ensures this occurs properly
	return text;
}

function escapeAttr(attr) {
	return attr.replace(/"/g, '&quot;');
}

function attrsToStrings(attrs) {
	const attrStrs = [];
	for (let i = 0; i < attrs.length; i++) {
		const name = attrs[i][0];
		const value = attrs[i][1];
		attrStrs.push(`${name}="${escapeAttr(value)}"`);
	}
	return attrStrs;
}
