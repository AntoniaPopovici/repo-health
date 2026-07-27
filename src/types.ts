export interface ExportedSymbol {
  name: string;
  line: number; // 0-based
  column: number; // 0-based
  kind: 'function' | 'class' | 'const';
  file: string; // workspace-relative path
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string; // ISO 8601
  subject: string;
  body: string;
}

export interface CommitLintResult {
  commit: GitCommit;
  score: number; // 0-100, higher is better
  isVague: boolean;
  hint?: string;
}

export interface UndocumentedItem {
  name: string;
  kind: 'command' | 'setting';
}

export interface StaleReadmeMention {
  name: string;
  reason: 'script removed' | 'function removed' | 'command/setting removed';
}

export interface ReadmeDriftResult {
  undocumented: UndocumentedItem[];
  stale: StaleReadmeMention[];
}

export interface StaleTodo {
  text: string;
  kind: 'TODO' | 'FIXME';
  file: string;
  line: number; // 0-based
  author?: string;
  date?: string; // ISO date, may be missing for uncommitted lines
  ageDays: number;
}

export interface SecretFinding {
  commitHash: string;
  shortHash: string;
  file: string;
  patternName: string;
  redactedSnippet: string;
}

export interface OnboardingItem {
  key: string;
  label: string;
  present: boolean;
}

export interface FileTypeCount {
  extension: string;
  count: number;
}

export interface ScoreHistoryPoint {
  timestamp: string; // ISO 8601
  overall: number;
}

export interface HealthScan {
  repoName: string;
  commits: CommitLintResult[];
  readmeDrift: ReadmeDriftResult;
  staleTodos: StaleTodo[];
  secrets: SecretFinding[];
  onboarding: OnboardingItem[];
  fileTypes: FileTypeCount[];
  scoreHistory: ScoreHistoryPoint[];
  score: HealthScore;
}

export interface HealthScore {
  overall: number; // 0-100
  commitQualityPct: number; // 0-100
  docsDriftCount: number;
  trend?: {
    delta: number; // overall - previous overall
    previous: number;
  };
}
