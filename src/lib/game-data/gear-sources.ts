import type { Faction } from "./quest-factions";
import { USER_AGENT, type FetchLike } from "./wago";

/**
 * Gear that is not crafted, and where it comes from. The game's own tables
 * list every item ever made, obtainable or not, and say nothing of where one
 * drops; so the only gear taken in is gear a published page names a source
 * for: the boss drops and quest rewards on wowforever.be's dungeon pages, and
 * the pieces on its pre-raid best-in-slot lists.
 */
export interface GearSource {
  /** Dropped in a dungeon, rewarded by a dungeon quest, or named on a best-in-slot list. */
  kind: "drop" | "quest" | "list";
  /** The dungeon, or the name of the list. */
  place: string;
  /** The boss, the quest, or what the list says of the source. Null when the page names none. */
  from: string | null;
  /** Set when only one faction can do the quest. */
  faction?: Faction;
  /** The page that says so. */
  url: string;
}

export type GearSources = Record<number, GearSource[]>;

const ORIGIN = "https://wowforever.be";
export const DUNGEON_INDEX_URL = `${ORIGIN}/guides/dungeons/`;
export const BIS_INDEX_URL = `${ORIGIN}/bis/forever/preraid/`;
const BIS_LIST_NAME = "Pre-raid best-in-slot list";
/** Fewer than this and the pages have most likely changed shape; better to keep what is known. */
const FEWEST_PLAUSIBLE_ITEMS = 100;
const MOST_SOURCES_PER_ITEM = 8;
const PAGES_AT_ONCE = 4;

export const dungeonLootUrl = (slug: string) => `${DUNGEON_INDEX_URL}${slug}/`;
export const dungeonQuestsUrl = (slug: string) => `${DUNGEON_INDEX_URL}${slug}/quests/`;
export const bisListUrl = (slug: string) => `${BIS_INDEX_URL}${slug}/`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/g, (entity, name) => ENTITIES[name] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/** The ids of the items a stretch of a page shows as loot. */
function itemIds(html: string, marker: string): number[] {
  const ids: number[] = [];
  for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
    if (!tag.includes(marker)) continue;
    const id = tag.match(/\/item=(\d+)/)?.[1];
    if (id) ids.push(Number(id));
  }
  return ids;
}

function slugs(html: string, prefix: string): string[] {
  const pattern = new RegExp(`href="${prefix}([a-z0-9-]+)/"`, "g");
  return [...new Set([...html.matchAll(pattern)].map((match) => match[1]))].sort();
}

export function parseDungeonIndex(html: string): string[] {
  return slugs(html, "/guides/dungeons/");
}

export function parseBisIndex(html: string): string[] {
  return slugs(html, "/bis/forever/preraid/");
}

export interface DungeonLoot {
  name: string;
  /** `boss` is null for drops from no boss in particular; `anchor` is where on the page they are. */
  drops: { itemId: number; boss: string | null; anchor: string }[];
  questRewards: { itemId: number; quest: string; questId: number }[];
}

/** Reads a dungeon's loot page. Null for a page that lists no loot (a page about two wings, say). */
export function parseDungeonLoot(html: string): DungeonLoot | null {
  const name = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const questsAt = html.search(/<section\b[^>]*\bid="quest-rewards"/);
  const bossPart = questsAt === -1 ? html : html.slice(0, questsAt);
  const questPart = questsAt === -1 ? "" : html.slice(questsAt).split(/<section\b[^>]*wf-page__faq/)[0];

  const drops: DungeonLoot["drops"] = [];
  const bosses = bossPart.split(/<section\b[^>]*class="wf-dng__boss"[^>]*\bid="/).slice(1);
  for (const section of bosses) {
    const anchor = section.slice(0, section.indexOf('"'));
    const heading = section.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "";
    // The heading carries a running number and "Level 19 · 3 drops" beside the name.
    const boss = text(heading.replace(/<span class="wf-dng__(?:num|sub)"[^>]*>[\s\S]*?<\/span>/g, ""));
    for (const itemId of itemIds(section, "wf-item__name")) {
      drops.push({ itemId, boss: anchor === "other-drops" || boss === "" ? null : boss, anchor });
    }
  }

  const questRewards: DungeonLoot["questRewards"] = [];
  for (const section of questPart.split(/<section\b[^>]*class="wf-dng__boss"/).slice(1)) {
    const heading = section.match(/<h4\b[^>]*>\s*<a\b[^>]*#quest-(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!heading) continue;
    for (const itemId of itemIds(section, "wf-item__name")) {
      questRewards.push({ itemId, quest: text(heading[2]), questId: Number(heading[1]) });
    }
  }

  if (!name || (drops.length === 0 && questRewards.length === 0)) return null;
  return { name, drops, questRewards };
}

/** Reads which side can do each quest from the table on a dungeon's quests page. Absent means both. */
export function parseQuestSides(html: string): Map<number, Faction> {
  const sides = new Map<number, Faction>();
  for (const [, questId, rest] of html.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>\s*<a href="#quest-(\d+)"[\s\S]*?<\/a>\s*<\/td>([\s\S]*?)<\/tr>/g)) {
    const cells = [...rest.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]).toLowerCase());
    const side = cells[cells.length - 1];
    if (side === "alliance" || side === "horde") sides.set(Number(questId), side);
  }
  return sides;
}

