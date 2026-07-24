const WORD_RE = /[A-Za-z_$][\w$]*/g;

/**
 * Builds a set of whole-word tokens found anywhere in the README (prose,
 * headings, code blocks — all of it). A symbol is considered "documented"
 * if its exact name shows up as one of these tokens, so e.g. `parse` won't
 * match inside `parseFile` and vice versa.
 */
export function buildDocumentedWordSet(readmeText: string): Set<string> {
  const words = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(readmeText)) !== null) {
    words.add(match[0]);
  }
  return words;
}

export function isDocumented(name: string, documentedWords: Set<string>): boolean {
  return documentedWords.has(name);
}
