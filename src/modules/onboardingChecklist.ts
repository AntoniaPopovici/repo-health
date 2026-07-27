import * as vscode from 'vscode';
import { OnboardingItem } from '../types';

interface Check {
  key: string;
  label: string;
  glob: string;
}

const CHECKS: Check[] = [
  { key: 'readme', label: 'README.md', glob: '**/README.md' },
  { key: 'license', label: 'LICENSE', glob: '**/{LICENSE,LICENSE.md,LICENSE.txt}' },
  { key: 'contributing', label: 'CONTRIBUTING.md', glob: '**/CONTRIBUTING.md' },
  { key: 'gitignore', label: '.gitignore', glob: '**/.gitignore' },
  { key: 'issueTemplate', label: 'Issue template', glob: '**/.github/ISSUE_TEMPLATE/**' },
  { key: 'codeOfConduct', label: 'CODE_OF_CONDUCT.md', glob: '**/CODE_OF_CONDUCT.md' }
];

// Existence checks only — doesn't validate file contents.
export async function scanOnboardingChecklist(exclude: string): Promise<OnboardingItem[]> {
  const items: OnboardingItem[] = [];
  for (const check of CHECKS) {
    const matches = await vscode.workspace.findFiles(check.glob, exclude, 1);
    items.push({ key: check.key, label: check.label, present: matches.length > 0 });
  }
  return items;
}