/** Reads the items of a best-in-slot list with what the list says of their source. */
export function parseBisList(html: string): { itemId: number; source: string | null }[] {
  const rows: { itemId: number; source: string | null }[] = [];
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const itemId = itemIds(row, "wf-bisd__item")[0];
    const source = text(row.match(/class="wf-bisd__sourcetext"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (itemId === undefined) continue;
    // Crafted pieces are the site's own business already.
    if (/^crafted$/i.test(source)) continue;
    rows.push({ itemId, source: source === "" || /not listed yet/i.test(source) ? null : source });
  }
  return rows;
}

export interface DungeonPages {
  slug: string;
  loot: DungeonLoot;
  sides: Map<number, Faction>;
}

/** Puts what the pages say together, item by item: drops first, then quests, then lists. */
export function collectGearSources(
  dungeons: DungeonPages[],
  lists: { slug: string; rows: { itemId: number; source: string | null }[] }[],
): GearSources {
  const sources: GearSources = {};
  const add = (itemId: number, source: GearSource) => {
    const known = (sources[itemId] ??= []);
    const same = (other: GearSource) =>
      other.kind === source.kind && other.place === source.place && other.from === source.from;
    if (known.length < MOST_SOURCES_PER_ITEM && !known.some(same)) known.push(source);
  };

  for (const { slug, loot } of dungeons) {
    for (const drop of loot.drops) {
      add(drop.itemId, { kind: "drop", place: loot.name, from: drop.boss, url: `${dungeonLootUrl(slug)}#${drop.anchor}` });
    }
  }
  for (const { slug, loot, sides } of dungeons) {
    for (const reward of loot.questRewards) {
      const faction = sides.get(reward.questId);
      add(reward.itemId, {
        kind: "quest",
        place: loot.name,
        from: reward.quest,
        ...(faction ? { faction } : {}),
        url: `${dungeonQuestsUrl(slug)}#quest-${reward.questId}`,
      });
    }
  }
  for (const { slug, rows } of lists) {
    for (const row of rows) {
      // A list adds nothing to an item whose drop or quest is already known.
      if (sources[row.itemId]?.some((source) => source.kind !== "list")) continue;
      add(row.itemId, { kind: "list", place: BIS_LIST_NAME, from: row.source, url: bisListUrl(slug) });
    }
  }
  return sources;
}

const REQUEST: RequestInit = { headers: { "User-Agent": USER_AGENT }, cache: "no-store" };

type Page = { ok: true; html: string } | { ok: false; missing: boolean; reason: string };

async function page(url: string, fetchFn: FetchLike): Promise<Page> {
  try {
    const response = await fetchFn(url, REQUEST);
    if (response.ok) return { ok: true, html: await response.text() };
    return { ok: false, missing: response.status === 404, reason: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, missing: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Runs the jobs a few at a time, in order of arrival, so the site is not asked for everything at once. */
async function inTurn<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < jobs.length; index = next++) results[index] = await jobs[index]();
  };
  await Promise.all(Array.from({ length: Math.min(PAGES_AT_ONCE, jobs.length) }, worker));
  return results;
}

/**
 * Downloads and reads every dungeon's loot and the best-in-slot lists.
 * Returns null, with the reason among the warnings, when any page could not be
 * read: a partial answer would make gear vanish from the site for a day, so
 * what the database already has is kept instead.
 */
export async function fetchGearSources(
  fetchFn: FetchLike = fetch,
): Promise<{ sources: GearSources | null; warnings: string[] }> {
  const failed: string[] = [];
  const fail = (what: string, result: { reason: string }) => failed.push(`${what}: ${result.reason}`);

  const dungeonIndex = await page(DUNGEON_INDEX_URL, fetchFn);
  const bisIndex = await page(BIS_INDEX_URL, fetchFn);
  if (!dungeonIndex.ok) fail("dungeon list", dungeonIndex);
  if (!bisIndex.ok) fail("best-in-slot lists", bisIndex);

  const dungeons = await inTurn(
    (dungeonIndex.ok ? parseDungeonIndex(dungeonIndex.html) : []).map((slug) => async (): Promise<DungeonPages | null> => {
      const lootPage = await page(dungeonLootUrl(slug), fetchFn);
      if (!lootPage.ok) {
        fail(`dungeon ${slug}`, lootPage);
        return null;
      }
      const loot = parseDungeonLoot(lootPage.html);
      if (!loot) return null;
      let sides = new Map<number, Faction>();
      if (loot.questRewards.length > 0) {
        const questsPage = await page(dungeonQuestsUrl(slug), fetchFn);
        if (questsPage.ok) sides = parseQuestSides(questsPage.html);
        else fail(`quests of ${slug}`, questsPage);
      }
      return { slug, loot, sides };
    }),
  );

  const lists = await inTurn(
    (bisIndex.ok ? parseBisIndex(bisIndex.html) : []).map((slug) => async () => {
      const listPage = await page(bisListUrl(slug), fetchFn);
      // A list that is announced but not written yet is simply not there.
      if (!listPage.ok && !listPage.missing) fail(`best-in-slot list ${slug}`, listPage);
      return { slug, rows: listPage.ok ? parseBisList(listPage.html) : [] };
    }),
  );

  if (failed.length > 0) {
    return {
      sources: null,
      warnings: [`Gear from drops and quests was left as it was; could not read ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}`],
    };
  }
  const sources = collectGearSources(
    dungeons.filter((dungeon): dungeon is DungeonPages => dungeon !== null),
    lists,
  );
  const found = Object.keys(sources).length;
  if (found < FEWEST_PLAUSIBLE_ITEMS) {
    return {
      sources: null,
      warnings: [`Gear from drops and quests was left as it was; the pages named only ${found} items, so they may have changed`],
    };
  }
  return { sources, warnings: [] };
}
