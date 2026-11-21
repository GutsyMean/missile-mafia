import { parseCsv, type Row, type Tables } from "./tables";

/**
 * wago.tools publishes the game's own data tables as CSV. Its guidance for
 * automated clients: use the build API and the CSV route, pin an exact
 * version, and do not re-download a table and version you already have.
 */
const ORIGIN = "https://wago.tools";

/** The wago.tools product key for World of Warcraft: Forever. */
export const GAME_PRODUCT = "wowf";

export const USER_AGENT = "guild-crafting-site/1.0";

/** Every table the game-data builders read. */
export const TABLE_NAMES = [
  "ArmorLocation",
  "ChrClasses",
  "GlobalStrings",
  "Item",
  "ItemAppearance",
  "ItemArmorQuality",
  "ItemArmorShield",
  "ItemArmorTotal",
  "ItemClass",
  "ItemDamageOneHand",
  "ItemDamageOneHandCaster",
  "ItemDamageRanged",
  "ItemDamageThrown",
  "ItemDamageTwoHand",
  "ItemDamageTwoHandCaster",
  "ItemDamageWand",
  "ItemEffect",
  "ItemModifiedAppearance",
  "ItemSparse",
  "ItemSubClass",
  "ItemXItemEffect",
  "RandPropPoints",
  "SkillLine",
  "SkillLineAbility",
  "SkillRaceClassInfo",
  "Spell",
  "SpellEffect",
  "SpellItemEnchantment",
  "SpellMisc",
  "SpellName",
  "SpellReagents",
  "TalentTab",
] as const;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REQUEST: RequestInit = { headers: { "User-Agent": USER_AGENT }, cache: "no-store" };

export async function resolveLatestBuild(fetchFn: FetchLike = fetch): Promise<string> {
  const response = await fetchFn(`${ORIGIN}/api/builds/${GAME_PRODUCT}/latest`, REQUEST);
  const body = response.ok ? ((await response.json()) as { version?: unknown }) : null;
  if (!body || typeof body.version !== "string") {
    throw new Error(`Could not read the latest build from wago.tools (HTTP ${response.status})`);
  }
  return body.version;
}

export function tableUrl(table: string, version: string): string {
  return `${ORIGIN}/db2/${table}/csv?version=${version}&useHotfixes=1`;
}

export async function fetchTable(table: string, version: string, fetchFn: FetchLike = fetch): Promise<Row[]> {
  const response = await fetchFn(tableUrl(table, version), REQUEST);
  if (!response.ok) {
    throw new Error(`Could not download table ${table} for build ${version} (HTTP ${response.status})`);
  }
  return parseCsv(await response.text());
}

export async function fetchAllTables(
  version: string,
  fetchFn: FetchLike = fetch,
  concurrency = 4,
): Promise<Tables> {
  const tables: Tables = {};
  const queue = [...TABLE_NAMES];
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      tables[name] = await fetchTable(name, version, fetchFn);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return tables;
}
