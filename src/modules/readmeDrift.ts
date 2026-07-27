import * as vscode from 'vscode';
import { scanTsJsFile } from '../scanners/tsExports';
import { scanPyFile } from '../scanners/pyExports';
import { ExportedSymbol, ReadmeDriftResult, StaleReadmeMention, UndocumentedSymbol } from '../types';

const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Words that show up as "foo(" inside example code blocks but aren't real
// exports — kept out of the "stale function" candidate set.
const CODE_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'require',
  'console', 'json', 'object', 'array', 'map', 'set', 'promise', 'super', 'this', 'await',
  'async', 'import', 'export', 'class', 'print', 'len', 'range', 'str', 'int', 'list', 'dict'
]);

// Compares exported symbols against what README.md mentions.
// "Undocumented": an exported symbol whose name never appears anywhere in
// the README as a whole word (broad match, so it doesn't matter how the
// README phrases things, just whether the name shows up).
// "Stale": narrower — only names that look like a function call or an npm
// script inside a README code span/fenced block, with no matching export
// or package.json script left. Narrower on purpose, so ordinary prose
// doesn't get flagged as a stale reference.
export async function scanReadmeDrift(
  workspaceRoot: vscode.Uri,
  include: string,
  exclude: string,
  readmePath: string
): Promise<ReadmeDriftResult> {
  const readmeUris = await vscode.workspace.findFiles(`**/${readmePath}`, exclude, 1);
  if (readmeUris.length === 0) {
    return { undocumented: [], stale: [] };
  }

  const readmeBytes = await vscode.workspace.fs.readFile(readmeUris[0]);
  const readmeText = Buffer.from(readmeBytes).toString('utf8');

  const symbols = await collectExportedSymbols(include, exclude);
  const documentedWords = buildWordSet(readmeText);

  const undocumented: UndocumentedSymbol[] = symbols
    .filter((symbol) => !documentedWords.has(symbol.name))
    .map(({ name, kind, file, line }) => ({ name, kind, file, line }));

  const exportedNames = new Set(symbols.map((symbol) => symbol.name));
  const scriptNames = await getPackageScriptNames(workspaceRoot);
  const codeSpans = extractCodeSpans(readmeText);

  const stale: StaleReadmeMention[] = [];
  for (const name of extractFunctionCallCandidates(codeSpans)) {
    if (!exportedNames.has(name)) {
      stale.push({ name, reason: 'function removed' });
    }
  }
  for (const name of extractScriptCandidates(codeSpans)) {
    if (!scriptNames.has(name)) {
      stale.push({ name, reason: 'script removed' });
    }
  }

  return { undocumented, stale };
}

async function collectExportedSymbols(include: string, exclude: string): Promise<ExportedSymbol[]> {
  const sourceUris = await vscode.workspace.findFiles(include, exclude);
  const symbols: ExportedSymbol[] = [];

  for (const uri of sourceUris) {
    const ext = uri.path.slice(uri.path.lastIndexOf('.'));
    if (!TS_JS_EXTENSIONS.has(ext) && ext !== '.py') {
      continue;
    }

    const relPath = vscode.workspace.asRelativePath(uri, false);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    symbols.push(...(ext === '.py' ? scanPyFile(text, relPath) : scanTsJsFile(text, relPath)));
  }

  return symbols;
}

function buildWordSet(text: string): Set<string> {
  const words = new Set<string>();
  const wordRe = /[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(text)) !== null) {
    words.add(match[0]);
  }
  return words;
}

function extractCodeSpans(readme: string): string[] {
  const spans: string[] = [];

  const fenceRe = /```[\w-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(readme)) !== null) {
    spans.push(match[1]);
  }

  const inlineRe = /`([^`\n]+)`/g;
  while ((match = inlineRe.exec(readme)) !== null) {
    spans.push(match[1]);
  }

  return spans;
}

function extractFunctionCallCandidates(spans: string[]): Set<string> {
  const names = new Set<string>();
  for (const span of spans) {
    const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(span)) !== null) {
      const name = match[1];
      if (!CODE_KEYWORDS.has(name.toLowerCase()) && name.length >= 3) {
        names.add(name);
      }
    }
  }
  return names;
}

function extractScriptCandidates(spans: string[]): Set<string> {
  const names = new Set<string>();
  for (const span of spans) {
    const re = /\b(?:npm run|yarn run|pnpm run)\s+([\w:-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(span)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}

async function getPackageScriptNames(workspaceRoot: vscode.Uri): Promise<Set<string>> {
  try {
    const pkgUri = vscode.Uri.joinPath(workspaceRoot, 'package.json');
    const bytes = await vscode.workspace.fs.readFile(pkgUri);
    const pkg = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}
