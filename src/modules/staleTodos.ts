import * as vscode from 'vscode';
import { getBlameForLine } from '../git';
import { StaleTodo } from '../types';

const TODO_RE = /\b(TODO|FIXME)\b\s*[:\-]?\s*(.*)/;
const MAX_TODOS = 200;

// Finds TODO/FIXME comments and ages them via `git blame` on the line
// they're on. Sorted oldest-first. Untracked/uncommitted lines age as 0
// days rather than being dropped.
export async function scanStaleTodos(
  workspaceRoot: vscode.Uri,
  include: string,
  exclude: string
): Promise<StaleTodo[]> {
  const cwd = workspaceRoot.fsPath;
  const uris = await vscode.workspace.findFiles(include, exclude);
  const found: Array<Omit<StaleTodo, 'ageDays' | 'author' | 'date'>> = [];

  outer: for (const uri of uris) {
    const relPath = vscode.workspace.asRelativePath(uri, false);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    const lines = text.split(/\r?\n/);

    for (let line = 0; line < lines.length; line++) {
      const match = TODO_RE.exec(lines[line]);
      if (!match) {
        continue;
      }
      found.push({
        text: match[2].trim() || match[1],
        kind: match[1].toUpperCase() as 'TODO' | 'FIXME',
        file: relPath,
        line
      });
      if (found.length >= MAX_TODOS) {
        break outer;
      }
    }
  }

  const now = Date.now();
  const withAge: StaleTodo[] = [];
  for (const todo of found) {
    const blame = await getBlameForLine(cwd, todo.file, todo.line + 1);
    const ageDays = blame?.date ? Math.floor((now - new Date(blame.date).getTime()) / 86_400_000) : 0;
    withAge.push({ ...todo, author: blame?.author, date: blame?.date, ageDays });
  }

  withAge.sort((a, b) => b.ageDays - a.ageDays);
  return withAge;
}
