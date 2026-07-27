import { getRecentCommits } from '../git';
import { CommitLintResult } from '../types';

// Scores messages on length, a denylist of generic messages, a couple of
// "this looks concrete" signals, and a small bonus for imperative phrasing.
// Tune the lists below as needed.

const GENERIC_MESSAGES = new Set([
  'fix',
  'fixed',
  'fixes',
  'fix bug',
  'fix bugs',
  'bug fix',
  'bugfix',
  'wip',
  'update',
  'updates',
  'updated',
  'stuff',
  'misc',
  'miscellaneous',
  'changes',
  'change',
  'minor fix',
  'small fix',
  'small fixes',
  'cleanup',
  'clean up',
  'tweak',
  'tweaks',
  'various fixes',
  'more fixes',
  'oops',
  'typo',
  'test',
  'testing',
  'asdf',
  'temp',
  'temporary',
  'checkpoint',
  'save',
  'stuff and things'
]);

// Catches messages like "update stuff" or "minor changes" that aren't
// literal matches in GENERIC_MESSAGES but are just as content-free.
const GENERIC_WORDS = new Set([
  'fix', 'fixed', 'fixes', 'bug', 'bugs', 'bugfix', 'wip', 'update', 'updates', 'updated',
  'stuff', 'misc', 'miscellaneous', 'changes', 'change', 'minor', 'small', 'cleanup', 'clean',
  'up', 'tweak', 'tweaks', 'various', 'more', 'oops', 'typo', 'test', 'testing', 'asdf', 'temp',
  'temporary', 'checkpoint', 'save', 'things', 'thing', 'and', 'a', 'the', 'stuffs'
]);

const IMPERATIVE_VERBS =
  /^(add|fix|update|remove|delete|refactor|rename|implement|handle|improve|support|revert|bump|extract|introduce|prevent|correct|clean|merge|move|split|simplify|optimize|document|deprecate|migrate|wire|hook|guard|validate|adjust|tighten|expand|drop|replace|restore|enable|disable)\b/i;

const CONCRETE_FILE_TOKEN = /\b[\w-]+\.(ts|tsx|js|jsx|py|json|md|css|scss|html|yml|yaml|go|rs|java|rb)\b/;
const CAMEL_OR_SNAKE_TOKEN = /\b(?:[a-z]+[A-Z]\w*|[a-z0-9]+_[a-z0-9_]+)\b/;
const EXPLANATION_AFTER_SEPARATOR = /^[^:\-–—]{2,40}[:\-–—]\s+\S.{2,}/;

export interface CommitLintScore {
  score: number; // 0-100, higher is better
  isVague: boolean;
  hint?: string;
}

// Scores a single commit message (subject, optionally followed by a body
// on subsequent lines).
export function lintMessage(raw: string): CommitLintScore {
  const full = raw.trim();
  if (!full) {
    return { score: 100, isVague: false };
  }

  const [firstLine, ...bodyLines] = full.split('\n');
  const subject = firstLine.trim();
  const body = bodyLines.join(' ').trim();
  const normalizedWhole = full.toLowerCase().replace(/[.!\s]+$/, '').trim();
  const searchable = `${subject} ${body}`;

  const subjectWords = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (
    GENERIC_MESSAGES.has(normalizedWhole) ||
    (subjectWords.length > 0 && subjectWords.every((word) => GENERIC_WORDS.has(word)) && body.length < 10)
  ) {
    return { score: 5, isVague: true, hint: pickHint('generic') };
  }

  let score = 50;

  if (subject.length >= 24) {
    score += 15;
  } else if (subject.length < 10) {
    score -= 25;
  }

  const hasConcreteToken = CONCRETE_FILE_TOKEN.test(searchable) || CAMEL_OR_SNAKE_TOKEN.test(searchable);
  const hasExplanation = EXPLANATION_AFTER_SEPARATOR.test(subject) || body.length >= 10;
  if (hasConcreteToken || hasExplanation) {
    score += 20;
  }

  if (IMPERATIVE_VERBS.test(subject)) {
    score += 5;
  }

  if (subject.length < 4) {
    score -= 20;
  }

  score = Math.max(0, Math.min(100, score));
  const isVague = score < 50;

  if (!isVague) {
    return { score, isVague };
  }

  const hint = !hasConcreteToken && !hasExplanation ? pickHint('noContext') : pickHint('short');
  return { score, isVague, hint };
}

function pickHint(kind: 'generic' | 'short' | 'noContext'): string {
  switch (kind) {
    case 'generic':
      return 'vague — what broke, and what fixed it?';
    case 'short':
      return 'a bit thin — a few more words would help future-you';
    case 'noContext':
      return 'mention a file, function, or the specific change';
  }
}

export async function scanRecentCommits(cwd: string, count: number): Promise<CommitLintResult[]> {
  const commits = await getRecentCommits(cwd, count);
  return commits.map((commit) => {
    const message = commit.body ? `${commit.subject}\n${commit.body}` : commit.subject;
    const { score, isVague, hint } = lintMessage(message);
    return { commit, score, isVague, hint };
  });
}
