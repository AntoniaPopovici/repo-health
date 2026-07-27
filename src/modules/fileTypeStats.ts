import * as vscode from 'vscode';
import { FileTypeCount } from '../types';

const MAX_BUCKETS = 7;

/** Counts files by extension across the whole workspace (minus the usual excludes). */
export async function scanFileTypeDistribution(exclude: string): Promise<FileTypeCount[]> {
  const uris = await vscode.workspace.findFiles('**/*', exclude);
  const counts = new Map<string, number>();

  for (const uri of uris) {
    const base = uri.path.slice(uri.path.lastIndexOf('/') + 1);
    const dotIndex = base.lastIndexOf('.');
    const extension = dotIndex > 0 ? base.slice(dotIndex + 1).toLowerCase() : '(none)';
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, MAX_BUCKETS).map(([extension, count]) => ({ extension, count }));
  const restCount = sorted.slice(MAX_BUCKETS).reduce((sum, [, count]) => sum + count, 0);

  if (restCount > 0) {
    top.push({ extension: 'other', count: restCount });
  }
  return top;
}
