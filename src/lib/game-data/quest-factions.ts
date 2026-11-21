/**
 * Some recipes are taught by plans that only one faction's quest hands out.
 * The game's own tables do not say which faction a quest belongs to, so that
 * comes from the quest's page on the Warcraft Wiki. A recipe is only marked
 * when every quest named for it is known and belongs to the same faction.
 */

export type Faction = "horde" | "alliance";
/** What a quest page says: one faction, or open to both. */
export type QuestFaction = Faction | "neutral";

/** How many quest names go into one request to the wiki (two titles each, 50 titles at most). */
export const QUESTS_PER_REQUEST = 25;

/** A quest that shares its name with an item lives at "Name (quest)", so both are asked for. */
export function questTitles(name: string): [string, string] {
  return [`${name} (quest)`, name];
}

/** Names the wiki cannot be asked about in a list of titles. */
export function isAskable(name: string): boolean {
  return name.trim() !== "" && !/[|#<>[\]{}]/.test(name);
}

/**
 * Reads the faction from the infobox at the top of a quest page. Null when the
 * page is not a quest page, or does not say.
 */
export function parseQuestFaction(wikitext: string): QuestFaction | null {
  const box = wikitext.match(/\{\{\s*questbox\b([\s\S]*)/i)?.[1];
  if (box === undefined) return null;
  const value = box.match(/\|\s*faction\s*=\s*([^\n|}]*)/i)?.[1].trim().toLowerCase();
  if (value === "horde" || value === "alliance" || value === "neutral") return value;
  if (value === "both") return "neutral";
  return null;
}

interface WikiPage {
  title: string;
  missing?: boolean;
  revisions?: { slots?: { main?: { content?: string } } }[];
}

export interface WikiQuery {
  normalized?: { from: string; to: string }[];
  redirects?: { from: string; to: string }[];
  pages?: WikiPage[];
}

/** Picks out, for each quest name asked about, the faction its page states. */
export function readQuestFactions(names: string[], query: WikiQuery): Record<string, QuestFaction> {
  const movedTo = new Map<string, string>();
  for (const { from, to } of [...(query.normalized ?? []), ...(query.redirects ?? [])]) movedTo.set(from, to);
  const finalTitle = (title: string) => {
    const seen = new Set<string>();
    let current = title;
    while (movedTo.has(current) && !seen.has(current)) {
      seen.add(current);
      current = movedTo.get(current)!;
    }
    return current;
  };

  const text = new Map<string, string>();
  for (const page of query.pages ?? []) {
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (!page.missing && typeof content === "string") text.set(page.title, content);
  }

  const factions: Record<string, QuestFaction> = {};
  for (const name of names) {
    for (const title of questTitles(name)) {
      const content = text.get(finalTitle(title));
      const faction = content === undefined ? null : parseQuestFaction(content);
      if (faction !== null) {
        factions[name] = faction;
        break;
      }
    }
  }
  return factions;
}

/**
 * The faction a recipe's quests are limited to, or null when they are open to
 * both, or when any of them is not known for certain.
 */
export function questFactionOf(
  questNames: string[],
  factions: Record<string, QuestFaction>,
): Faction | null {
  if (questNames.length === 0) return null;
  const first = factions[questNames[0]];
  if (first !== "horde" && first !== "alliance") return null;
  return questNames.every((name) => factions[name] === first) ? first : null;
}
