import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  CommitLintResult,
  FileTypeCount,
  HealthScan,
  HealthScore,
  OnboardingItem,
  ReadmeDriftResult,
  ScoreHistoryPoint,
  SecretFinding,
  StaleTodo
} from '../types';

export class RepoHealthPanel {
  public static currentPanel: RepoHealthPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly templatePath: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.templatePath = path.join(extensionUri.fsPath, 'out', 'webview', 'dashboard.html');
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri): RepoHealthPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (RepoHealthPanel.currentPanel) {
      RepoHealthPanel.currentPanel.panel.reveal(column);
      return RepoHealthPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel('repoHealthDashboard', 'Repo Health', column ?? vscode.ViewColumn.One, {
      enableScripts: false,
      retainContextWhenHidden: true
    });

    RepoHealthPanel.currentPanel = new RepoHealthPanel(panel, extensionUri);
    return RepoHealthPanel.currentPanel;
  }

  public reveal(): void {
    this.panel.reveal();
  }

  public showLoading(repoName: string): void {
    this.panel.webview.html = `<!DOCTYPE html><html><body style="background:#0d1117;color:#8b949e;font-family:-apple-system,sans-serif;padding:24px;">Scanning ${escapeHtml(
      repoName
    )}…</body></html>`;
  }

  public update(scan: HealthScan): void {
    this.panel.webview.html = this.render(scan);
  }

  private render(scan: HealthScan): string {
    let template: string;
    try {
      template = fs.readFileSync(this.templatePath, 'utf8');
    } catch {
      return `<!DOCTYPE html><html><body style="background:#0d1117;color:#f85149;font-family:sans-serif;padding:24px;">Could not load dashboard template. Run <code>npm run compile</code> and reload.</body></html>`;
    }

    const replacements: Record<string, string> = {
      REPO_NAME: escapeHtml(scan.repoName),
      RING_GRADIENT: ringGradient(scan.score.overall),
      OVERALL_SCORE: String(scan.score.overall),
      TREND_TEXT: trendText(scan.score),
      COMMIT_QUALITY_PCT: String(scan.score.commitQualityPct),
      DOCS_DRIFT_COUNT: String(scan.score.docsDriftCount),
      COMMITS_BADGE: countBadge(scan.commits.filter((c) => c.isVague).length),
      COMMITS_ROWS: renderCommits(scan.commits),
      DRIFT_BADGE: countBadge(scan.readmeDrift.undocumented.length + scan.readmeDrift.stale.length),
      DRIFT_ROWS: renderDrift(scan.readmeDrift),
      TODOS_BADGE: countBadge(scan.staleTodos.length),
      TODOS_ROWS: renderTodos(scan.staleTodos),
      SECRETS_BADGE: countBadge(scan.secrets.length),
      SECRETS_ROWS: renderSecrets(scan.secrets),
      ONBOARDING_GRID: renderOnboarding(scan.onboarding),
      SCORE_SPARKLINE: renderSparkline(scan.scoreHistory),
      COMMIT_HEAT_STRIP: renderCommitHeatStrip(scan.commits),
      COMMIT_HISTOGRAM: renderCommitHistogram(scan.commits),
      DRIFT_BREAKDOWN: renderDriftBreakdown(scan.readmeDrift),
      FILE_TYPES: renderFileTypes(scan.fileTypes)
    };

    let html = template;
    for (const [key, value] of Object.entries(replacements)) {
      html = html.split(`{{${key}}}`).join(value);
    }
    return html;
  }

  private dispose(): void {
    RepoHealthPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function ringGradient(score: number): string {
  const angle = Math.round((score / 100) * 360);
  const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  return `conic-gradient(${color} ${angle}deg, var(--border) ${angle}deg)`;
}

function trendText(score: HealthScore): string {
  if (!score.trend) {
    return 'First scan this session';
  }
  const { delta } = score.trend;
  if (delta === 0) {
    return 'No change since last scan';
  }
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'var(--green)' : 'var(--red)';
  return `<span style="color:${color}">${sign}${delta}</span> since last scan`;
}

function countBadge(count: number): string {
  if (count === 0) {
    return '<span class="pill pill-green">0</span>';
  }
  const cls = count >= 5 ? 'pill-red' : 'pill-yellow';
  return `<span class="pill ${cls}">${count}</span>`;
}

function renderCommits(commits: CommitLintResult[]): string {
  if (commits.length === 0) {
    return '<div class="empty-row">No commits found.</div>';
  }
  return commits
    .map((result) => {
      const dotClass = !result.isVague ? 'dot-green' : result.score < 20 ? 'dot-red' : 'dot-yellow';
      const hint =
        result.isVague && result.hint ? `<div class="row-hint">${escapeHtml(result.hint)}</div>` : '';
      return `<div class="row">
        <div class="dot ${dotClass}"></div>
        <div class="row-main">
          <div class="row-text">${escapeHtml(result.commit.shortHash)} ${escapeHtml(result.commit.subject)}</div>
          ${hint}
        </div>
      </div>`;
    })
    .join('');
}

function renderDrift(drift: ReadmeDriftResult): string {
  const rows: string[] = [];
  for (const item of drift.undocumented) {
    rows.push(`<div class="row-split">
      <span class="row-symbol">${escapeHtml(item.name)}</span>
      <span class="pill pill-gray">undocumented ${item.kind}</span>
    </div>`);
  }
  for (const item of drift.stale) {
    rows.push(`<div class="row-split">
      <span class="row-symbol">${escapeHtml(item.name)}</span>
      <span class="pill pill-purple">${escapeHtml(item.reason)}</span>
    </div>`);
  }
  if (rows.length === 0) {
    return '<div class="empty-row">No drift detected between the README and the code.</div>';
  }
  return rows.join('');
}

function renderTodos(todos: StaleTodo[]): string {
  if (todos.length === 0) {
    return '<div class="empty-row">No TODO/FIXME comments found.</div>';
  }
  return todos
    .slice(0, 50)
    .map((todo) => {
      const badge =
        todo.ageDays >= 180
          ? '<span class="pill pill-red">' + formatAge(todo.ageDays) + '</span>'
          : todo.ageDays >= 30
          ? '<span class="pill pill-yellow">' + formatAge(todo.ageDays) + '</span>'
          : '<span class="pill pill-gray">' + formatAge(todo.ageDays) + '</span>';
      return `<div class="row-split">
        <span class="row-symbol">${escapeHtml(todo.kind)}: ${escapeHtml(todo.text)} <span style="color:var(--text-faint)">(${escapeHtml(
        todo.file
      )}:${todo.line + 1})</span></span>
        ${badge}
      </div>`;
    })
    .join('');
}

function renderSecrets(secrets: SecretFinding[]): string {
  if (secrets.length === 0) {
    return '<div class="empty-row">No likely secret patterns found in recent history.</div>';
  }
  return secrets
    .map(
      (finding) => `<div class="row">
        <div class="dot dot-red"></div>
        <div class="row-main">
          <div class="row-text">${escapeHtml(finding.shortHash)} ${escapeHtml(finding.file)} — ${escapeHtml(
        finding.redactedSnippet
      )}</div>
          <div class="row-hint danger">looks like a ${escapeHtml(
            finding.patternName
          )} pattern — consider rotating it and scrubbing history</div>
        </div>
      </div>`
    )
    .join('');
}

function renderOnboarding(items: OnboardingItem[]): string {
  return items
    .map((item) => {
      const stateClass = item.present ? 'present' : 'missing';
      const mark = item.present ? '✓' : '○';
      return `<div class="onboarding-item ${stateClass}">
        <span class="mark">${mark}</span>
        <span class="label">${escapeHtml(item.label)}</span>
      </div>`;
    })
    .join('');
}

function renderSparkline(history: ScoreHistoryPoint[]): string {
  if (history.length === 0) {
    return '';
  }

  const width = 120;
  const height = 30;
  const latest = history[history.length - 1].overall;
  const color = latest >= 80 ? 'var(--green)' : latest >= 50 ? 'var(--yellow)' : 'var(--red)';

  const points =
    history.length === 1
      ? [
          [0, height - (history[0].overall / 100) * height],
          [width, height - (history[0].overall / 100) * height]
        ]
      : history.map((point, i) => [
          (i / (history.length - 1)) * width,
          height - (point.overall / 100) * height
        ]);

  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="sparkline">
    <polyline points="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function renderCommitHeatStrip(commits: CommitLintResult[]): string {
  if (commits.length === 0) {
    return '<div class="empty-row">No commits found.</div>';
  }
  const recent = [...commits].reverse().slice(-24);
  const bars = recent
    .map((result) => {
      const color = !result.isVague ? 'var(--green)' : result.score < 20 ? 'var(--red)' : 'var(--yellow)';
      const heightPct = Math.max(8, result.score);
      const title = `${result.commit.shortHash} — ${result.commit.subject} (score ${result.score})`;
      return `<div class="heat-bar" style="height:${heightPct}%;background:${color};" title="${escapeHtml(title)}"></div>`;
    })
    .join('');
  return `<div class="heat-strip">${bars}</div>`;
}

function renderCommitHistogram(commits: CommitLintResult[]): string {
  if (commits.length < 2) {
    return '<div class="empty-row">Not enough commit history yet.</div>';
  }

  const times = commits.map((c) => new Date(c.commit.date).getTime()).sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const span = Math.max(1, max - min);
  const binCount = Math.min(10, times.length);
  const bins = new Array(binCount).fill(0);

  for (const t of times) {
    const idx = Math.min(binCount - 1, Math.floor(((t - min) / span) * binCount));
    bins[idx]++;
  }

  const maxBin = Math.max(...bins, 1);
  const bars = bins
    .map((count) => {
      const heightPct = Math.max(6, Math.round((count / maxBin) * 100));
      return `<div class="hist-bar" style="height:${heightPct}%;" title="${count} commit${count === 1 ? '' : 's'}"></div>`;
    })
    .join('');

  return `<div class="hist-chart">${bars}</div>
    <div class="hist-range">${formatDateShort(min)} → ${formatDateShort(max)}</div>`;
}

function renderDriftBreakdown(drift: ReadmeDriftResult): string {
  const undocumented = drift.undocumented.length;
  const stale = drift.stale.length;
  if (undocumented === 0 && stale === 0) {
    return '<div class="empty-row">No drift detected.</div>';
  }
  const max = Math.max(undocumented, stale, 1);
  return [
    compareRow('Undocumented', undocumented, max, 'gray'),
    compareRow('Stale', stale, max, 'purple')
  ].join('');
}

function renderFileTypes(fileTypes: FileTypeCount[]): string {
  if (fileTypes.length === 0) {
    return '<div class="empty-row">No files found.</div>';
  }
  const max = Math.max(...fileTypes.map((t) => t.count), 1);
  return fileTypes.map((t) => compareRow(`.${t.extension}`, t.count, max, 'purple')).join('');
}

function compareRow(label: string, value: number, max: number, tone: 'gray' | 'purple'): string {
  const widthPct = Math.max(2, Math.round((value / max) * 100));
  return `<div class="compare-row">
    <div class="compare-label">${escapeHtml(label)}</div>
    <div class="compare-track"><div class="compare-fill ${tone}" style="width:${widthPct}%"></div></div>
    <div class="compare-value">${value}</div>
  </div>`;
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAge(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years}y old`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months}mo old`;
  }
  return `${days}d old`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
