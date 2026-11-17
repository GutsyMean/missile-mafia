import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, type Tables } from "@/lib/game-data/tables";

const DB2_DIR = path.resolve(__dirname, "../fixtures/db2");

/** Loads the small committed slices of the game tables used by unit tests. */
export function loadFixtureTables(): Tables {
  const tables: Tables = {};
  for (const file of readdirSync(DB2_DIR)) {
    if (!file.endsWith(".csv")) continue;
    tables[file.replace(/\.csv$/, "")] = parseCsv(
      readFileSync(path.join(DB2_DIR, file), "utf8"),
    );
  }
  return tables;
}

export function readFixture(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "../fixtures", relativePath), "utf8");
}
