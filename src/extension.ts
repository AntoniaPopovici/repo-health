import * as vscode from 'vscode';
import { scanTsJsFile } from './scanners/tsExports';
import { scanPyFile } from './scanners/pyExports';
import { buildDocumentedWordSet } from './readme';
import { buildDiagnostics } from './diagnostics';
import { ExportedSymbol } from './types';

const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('readmeDrift');
  outputChannel = vscode.window.createOutputChannel('README Drift');

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'readmeDrift.check';
  statusBarItem.text = '$(book) README Drift';
  statusBarItem.tooltip = 'Check README Drift';
  statusBarItem.show();

  context.subscriptions.push(
    diagnosticCollection,
    statusBarItem,
    outputChannel,
    vscode.commands.registerCommand('readmeDrift.check', () => runCheck(true))
  );

  registerWatchers(context);

  // Background scan shortly after startup, so we don't compete with other
  // extensions activating at the same time.
  setTimeout(() => runCheck(false), 1500);
}

export function deactivate(): void {
  diagnosticCollection?.dispose();
  statusBarItem?.dispose();
}

function registerWatchers(context: vscode.ExtensionContext): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleCheck = () => {
    if (!getConfig().get<boolean>('scanOnSave', true)) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => runCheck(false), 500);
  };

  const sourceWatcher = vscode.workspace.createFileSystemWatcher(
    getConfig().get<string>('include', '**/*.{ts,tsx,js,jsx,py}')
  );
  const readmeWatcher = vscode.workspace.createFileSystemWatcher(
    `**/${getConfig().get<string>('readmePath', 'README.md')}`
  );

  for (const watcher of [sourceWatcher, readmeWatcher]) {
    watcher.onDidChange(scheduleCheck);
    watcher.onDidCreate(scheduleCheck);
    watcher.onDidDelete(scheduleCheck);
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('readmeDrift')) {
        runCheck(false);
      }
    })
  );
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('readmeDrift');
}

async function runCheck(interactive: boolean): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    if (interactive) {
      vscode.window.showInformationMessage('README Drift: open a folder/workspace first.');
    }
    return;
  }

  const config = getConfig();
  const include = config.get<string>('include', '**/*.{ts,tsx,js,jsx,py}');
  const exclude = config.get<string>(
    'exclude',
    '**/{node_modules,out,dist,build,.git,venv,.venv,__pycache__}/**'
  );
  const readmePath = config.get<string>('readmePath', 'README.md');

  try {
    const readmeUris = await vscode.workspace.findFiles(`**/${readmePath}`, exclude, 1);
    if (readmeUris.length === 0) {
      diagnosticCollection.clear();
      updateStatusBar(undefined);
      if (interactive) {
        vscode.window.showWarningMessage(`README Drift: no ${readmePath} found in the workspace.`);
      }
      return;
    }

    const readmeBytes = await vscode.workspace.fs.readFile(readmeUris[0]);
    const documentedWords = buildDocumentedWordSet(Buffer.from(readmeBytes).toString('utf8'));

    const sourceUris = await vscode.workspace.findFiles(include, exclude);
    diagnosticCollection.clear();

    let totalIssues = 0;
    for (const uri of sourceUris) {
      const symbols = await scanFile(uri);
      if (symbols.length === 0) {
        continue;
      }
      const diagnostics = buildDiagnostics(symbols, documentedWords);
      if (diagnostics.length > 0) {
        diagnosticCollection.set(uri, diagnostics);
        totalIssues += diagnostics.length;
      }
    }

    updateStatusBar(totalIssues);
    outputChannel.appendLine(
      `[${new Date().toISOString()}] Scanned ${sourceUris.length} file(s), found ${totalIssues} undocumented export(s).`
    );

    if (interactive) {
      if (totalIssues === 0) {
        vscode.window.showInformationMessage('README Drift: no drift detected. Nice.');
      } else {
        vscode.window.showWarningMessage(
          `README Drift: ${totalIssues} exported symbol(s) missing from ${readmePath}. See Problems panel.`
        );
      }
    }
  } catch (err) {
    outputChannel.appendLine(`Error: ${(err as Error).message}`);
    if (interactive) {
      vscode.window.showErrorMessage(`README Drift check failed: ${(err as Error).message}`);
    }
  }
}

async function scanFile(uri: vscode.Uri): Promise<ExportedSymbol[]> {
  const ext = uri.path.slice(uri.path.lastIndexOf('.'));
  if (!TS_JS_EXTENSIONS.has(ext) && ext !== '.py') {
    return [];
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = Buffer.from(bytes).toString('utf8');

  return ext === '.py' ? scanPyFile(text) : scanTsJsFile(text);
}

function updateStatusBar(issueCount: number | undefined): void {
  if (issueCount === undefined) {
    statusBarItem.text = '$(book) README Drift: no README';
    statusBarItem.backgroundColor = undefined;
    return;
  }

  if (issueCount === 0) {
    statusBarItem.text = '$(check) README Drift: 0';
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(warning) README Drift: ${issueCount}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
}
