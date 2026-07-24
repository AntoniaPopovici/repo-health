export interface ExportedSymbol {
  name: string;
  line: number; // 0-based
  column: number; // 0-based
  kind: 'function' | 'class' | 'const';
}
