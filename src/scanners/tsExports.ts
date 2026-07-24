import { ExportedSymbol } from '../types';

const FUNCTION_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/;
const CLASS_RE = /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const CONST_RE = /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
const BRACE_RE = /^\s*export\s*\{([^}]*)\}/;

/**
 * Regex-based scan (no TS compiler API) so the extension has zero runtime
 * dependencies. Only matches common top-level export forms; deeply dynamic
 * or re-exported-via-wildcard patterns are intentionally out of scope.
 */
export function scanTsJsFile(text: string): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const lines = text.split(/\r?\n/);

  for (let line = 0; line < lines.length; line++) {
    const text_ = lines[line];

    let match = FUNCTION_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'function'));
      continue;
    }

    match = CLASS_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'class'));
      continue;
    }

    match = CONST_RE.exec(text_);
    if (match) {
      symbols.push(makeSymbol(match[1], text_, line, 'const'));
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
        symbols.push(makeSymbol(name, text_, line, 'const'));
      }
    }
  }

  return symbols;
}

function makeSymbol(
  name: string,
  lineText: string,
  line: number,
  kind: ExportedSymbol['kind']
): ExportedSymbol {
  const column = Math.max(lineText.indexOf(name), 0);
  return { name, line, column, kind };
}
