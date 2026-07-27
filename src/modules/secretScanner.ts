import * as vscode from 'vscode';
import { getRecentLogPatches } from '../git';
import { SecretFinding } from '../types';

interface PatternDef {
  name: string;
  re: RegExp;
}

// Regex-only scanning over recent commit diffs. Expect false positives
// (test fixtures, placeholders, coincidentally key-shaped hashes) — treat
// a hit as "go check this," not confirmation of a leak.
const PATTERNS: PatternDef[] = [
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'OpenAI-style key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'assigned secret-like value',
    re: /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\b\s*[:=]\s*["'`]([A-Za-z0-9+/_-]{20,})["'`]/i
  }
];

const IGNORED_FILE_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.js|\.map)$/i;

export async function scanForLeakedSecrets(
  workspaceRoot: vscode.Uri,
  commitDepth: number
): Promise<SecretFinding[]> {
  let raw: string;
  try {
    raw = await getRecentLogPatches(workspaceRoot.fsPath, commitDepth);
  } catch {
    return [];
  }

  const findings: SecretFinding[] = [];
  const seen = new Set<string>();

  let currentHash = '';
  let currentShort = '';
  let currentFile = '';

  for (const line of raw.split('\n')) {
    const commitMatch = /^commit ([0-9a-f]{40})/.exec(line);
    if (commitMatch) {
      currentHash = commitMatch[1];
      currentShort = currentHash.slice(0, 7);
      continue;
    }

    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    if (!line.startsWith('+') || line.startsWith('+++') || IGNORED_FILE_RE.test(currentFile)) {
      continue;
    }

    const added = line.slice(1);
    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(added);
      if (!match) {
        continue;
      }
      const secretValue = match[1] ?? match[0];
      const key = `${currentHash}:${currentFile}:${pattern.name}:${secretValue}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      findings.push({
        commitHash: currentHash,
        shortHash: currentShort,
        file: currentFile || '(unknown file)',
        patternName: pattern.name,
        redactedSnippet: redact(secretValue)
      });
    }
  }

  return findings;
}

function redact(value: string): string {
  if (value.length <= 8) {
    return '•'.repeat(value.length);
  }
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
