// A conservative JavaScript "comment and indentation" stripper for the deploy bundle (scripts/package-legacy.mjs) — no dependencies
// (Vercel runs the package script without installing anything).
//
// It is a small lexer that knows strings ('…', "…"), template literals (`…${…}…`, nested), regular-expression literals (told apart from
// division by the previous significant token) and comments. It removes the comments, the indentation of each line and blank lines —
// nothing else: line breaks stay (automatic semicolon insertion keeps working), template literals and strings are copied byte for byte.
// A block comment that spanned lines becomes a line break; one inside a line, a space.
//
// strip(code) → the stripped code. The caller compiles the result (vm.Script) and falls back to the original file if it does not
// compile — a misread `/` can only break the syntax, which that check catches.

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

export function strip(src) {
	const out = [];
	let i = 0, line = '', prev = '', inTpl = false;      // prev: the last significant token ('' = start; a word; or the punctuator character)
	// inTpl: the current line BEGINS inside a template literal (its start is text of the literal: not trimmed, not dropped)
	const n = src.length;
	const isIdStart = (c) => /[A-Za-z_$À-￿]/.test(c), isId = (c) => /[A-Za-z0-9_$À-￿]/.test(c);
	const flush = () => {
		const t = line.replace(/[ \t]+$/, '');
		if (inTpl) out.push(t); else if (t.trim()) out.push(t.replace(/^[ \t]+/, ''));
		line = ''; inTpl = false;
	};
	const regexAllowed = () => {
		if (prev === '') return true;
		if (/^[A-Za-z_$À-￿]/.test(prev)) return REGEX_AFTER_WORD.has(prev);
		if (/^[0-9.]/.test(prev) && prev !== '.') return false;
		return !(prev === ')' || prev === ']' || prev === '}' || prev === '`' || prev === "'" || prev === '"' || prev === 'regex' || prev === '++' || prev === '--');
	};
	// a template literal from the backtick at i; returns the index after its closing backtick (copies it verbatim into `line`)
	const template = (start) => {
		let j = start + 1;
		while (j < n) {
			const c = src[j];
			if (c === '\\') { j += 2; continue; }
			if (c === '`') { j++; break; }
			if (c === '$' && src[j + 1] === '{') {
				// the expression inside ${…}: balance braces, skipping its own strings/templates/comments
				j += 2; let depth = 1;
				while (j < n && depth > 0) {
					const d = src[j];
					if (d === '`') { j = template(j); continue; }
					if (d === '"' || d === "'") { j = quoted(j); continue; }
					if (d === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
					if (d === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
					if (d === '{') depth++; else if (d === '}') depth--;
					j++;
				}
				continue;
			}
			j++;
		}
		return j;
	};
	const quoted = (start) => {
		const q = src[start]; let j = start + 1;
		while (j < n) { const c = src[j]; if (c === '\\') { j += 2; continue; } j++; if (c === q || c === '\n') break; }
		return j;
	};
	while (i < n) {
		const c = src[i], d = src[i + 1];
		if (c === '\n') { flush(); i++; continue; }
		if (c === '\r') { i++; continue; }
		if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
		if (c === '/' && d === '*') {
			const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2, body = src.slice(i, end);
			if (body.includes('\n')) { flush(); } else line += ' ';
			i = end; continue;
		}
		if (c === '`') {
			const j = template(i), lit = src.slice(i, j), parts = lit.split('\n');
			line += parts[0];
			for (let k = 1; k < parts.length; k++) { out.push(inTpl ? line : line.replace(/^[ \t]+/, '')); line = parts[k]; inTpl = true; }      // (inside the literal: lines kept exactly)
			i = j; prev = '`'; continue;
		}
		if (c === '"' || c === "'") { const j = quoted(i); line += src.slice(i, j); i = j; prev = c; continue; }
		if (c === '/' && regexAllowed()) {
			let j = i + 1, cls = false;
			while (j < n) {
				const e = src[j];
				if (e === '\\') { j += 2; continue; }
				if (e === '\n') break;
				if (cls) { if (e === ']') cls = false; }
				else if (e === '[') cls = true;
				else if (e === '/') { j++; break; }
				j++;
			}
			while (j < n && isId(src[j])) j++;                                      // flags
			line += src.slice(i, j); i = j; prev = 'regex'; continue;
		}
		if (isIdStart(c)) {
			let j = i + 1; while (j < n && isId(src[j])) j++;
			const w = src.slice(i, j); line += w; i = j; prev = w; continue;
		}
		if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(d))) {
			let j = i + 1; while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j++;
			line += src.slice(i, j); i = j; prev = '0'; continue;
		}
		if ((c === '+' && d === '+') || (c === '-' && d === '-')) { line += c + d; i += 2; prev = c + d; continue; }
		if (c === ' ' || c === '\t') { line += c; i++; continue; }
		line += c; i++; prev = c;
	}
	flush();
	return out.join('\n') + '\n';
}
