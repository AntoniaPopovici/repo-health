import * as vscode from 'vscode';
import { ExportedSymbol } from './types';
import { isDocumented } from './readme';

export const DIAGNOSTIC_SOURCE = 'README Drift';

export function buildDiagnostics(
  symbols: ExportedSymbol[],
  documentedWords: Set<string>
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  for (const symbol of symbols) {
    if (isDocumented(symbol.name, documentedWords)) {
      continue;
    }

    const range = new vscode.Range(
      new vscode.Position(symbol.line, symbol.column),
      new vscode.Position(symbol.line, symbol.column + symbol.name.length)
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      `Exported ${symbol.kind} '${symbol.name}' is not mentioned in the README.`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = symbol.name;
    diagnostics.push(diagnostic);
  }

  return diagnostics;
}
