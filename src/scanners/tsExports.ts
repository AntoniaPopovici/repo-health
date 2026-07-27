import { ExportedSymbol } from '../types';

const FUNCTION_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/;
const CLASS_RE = /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const CONST_RE = /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
const BRACE_RE = /^\s*export\s*\{([^}]*)\}/;

// Regex-based instead of the TS compiler API. Matches common top-level
// export forms; doesn't handle `export * from` or computed re-exports.
export function scanTsJsFile(text: string, file: string): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const lines = text.split(/\r?\n/);

  for (let line = 0; line < lines.length; line++) {
    const text_ = lines[line];

    let match = FUNCTION_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'function', file));
      continue;
    }

    match = CLASS_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'class', file));
      continue;
    }

    match = CONST_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'const', file));
      continue;
    }

    match = BRACE_RE.exec(text_);
    if (match) {
      const names = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const asMatch = /^(?:\w+)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
          return asMatch ? asMatch[1] : part;
        })
        .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));

      for (const name of names) {
        symbols.push(makeSymbol(name, text_, line, 'const', file));
      }
    }
  }

  return symbols;
}

function makeSymbol(
  name: string,
  lineText: string,
  line: number,
  kind: ExportedSymbol['kind'],
  file: string
): ExportedSymbol {
  const column = Math.max(lineText.indexOf(name), 0);
  return { name, line, column, kind, file };
}
