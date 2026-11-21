import { questFactionOf, type Faction, type QuestFaction } from "./quest-factions";
import type { GameRecipe } from "./types";

/**
 * Trainer unlock levels are decided by the game server and are not in the
 * client's data tables, so they come from two community databases that record
 * what trainers actually show. A level is only trusted when the sources agree.
 */

export interface WowForeverRow {
  name: string;
  /** Crafted item id, when the row links an item. */
  itemId: number | null;
  /** Recipe spell id, when the row links a spell instead. */
  spellId: number | null;
  learnSkill: number;
  /** "trainer", "starter", "vendor", "drop", "quest", "unknown" or a combination. */
  acquisition: string;
  acquisitionText: string | null;
  /** The quests named as a source, when a quest is one of the ways to get the recipe. */
  questNames: string[];
  /** Base training cost in copper. */
  trainingCost: number | null;
}

export interface WikiRow {
  name: string;
  skill: number;
  source: string;
}

export type UnlockStatus = "confirmed" | "single_source" | "disputed" | "unconfirmed";

export interface UnlockInfo {
  /** Null unless the level is confirmed or comes from a single source. */
  learnSkill: number | null;
  status: UnlockStatus;
  candidates: { wowForever: number | null; wiki: number | null; recipeItem: number | null };
  acquisition: string;
  acquisitionText: string | null;
  /** Set when the quest that hands out the recipe is for one faction only. */
  questFaction: Faction | null;
  trainingCost: number | null;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;|&#39;/g, (entity) => ENTITIES[entity] ?? entity);
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** "2s 50c" → 250 copper. Returns null for anything that is not a coin amount. */
export function parseCoinText(text: string): number | null {
  const match = text.trim().match(/^(?:(\d+)g)?\s*(?:(\d+)s)?\s*(?:(\d+)c)?$/);
  if (!match || match[0] === "") return null;
  const [, gold, silver, copper] = match;
  if (!gold && !silver && !copper) return null;
  return Number(gold ?? 0) * 10000 + Number(silver ?? 0) * 100 + Number(copper ?? 0);
}

/** Reads the recipe table of a wowforever.be profession page. */
export function parseWowForeverRecipes(html: string): WowForeverRow[] {
  const rows: WowForeverRow[] = [];
  const rowPattern = /<tr\b([^>]*\bdata-learn="[^"]*"[^>]*)>([\s\S]*?)<\/tr>/g;
  for (const [, attributes, inner] of html.matchAll(rowPattern)) {
    const attribute = (name: string) =>
      attributes.match(new RegExp(`\\bdata-${name}="([^"]*)"`))?.[1] ?? "";

    const link = inner.match(/class="wf-ts__item"[^>]*href="[^"]*\/(item|spell)=(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const [, kind, id, linkInner] = link;

    const sourceCell = inner.match(/<td[^>]*class="wf-ts__source"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";
    // The cell is a label followed by detail spans; join them the way the page reads.
    const parts = sourceCell
      .split(/<span[^>]*>/)
      .map((part) => textOf(part).replace(/^·\s*/, ""))
      .filter(Boolean);
    const acquisitionText = parts.length > 0 ? parts.join(" · ") : null;
    const cost = parts.length === 2 ? parseCoinText(parts[1]) : null;
    const acquisition = decodeEntities(attribute("src")) || "unknown";
    // After the label come prices, sellers ("Name (Zone)") and quest names, unmarked.
    const questNames = acquisition.split(" ").includes("quest")
      ? parts.slice(1).filter((part) => parseCoinText(part) === null && !/\(.+\)/.test(part))
      : [];

    rows.push({
      name: textOf(linkInner),
      itemId: kind === "item" ? Number(id) : null,
      spellId: kind === "spell" ? Number(id) : null,
      learnSkill: Number(attribute("learn")),
      acquisition,
      acquisitionText,
      questNames,
      trainingCost: attribute("src") === "trainer" ? cost : null,
    });
  }
  return rows;
}

/** Reads the "Item || Skill || Type || New? || Source" tables of a Warcraft Wiki recipe page. */
export function parseWikiRecipeTable(wikitext: string): WikiRow[] {
  const rows: WikiRow[] = [];
  for (const line of wikitext.split("\n")) {
    if (!line.startsWith("|") || line.startsWith("|-") || line.startsWith("|+") || line.startsWith("|}")) {
      continue;
    }
    const cells = line.slice(1).split("||").map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const name = cells[0].match(/\[\[([^\]|]+)/)?.[1];
    const skill = Number(cells[1]);
    if (!name || !Number.isFinite(skill) || cells[1] === "") continue;
    rows.push({ name: name.trim(), skill, source: cells[cells.length - 1] || "?" });
  }
  return rows;
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[’`]/g, "'").trim();
}

/**
 * The game's own data comes first. Plans carry the skill they need, and that is
 * what the game checks, so it wins over anything a site says: the sites still
 * list older numbers for recipes the game has since retuned.
 *
 * Recipes without plans (trainer recipes) depend on the sites. A site level is
 * ignored when the game data rules it out: a recipe cannot need more skill than
 * the point at which the game already shows it as yellow.
 */
function decide(
  wowForever: number | null,
  wiki: number | null,
  recipeItem: number | null,
  skillYellow: number,
): { learnSkill: number | null; status: UnlockStatus } {
  if (recipeItem !== null) return { learnSkill: recipeItem, status: "confirmed" };

  const listed = [wowForever, wiki].filter((value): value is number => value !== null);
  if (listed.length === 0) return { learnSkill: null, status: "unconfirmed" };

  const possible = (value: number) => skillYellow <= 0 || value <= skillYellow;
  if (!listed.every(possible)) return { learnSkill: null, status: "disputed" };
  if (listed.length === 1) return { learnSkill: listed[0], status: "single_source" };
  return listed[0] === listed[1]
    ? { learnSkill: listed[0], status: "confirmed" }
    : { learnSkill: null, status: "disputed" };
}

/**
 * Works out each recipe's unlock level: from the plans for plan-taught recipes,
 * and from the two sites for the rest. Nothing is ever estimated.
 */
export function resolveUnlockLevels(
  recipes: GameRecipe[],
  itemNames: Map<number, string>,
  wowForeverRows: WowForeverRow[],
  wikiRows: WikiRow[],
  questFactions: Record<string, QuestFaction> = {},
): Map<number, UnlockInfo> {
  const wowForeverByItem = new Map<number, WowForeverRow>();
  const wowForeverBySpell = new Map<number, WowForeverRow>();
  const wowForeverByName = new Map<string, WowForeverRow>();
  for (const row of wowForeverRows) {
    if (row.itemId !== null) wowForeverByItem.set(row.itemId, row);
    if (row.spellId !== null) wowForeverBySpell.set(row.spellId, row);
    wowForeverByName.set(normalise(row.name), row);
  }
  const wikiByName = new Map<string, WikiRow>();
  for (const row of wikiRows) wikiByName.set(normalise(row.name), row);

  const resolved = new Map<number, UnlockInfo>();
  for (const recipe of recipes) {
    const craftedName =
      recipe.craftedItemId !== null ? itemNames.get(recipe.craftedItemId) : undefined;
    // Leftover recipes without item data share names with real ones; only match those by id.
    const nameKeys = recipe.status === "ok" ? [craftedName, recipe.name] : [];

    const site =
      wowForeverBySpell.get(recipe.id) ??
      (recipe.craftedItemId !== null ? wowForeverByItem.get(recipe.craftedItemId) : undefined) ??
      nameKeys.map((n) => (n ? wowForeverByName.get(normalise(n)) : undefined)).find(Boolean);
    const wikiRow = nameKeys
      .map((n) => (n ? wikiByName.get(normalise(n)) : undefined))
      .find(Boolean);

    const candidates = {
      wowForever: site?.learnSkill ?? null,
      wiki: wikiRow?.skill ?? null,
      recipeItem: recipe.recipeItemSkill,
    };
    const wikiSource = wikiRow && wikiRow.source !== "?" ? wikiRow.source.toLowerCase() : null;

    resolved.set(recipe.id, {
      ...decide(candidates.wowForever, candidates.wiki, candidates.recipeItem, recipe.skillYellow),
      candidates,
      acquisition: site?.acquisition ?? wikiSource ?? "unknown",
      acquisitionText: site?.acquisitionText ?? null,
      questFaction: questFactionOf(site?.questNames ?? [], questFactions),
      trainingCost: site?.trainingCost ?? null,
    });
  }
  return resolved;
}
