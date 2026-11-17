import { parse } from "csv-parse/sync";

/** One row of a game data table, exactly as exported: every value is a string. */
export type Row = Record<string, string>;

/** Game data tables keyed by table name (for example `ItemSparse`). */
export type Tables = Record<string, Row[]>;

export function parseCsv(text: string): Row[] {
  return parse(text, { columns: true, skip_empty_lines: true }) as Row[];
}

export function indexBy(rows: Row[], column: string): Map<number, Row> {
  const map = new Map<number, Row>();
  for (const row of rows) map.set(Number(row[column]), row);
  return map;
}

export function groupBy(rows: Row[], column: string): Map<number, Row[]> {
  const map = new Map<number, Row[]>();
  for (const row of rows) {
    const key = Number(row[column]);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Reads a table that a build must provide; a missing table is a hard error. */
export function requireTable(tables: Tables, name: string): Row[] {
  const rows = tables[name];
  if (!rows) throw new Error(`Game data table "${name}" is missing`);
  return rows;
}
