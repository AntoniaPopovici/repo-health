import { execFile } from 'child_process';
import { GitCommit } from './types';

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

// Shells out to git directly instead of adding simple-git as a dependency.
// Rejects when cwd isn't inside a git repo.
function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 * 64 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await run(cwd, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export async function getRecentCommits(cwd: string, count: number): Promise<GitCommit[]> {
  const format = ['%H', '%h', '%an', '%aI', '%s', '%b'].join(FIELD_SEP) + RECORD_SEP;
  const out = await run(cwd, ['log', `-n`, String(Math.max(1, count)), `--pretty=format:${format}`]);

  return out
    .split(RECORD_SEP)
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const parts = record.split(FIELD_SEP);
      const [hash, shortHash, author, date, subject] = parts;
      const body = (parts[5] ?? '').trim();
      return { hash, shortHash, author, date, subject, body };
    });
}

export interface BlameInfo {
  author?: string;
  date?: string; // ISO 8601
}

// Returns undefined for untracked files or uncommitted lines.
export async function getBlameForLine(
  cwd: string,
  relFile: string,
  oneBasedLine: number
): Promise<BlameInfo | undefined> {
  try {
    const out = await run(cwd, [
      'blame',
      '-L',
      `${oneBasedLine},${oneBasedLine}`,
      '--line-porcelain',
      '--',
      relFile
    ]);

    let author: string | undefined;
    let authorTime: string | undefined;
    for (const line of out.split('\n')) {
      if (line.startsWith('author ')) {
        author = line.slice('author '.length).trim();
      } else if (line.startsWith('author-time ')) {
        authorTime = line.slice('author-time '.length).trim();
      }
    }

    if (!authorTime) {
      return undefined;
    }
    return { author, date: new Date(Number(authorTime) * 1000).toISOString() };
  } catch {
    return undefined;
  }
}

// Raw `git log -p` output for the last `maxCommits` commits.
export async function getRecentLogPatches(cwd: string, maxCommits: number): Promise<string> {
  return run(cwd, ['log', '-p', '--unified=0', '-n', String(Math.max(1, maxCommits))]);
}
