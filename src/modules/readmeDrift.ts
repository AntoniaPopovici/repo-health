import * as vscode from 'vscode';
import { scanTsJsFile } from '../scanners/tsExports';
import { scanPyFile } from '../scanners/pyExports';
import { ExportedSymbol, ReadmeDriftResult, StaleReadmeMention, UndocumentedItem } from '../types';

const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Words that show up as "foo(" inside example code blocks but aren't real
// exports — kept out of the "stale function" candidate set.
const CODE_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'require',
  'console', 'json', 'object', 'array', 'map', 'set', 'promise', 'super', 'this', 'await',
  'async', 'import', 'export', 'class', 'print', 'len', 'range', 'str', 'int', 'list', 'dict'
]);

interface PackageManifest {
  scripts?: Record<string, string>;
  contributes?: {
    commands?: Array<{ command: string; title?: string }>;
    configuration?: { properties?: Record<string, unknown> };
  };
}

/**
 * README drift for a VS Code extension isn't really about whether every
 * exported TS function got a mention — no README convention expects a
 * full function inventory, and flagging that way is mostly noise. What a
 * README's Features/Configuration/Getting Started sections *are* expected
 * to cover is the project's actual declared user-facing surface: its
 * commands and settings (`contributes.commands` /
 * `contributes.configuration` in package.json). So:
 *
 * - "Undocumented": a declared command or setting whose id (or command
 *   title) never appears anywhere in the README.
 * - "Stale": a script/function/command/setting mentioned in a README code
 *   span/fenced block that no longer corresponds to anything real.
 *
 * On a project with no `contributes` block (i.e. not a VS Code
 * extension), the command/setting checks simply produce nothing — this
 * still works as a plain script/function drift check for other projects.
 */
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

  const pkg = await readPackageManifest(workspaceRoot);
  const scriptNames = new Set(Object.keys(pkg?.scripts ?? {}));
  const commands = pkg?.contributes?.commands ?? [];
  const commandIds = new Set(commands.map((c) => c.command));
  const settingKeys = new Set(Object.keys(pkg?.contributes?.configuration?.properties ?? {}));

  const exportedNames = new Set((await collectExportedSymbols(include, exclude)).map((s) => s.name));

  const undocumented: UndocumentedItem[] = [];
  for (const cmd of commands) {
    const mentioned = readmeText.includes(cmd.command) || (!!cmd.title && readmeText.includes(cmd.title));
    if (!mentioned) {
      undocumented.push({ name: cmd.command, kind: 'command' });
    }
  }
  for (const key of settingKeys) {
    if (!readmeText.includes(key)) {
      undocumented.push({ name: key, kind: 'setting' });
    }
  }

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

  const knownPrefixes = new Set([...commandIds, ...settingKeys].map((id) => id.split('.')[0]).filter(Boolean));
  for (const name of extractNamespacedCandidates(codeSpans)) {
    const prefix = name.split('.')[0];
    if (knownPrefixes.has(prefix) && !commandIds.has(name) && !settingKeys.has(name)) {
      stale.push({ name, reason: 'command/setting removed' });
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

// Dotted identifiers like `repoHealth.showDashboard` — the shape a
// command id or setting key takes when someone writes it in backticks.
function extractNamespacedCandidates(spans: string[]): Set<string> {
  const names = new Set<string>();
  for (const span of spans) {
    const re = /\b([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(span)) !== null) {
      names.add(match[1]);
    }
  }
  return names;
}

async function readPackageManifest(workspaceRoot: vscode.Uri): Promise<PackageManifest | undefined> {
  try {
    const pkgUri = vscode.Uri.joinPath(workspaceRoot, 'package.json');
    const bytes = await vscode.workspace.fs.readFile(pkgUri);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return undefined;
  }
}
