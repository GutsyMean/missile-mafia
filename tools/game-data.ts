/**
 * Development dry run of the game-data build: downloads (or reuses cached)
 * game tables and unlock-level pages, builds the dataset and prints a summary.
 * Nothing is written to the database.
 *
 *   pnpm game-data [--version 1.60.1.70938] [--oracle path/to/snapshot.json.gz]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildDataset, type Dataset } from "../src/lib/game-data/dataset";
import { fetchUnlockPages } from "../src/lib/game-data/sources";
import { buildProfessions, buildRecipes } from "../src/lib/game-data/recipes";
import { fetchAllTables, resolveLatestBuild, type FetchLike } from "../src/lib/game-data/wago";

const CACHE = path.resolve(__dirname, "../.cache");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Wraps fetch so each URL is downloaded once and then served from disk. */
function cachingFetch(directory: string): FetchLike {
  mkdirSync(directory, { recursive: true });
  return async (url, init) => {
    const file = path.join(directory, encodeURIComponent(url).slice(-180));
    if (existsSync(file)) return new Response(readFileSync(file));
    const response = await fetch(url, init);
    if (!response.ok) return response;
    const body = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, body);
    return new Response(body);
  };
}

/** Table downloads are cached under their table name so they are easy to inspect. */
function tableFetch(version: string): FetchLike {
  const directory = path.join(CACHE, "wago", version);
  mkdirSync(directory, { recursive: true });
  return async (url, init) => {
    const table = url.match(/\/db2\/(\w+)\/csv/)?.[1];
    if (!table) return fetch(url, init);
    const file = path.join(directory, `${table}.csv`);
    if (existsSync(file)) return new Response(readFileSync(file));
    console.log(`  downloading ${table}`);
    const response = await fetch(url, init);
    if (!response.ok) return response;
    const body = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, body);
    return new Response(body);
  };
}

function count<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[key(value)] = (result[key(value)] ?? 0) + 1;
  return result;
}

function summarise(dataset: Dataset) {
  console.log(`\nBuild ${dataset.build}`);
  console.log(`Items: ${dataset.items.length} (${dataset.items.filter((i) => !i.tooltipComplete).length} with incomplete tooltips)`);
  console.log(`Recipes: ${dataset.recipes.length}`, count(dataset.recipes, (r) => r.status));
  for (const profession of dataset.professions) {
    const own = dataset.recipes.filter((r) => r.professionId === profession.id && r.status === "ok");
    console.log(
      `  ${profession.name.padEnd(16)} ${String(own.length).padStart(4)} recipes  unlock:`,
      count(own, (r) => r.unlock.status),
    );
  }
}

interface OracleItem { n: string; q: number; il: number; rl?: number; b?: number; s?: [number, number][]; ar?: number; dm?: { min: number; max: number } }

function diffOracle(dataset: Dataset, oraclePath: string) {
  const raw = readFileSync(oraclePath);
  const oracle = JSON.parse((oraclePath.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8")) as {
    build: string;
    items: Record<string, OracleItem>;
  };
  let compared = 0;
  const mismatches: string[] = [];
  for (const item of dataset.items) {
    const other = oracle.items[String(item.id)];
    if (!other) continue;
    compared++;
    const problems: string[] = [];
    if ((other.ar ?? null) !== item.armor) problems.push(`armor ${item.armor} vs ${other.ar}`);
    if (other.dm && (other.dm.min !== item.damage?.min || other.dm.max !== item.damage?.max)) {
      problems.push(`damage ${item.damage?.min}-${item.damage?.max} vs ${other.dm.min}-${other.dm.max}`);
    }
    if (!other.dm && item.damage) problems.push(`damage ${item.damage.min}-${item.damage.max} vs none`);
    const mine = [...item.stats].map((s) => `${s.stat}:${s.value}`).sort().join(",");
    const theirs = (other.s ?? []).map(([stat, value]) => `${stat}:${value}`).sort().join(",");
    if (item.tooltipComplete && mine !== theirs) problems.push(`stats [${mine}] vs [${theirs}]`);
    if (other.q !== item.quality) problems.push(`quality ${item.quality} vs ${other.q}`);
    if ((other.rl ?? 0) !== item.requiredLevel) problems.push(`req level ${item.requiredLevel} vs ${other.rl}`);
    if ((other.b ?? 0) !== item.bonding) problems.push(`bonding ${item.bonding} vs ${other.b}`);
    if (problems.length) mismatches.push(`${item.id} ${item.name} (ilvl ${item.itemLevel}): ${problems.join("; ")}`);
  }
  console.log(`\nOracle (build ${oracle.build}): compared ${compared} items, ${mismatches.length} differ`);
  for (const line of mismatches.slice(0, 60)) console.log("  " + line);
}

async function main() {
  const version = argument("version") ?? (await resolveLatestBuild());
  console.log(`Game tables for build ${version}`);
  const tables = await fetchAllTables(version, tableFetch(version));

  const professions = buildProfessions(tables, buildRecipes(tables));
  const { pages, warnings } = await fetchUnlockPages(professions, cachingFetch(path.join(CACHE, "unlock")));
  for (const warning of warnings) console.log(`  warning: ${warning}`);

  const dataset = buildDataset(tables, version, pages);
  summarise(dataset);
  writeFileSync(path.join(CACHE, "dataset.json"), JSON.stringify(dataset));
  console.log(`\nWrote ${path.join(CACHE, "dataset.json")}`);

  const oracle = argument("oracle");
  if (oracle) diffOracle(dataset, oracle);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
