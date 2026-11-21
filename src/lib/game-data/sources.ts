import type { UnlockPages } from "./dataset";
import {
  QUESTS_PER_REQUEST,
  isAskable,
  questTitles,
  readQuestFactions,
  type QuestFaction,
  type WikiQuery,
} from "./quest-factions";
import type { GameProfession } from "./types";
import { parseWowForeverRecipes } from "./unlock-levels";
import { USER_AGENT, type FetchLike } from "./wago";

/** Warcraft Wiki recipe list pages for WoW Forever, by profession slug. */
export const WIKI_RECIPE_PAGES: Record<string, string> = {
  alchemy: "Forever_alchemy_recipes",
  blacksmithing: "Forever_blacksmithing_plans",
  cooking: "Forever_cooking_recipes",
  enchanting: "Forever_enchanting_formulas",
  engineering: "Forever_engineering_schematics",
  "first-aid": "Forever_first_aid_recipes",
  leatherworking: "Forever_leatherworking_patterns",
  tailoring: "Forever_tailoring_patterns",
};

/** Professions wowforever.be publishes a recipe table for. */
export const WOWFOREVER_RECIPE_PAGES = new Set([
  "alchemy",
  "blacksmithing",
  "cooking",
  "enchanting",
  "engineering",
  "first-aid",
  "leatherworking",
  "mining",
  "tailoring",
]);

export function wowForeverUrl(slug: string): string {
  return `https://wowforever.be/tradeskills/forever/${slug}/recipes/`;
}

export function wikiUrl(pageTitle: string): string {
  return `https://warcraft.wiki.gg/api.php?action=parse&page=${pageTitle}&prop=wikitext&format=json&formatversion=2`;
}

/** The opening section of several wiki pages at once, following redirects. */
export function wikiQuestsUrl(titles: string[]): string {
  return (
    "https://warcraft.wiki.gg/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0" +
    `&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join("|"))}`
  );
}

const REQUEST: RequestInit = { headers: { "User-Agent": USER_AGENT }, cache: "no-store" };

async function download(url: string, label: string, fetchFn: FetchLike, warnings: string[]) {
  try {
    const response = await fetchFn(url, REQUEST);
    if (response.ok) return await response.text();
    warnings.push(`${label}: HTTP ${response.status}`);
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return undefined;
}

/**
 * Asks the Warcraft Wiki which faction each quest belongs to. A quest the wiki
 * has no page for, or whose page does not say, is simply left out.
 */
export async function fetchQuestFactions(
  questNames: string[],
  fetchFn: FetchLike = fetch,
  warnings: string[] = [],
): Promise<Record<string, QuestFaction>> {
  const names = [...new Set(questNames)].filter(isAskable).sort();
  const factions: Record<string, QuestFaction> = {};
  for (let start = 0; start < names.length; start += QUESTS_PER_REQUEST) {
    const batch = names.slice(start, start + QUESTS_PER_REQUEST);
    const label = `Warcraft Wiki quests ${start + 1}-${start + batch.length}`;
    const body = await download(wikiQuestsUrl(batch.flatMap(questTitles)), label, fetchFn, warnings);
    if (body === undefined) continue;
    try {
      const query = (JSON.parse(body) as { query?: WikiQuery }).query;
      if (query) Object.assign(factions, readQuestFactions(batch, query));
      else warnings.push(`${label}: no pages in the response`);
    } catch {
      warnings.push(`${label}: response was not JSON`);
    }
  }
  return factions;
}

/**
 * Downloads the unlock-level pages for each profession, and looks up the
 * faction of every quest they name. A page that cannot be fetched is skipped
 * and reported; recipes it would have covered simply stay unconfirmed until
 * the next sync.
 */
export async function fetchUnlockPages(
  professions: GameProfession[],
  fetchFn: FetchLike = fetch,
): Promise<{
  pages: Record<string, UnlockPages>;
  questFactions: Record<string, QuestFaction>;
  warnings: string[];
}> {
  const pages: Record<string, UnlockPages> = {};
  const warnings: string[] = [];
  for (const { slug } of professions) {
    const entry: UnlockPages = {};
    if (WOWFOREVER_RECIPE_PAGES.has(slug)) {
      const html = await download(wowForeverUrl(slug), `wowforever.be ${slug}`, fetchFn, warnings);
      if (html !== undefined) entry.wowForever = html;
    }

    const wikiTitle = WIKI_RECIPE_PAGES[slug];
    if (wikiTitle) {
      const body = await download(wikiUrl(wikiTitle), `Warcraft Wiki ${slug}`, fetchFn, warnings);
      if (body !== undefined) {
        try {
          const wikitext = (JSON.parse(body) as { parse?: { wikitext?: string } }).parse?.wikitext;
          if (typeof wikitext === "string") entry.wiki = wikitext;
          else warnings.push(`Warcraft Wiki ${slug}: no page text in the response`);
        } catch {
          warnings.push(`Warcraft Wiki ${slug}: response was not JSON`);
        }
      }
    }
    pages[slug] = entry;
  }

  const questNames = Object.values(pages).flatMap((entry) =>
    entry.wowForever ? parseWowForeverRecipes(entry.wowForever).flatMap((row) => row.questNames) : [],
  );
  const questFactions = await fetchQuestFactions(questNames, fetchFn, warnings);
  return { pages, questFactions, warnings };
}
