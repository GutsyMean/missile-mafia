import type { CraftablesDoc, CrafterView, ProfessionView } from "@/lib/craftables/types";

/** One profession as the guild has it: what can be made now, and who to ask, most skilled first. */
export interface ProfessionCoverage {
  profession: ProfessionView;
  /** Recipes some listed crafter has learned. */
  recipes: number;
  crafters: { crafter: CrafterView; skill: number }[];
}

/** Every profession somebody in the guild practises, by name. */
export function professionCoverage(doc: CraftablesDoc): ProfessionCoverage[] {
  const recipes = new Map<number, number>();
  for (const recipe of doc.recipes) {
    if (recipe.crafterIds.length > 0) recipes.set(recipe.professionId, (recipes.get(recipe.professionId) ?? 0) + 1);
  }
  return doc.professions
    .map((profession) => ({
      profession,
      recipes: recipes.get(profession.id) ?? 0,
      crafters: doc.crafters
        .map((crafter) => ({ crafter, skill: crafter.skills[String(profession.id)] ?? 0 }))
        .filter((entry) => entry.skill > 0)
        .sort((a, b) => b.skill - a.skill || a.crafter.characterName.localeCompare(b.crafter.characterName)),
    }))
    .filter((coverage) => coverage.crafters.length > 0 || coverage.recipes > 0)
    .sort((a, b) => a.profession.name.localeCompare(b.profession.name));
}

/** One crafter as the roster shows them. */
export interface RosterRow {
  crafter: CrafterView;
  /** Recipes on their list. */
  recipes: number;
  /** Their skill in each profession of the roster's columns, in that order. Zero where they have none. */
  skills: number[];
}

export interface Roster {
  /** The professions anybody has, by name: the roster's columns. */
  professions: ProfessionView[];
  rows: RosterRow[];
  /** The highest skill anybody has in each profession, in column order. */
  best: number[];
}

/** Who is in the guild's crafting roster and what each of them does. */
export function roster(doc: CraftablesDoc): Roster {
  const professions = doc.professions
    .filter((profession) => doc.crafters.some((crafter) => (crafter.skills[String(profession.id)] ?? 0) > 0))
    .sort((a, b) => a.name.localeCompare(b.name));
  const recipes = new Map<string, number>();
  for (const recipe of doc.recipes) {
    for (const id of recipe.crafterIds) recipes.set(id, (recipes.get(id) ?? 0) + 1);
  }
  const rows = doc.crafters
    .map((crafter) => ({
      crafter,
      recipes: recipes.get(crafter.id) ?? 0,
      skills: professions.map((profession) => crafter.skills[String(profession.id)] ?? 0),
    }))
    .sort((a, b) => a.crafter.characterName.localeCompare(b.crafter.characterName));
  return {
    professions,
    rows,
    best: professions.map((_, column) => Math.max(0, ...rows.map((row) => row.skills[column]))),
  };
}

/** How many recipes the guild can make now, counting each once. */
export function craftableNow(doc: CraftablesDoc): number {
  return doc.recipes.filter((recipe) => recipe.crafterIds.length > 0).length;
}
