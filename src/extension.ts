import * as vscode from 'vscode';
import { scanRecentCommits } from './modules/commitLinter';
import { scanReadmeDrift } from './modules/readmeDrift';
import { scanStaleTodos } from './modules/staleTodos';
import { scanForLeakedSecrets } from './modules/secretScanner';
import { scanOnboardingChecklist } from './modules/onboardingChecklist';
import { scanFileTypeDistribution } from './modules/fileTypeStats';
import { computeScore } from './scoring';
import { RepoHealthPanel } from './webview/panel';
import { isGitRepo } from './git';
import { HealthScan, ScoreHistoryPoint } from './types';

const SCORE_HISTORY_KEY = 'repoHealth.scoreHistory';
const MAX_HISTORY_POINTS = 30;
const BACKGROUND_SCAN_DEBOUNCE_MS = 800;

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'repoHealth.showDashboard';
  statusBarItem.text = '$(shield) Repo Health';
  statusBarItem.tooltip = 'Click to scan and view the Repo Health dashboard';
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('repoHealth.showDashboard', () => runScan(context, { openPanel: true })),
    vscode.commands.registerCommand('repoHealth.rescan', () => runScan(context, { openPanel: true }))
  );

  registerBackgroundWatchers(context);

  // Populate the status bar shortly after startup, so it doesn't compete
  // with other extensions activating at the same time.
  setTimeout(() => runScan(context, { openPanel: false }), 1500);
}

export function deactivate(): void {
  statusBarItem?.dispose();
}

function registerBackgroundWatchers(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('repoHealth');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleBackgroundScan = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => runScan(context, { openPanel: false }), BACKGROUND_SCAN_DEBOUNCE_MS);
  };

  const include = config.get<string>('include', '**/*.{ts,tsx,js,jsx,py}');
  const readmePath = config.get<string>('readmePath', 'README.md');

  const sourceWatcher = vscode.workspace.createFileSystemWatcher(include);
  const readmeWatcher = vscode.workspace.createFileSystemWatcher(`**/${readmePath}`);
  // Catches new commits and branch switches, not just source edits.
  const gitHeadWatcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');

  for (const watcher of [sourceWatcher, readmeWatcher, gitHeadWatcher]) {
    watcher.onDidChange(scheduleBackgroundScan);
    watcher.onDidCreate(scheduleBackgroundScan);
    watcher.onDidDelete(scheduleBackgroundScan);
    context.subscriptions.push(watcher);
  }
}

async function runScan(context: vscode.ExtensionContext, options: { openPanel: boolean }): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    updateStatusBar(undefined);
    if (options.openPanel) {
      vscode.window.showInformationMessage('Repo Health: open a folder/workspace first.');
    }
    return;
  }

  const panel = options.openPanel ? RepoHealthPanel.createOrShow(context.extensionUri) : RepoHealthPanel.currentPanel;
  if (options.openPanel) {
    panel?.showLoading(folder.name);
  }

  const gitOk = await isGitRepo(folder.uri.fsPath);
  if (!gitOk && options.openPanel) {
    vscode.window.showWarningMessage(
      'Repo Health: this workspace does not look like a git repository — commit and secret scans will be skipped.'
    );
  }

  const config = vscode.workspace.getConfiguration('repoHealth');
  const include = config.get<string>('include', '**/*.{ts,tsx,js,jsx,py}');
  const exclude = config.get<string>('exclude', '**/{node_modules,out,dist,build,.git,venv,.venv,__pycache__}/**');
  const readmePath = config.get<string>('readmePath', 'README.md');
  const commitScanCount = config.get<number>('commitScanCount', 30);
  const secretScanDepth = config.get<number>('secretScanCommitDepth', 50);

  try {
    const [commits, readmeDrift, staleTodos, secrets, onboarding, fileTypes] = await Promise.all([
      gitOk ? scanRecentCommits(folder.uri.fsPath, commitScanCount) : Promise.resolve([]),
      scanReadmeDrift(folder.uri, include, exclude, readmePath),
      scanStaleTodos(folder.uri, include, exclude),
      gitOk ? scanForLeakedSecrets(folder.uri, secretScanDepth) : Promise.resolve([]),
      scanOnboardingChecklist(exclude),
      scanFileTypeDistribution(exclude)
    ]);

    const priorHistory = context.workspaceState.get<ScoreHistoryPoint[]>(SCORE_HISTORY_KEY, []);
    const previousOverall = priorHistory.length ? priorHistory[priorHistory.length - 1].overall : undefined;
    const score = computeScore(commits, readmeDrift, staleTodos, secrets, onboarding, previousOverall);

    const scoreHistory = [...priorHistory, { timestamp: new Date().toISOString(), overall: score.overall }].slice(
      -MAX_HISTORY_POINTS
    );
    await context.workspaceState.update(SCORE_HISTORY_KEY, scoreHistory);

    const scan: HealthScan = {
      repoName: folder.name,
      commits,
      readmeDrift,
      staleTodos,
      secrets,
      onboarding,
      fileTypes,
      scoreHistory,
      score
    };

    updateStatusBar(score.overall);
    panel?.update(scan);
  } catch (err) {
    updateStatusBar(undefined);
    if (options.openPanel) {
      vscode.window.showErrorMessage(`Repo Health scan failed: ${(err as Error).message}`);
    }
  }
}

function updateStatusBar(overall: number | undefined): void {
  if (overall === undefined) {
    statusBarItem.text = '$(shield) Repo Health';
    statusBarItem.tooltip = 'Click to scan and view the Repo Health dashboard';
    statusBarItem.backgroundColor = undefined;
    return;
  }

  statusBarItem.text = `$(shield) ${overall}`;
  statusBarItem.tooltip = `Repo Health: ${overall}/100 — click to view the dashboard`;
  statusBarItem.backgroundColor =
    overall < 50
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : overall < 80
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
}
