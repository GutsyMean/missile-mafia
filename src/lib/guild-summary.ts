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

/** How many recipes the guild can make now, counting each once. */
export function craftableNow(doc: CraftablesDoc): number {
  return doc.recipes.filter((recipe) => recipe.crafterIds.length > 0).length;
}
