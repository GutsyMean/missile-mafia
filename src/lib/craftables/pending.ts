import type { Entry, Faction } from "./types";

interface Sourced {
  acquisition?: string;
  acquisitionText?: string | null;
  questFaction?: Faction | null;
}

/** Where a recipe comes from: the full description when there is one, else the kind of source. */
export function sourceLabel(recipe: Sourced): string {
  if (recipe.acquisitionText) return recipe.acquisitionText;
  const acquisition = recipe.acquisition ?? "unknown";
  if (acquisition === "starter") return "Known from the start";
  if (acquisition === "unknown") return "Source not known yet";
  return acquisition.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The same, split into the kind of source ("Quest") and the rest ("Trampled Under Foot"). */
export function sourceParts(recipe: Sourced): { kind: string; detail: string | null } {
  const [kind, ...rest] = sourceLabel(recipe).split(" · ");
  return { kind, detail: rest.length > 0 ? rest.join(" · ") : null };
}

const FACTION_NAME: Record<Faction, string> = { horde: "Horde", alliance: "Alliance" };

export interface FactionNote {
  faction: Faction;
  /** True when the quest is the only way to get the recipe, so the other faction cannot learn it at all. */
  sole: boolean;
  text: string;
}

/** What to say about a recipe whose quest only one faction can do. Null when there is nothing to say. */
export function factionNote(recipe: Sourced): FactionNote | null {
  if (!recipe.questFaction) return null;
  const name = FACTION_NAME[recipe.questFaction];
  const ways = (recipe.acquisition ?? "quest").split(" ");
  const sole = ways.length === 1 && ways[0] === "quest";
  return { faction: recipe.questFaction, sole, text: sole ? `${name} only` : `${name}-only quest` };
}

/** The profession skill a recipe needs, e.g. "Blacksmithing 95". Null when it is not confirmed. */
export function skillLabel(entry: Entry): string | null {
  const skill = entry.recipe.learnSkill;
  if (skill === null || skill === undefined) return null;
  return `${entry.professionName ?? "Skill"} ${skill}`;
}
