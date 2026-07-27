# Changelog

## 0.1.1

- README now leads with a Marketplace install link and real dashboard
  screenshots.
- Redefined "README drift" for VS Code extensions: undocumented/stale
  now checks against `package.json`'s declared commands and settings
  instead of raw TypeScript/Python exports, which was noisy on any
  multi-file project. Falls back to a plain script/function check on
  non-extension projects.

## 0.1.0

Initial release.

- Commit message quality linter (batch scan + dashboard heat-strip)
- README drift detector (undocumented and stale symbols)
- Stale TODO/FIXME detection with `git blame`-based aging
- Best-effort leaked secret scanning over recent commit diffs
- Onboarding checklist (README, LICENSE, CONTRIBUTING, .gitignore, issue template, CODE_OF_CONDUCT)
- Unified 0-100 health score with trend tracking
- GitHub-dark Webview dashboard with score history, commit quality, commit volume, README drift, and file type charts
- Status bar item for quick access, auto-refreshing on save and commit
