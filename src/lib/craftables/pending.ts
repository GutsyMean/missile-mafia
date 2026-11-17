import type { Entry } from "./types";

/** Where a recipe comes from: the full description when there is one, else the kind of source. */
export function sourceLabel(recipe: { acquisition?: string; acquisitionText?: string | null }): string {
  if (recipe.acquisitionText) return recipe.acquisitionText;
  const acquisition = recipe.acquisition ?? "unknown";
  if (acquisition === "starter") return "Known from the start";
  if (acquisition === "unknown") return "Source not known yet";
  return acquisition.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The profession skill a recipe needs, e.g. "Blacksmithing 95". Null when it is not confirmed. */
export function skillLabel(entry: Entry): string | null {
  const skill = entry.recipe.learnSkill;
  if (skill === null || skill === undefined) return null;
  return `${entry.professionName ?? "Skill"} ${skill}`;
}
