import { ExportedSymbol } from '../types';

const DEF_RE = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*[:(]/;

/**
 * Treats top-level (non-indented) `def`/`class` names as the "public API"
 * of a Python module, following the common convention that a leading
 * underscore marks something private. Not a substitute for parsing
 * __all__, but good enough for drift detection.
 */
export function scanPyFile(text: string): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const lines = text.split(/\r?\n/);

  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];

    // Only top-level definitions: no leading whitespace.
    if (/^\s/.test(raw)) {
      continue;
    }

    let match = DEF_RE.exec(raw);
    if (match && !match[1].startsWith('_')) {
      symbols.push(makeSymbol(match[1], raw, line, 'function'));
      continue;
    }

    match = CLASS_RE.exec(raw);
    if (match && !match[1].startsWith('_')) {
      symbols.push(makeSymbol(match[1], raw, line, 'class'));
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
