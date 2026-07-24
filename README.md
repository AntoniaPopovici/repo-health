# README Drift Detector

A small VS Code extension that flags exported functions/classes in your
source code that never got mentioned in your `README.md`. No more docs
that quietly rot while the code moves on.

## What it does

- Scans your workspace for `.ts`, `.tsx`, `.js`, `.jsx`, and `.py` files
  (via `vscode.workspace.findFiles`) and extracts their exported symbols:
  - JS/TS: `export function`, `export class`, `export const/let/var`,
    and `export { ... }` lists (including `as` aliases).
  - Python: top-level `def`/`class` that don't start with `_` (the usual
    "this is public API" convention).
- Reads your `README.md` and checks whether each exported name shows up
  anywhere in it (whole-word match).
- Anything undocumented shows up as a warning in the **Problems** panel,
  pointing straight at the declaration.

## Using it

- Runs automatically in the background: on startup, and again (debounced)
  whenever a source file or the README is saved.
- Or trigger it on demand from the Command Palette (`Cmd+Shift+P` /
  `Ctrl+Shift+P`) → **"Check README Drift"**.
- The status bar item (bottom left) shows the current drift count and is
  itself a shortcut to re-run the check.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `readmeDrift.include` | `**/*.{ts,tsx,js,jsx,py}` | Glob of source files to scan. |
| `readmeDrift.exclude` | `**/{node_modules,out,dist,build,.git,venv,.venv,__pycache__}/**` | Glob of paths to ignore. |
| `readmeDrift.readmePath` | `README.md` | README file to check against, relative to the workspace root. |
| `readmeDrift.scanOnSave` | `true` | Whether to auto re-scan on save. |

## Architecture

Everything lives in `src/`:

- `extension.ts` wires it all together: `activate` registers the
  `readmeDrift.check` command, sets up file watchers, and kicks off the
  first background scan; `deactivate` just disposes the diagnostic
  collection and status bar item.
- `scanners/tsExports.ts` exports `scanTsJsFile`, a regex-based scanner
  for JS/TS export statements (deliberately not using the TypeScript
  compiler API, so the extension ships with zero runtime dependencies).
- `scanners/pyExports.ts` exports `scanPyFile`, the Python equivalent.
- `readme.ts` exports `buildDocumentedWordSet` (tokenizes the README into
  a word set) and `isDocumented` (the lookup against it).
- `diagnostics.ts` exports `buildDiagnostics`, which turns undocumented
  symbols into `vscode.Diagnostic`s, tagged with source `DIAGNOSTIC_SOURCE`.

## Known limitations (MVP)

- Regex-based scanning, not a real parser — very dynamic export patterns
  (e.g. computed re-exports, `export * from`) aren't picked up.
- "Documented" just means the name appears somewhere in the README as a
  whole word — it doesn't check that the surrounding text is actually
  describing that function.
- Single-root workspace assumption for the README lookup (first match of
  `readmePath` wins).

## Development

```bash
npm install
npm run compile   # or: npm run watch
```

Then press `F5` in VS Code to launch an Extension Development Host with
the extension loaded.

## License

MIT
