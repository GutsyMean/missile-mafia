import type { UnlockPages } from "./dataset";
import type { GameProfession } from "./types";
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
 * Downloads the unlock-level pages for each profession. A page that cannot be
 * fetched is skipped and reported; recipes it would have covered simply stay
 * unconfirmed until the next sync.
 */
export async function fetchUnlockPages(
  professions: GameProfession[],
  fetchFn: FetchLike = fetch,
): Promise<{ pages: Record<string, UnlockPages>; warnings: string[] }> {
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
  return { pages, warnings };
}
