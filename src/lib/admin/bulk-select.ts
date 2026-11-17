import type { CatalogRecipe } from "./types";

export interface BulkSelectPlan {
  /** Trainer recipes with a confirmed unlock level within the skill. */
  sure: number[];
  /** Trainer recipes that may be learnable, but whose level is not confirmed. */
  check: number[];
}

/**
 * How far below the point where a recipe turns yellow a trainer may teach it.
 * Used only to decide which unconfirmed recipes are worth asking about.
 */
const LEARN_MARGIN = 30;

function taughtWithoutAnItem(recipe: CatalogRecipe): boolean {
  const ways = recipe.acquisition.split(" ");
  return ways.includes("trainer") || ways.includes("starter");
}

/**
 * Works out "every trainer recipe up to skill N". Confirmed levels are used as
 * they are. Anything not confirmed is never ticked on a guess: it goes into
 * `check` for the crafter to decide.
 */
export function planBulkSelect(recipes: CatalogRecipe[], professionId: number, skill: number): BulkSelectPlan {
  const sure: number[] = [];
  const check: number[] = [];

  for (const recipe of recipes) {
    if (recipe.professionId !== professionId || !taughtWithoutAnItem(recipe)) continue;

    switch (recipe.learnStatus) {
      case "confirmed":
      case "owner":
        if (recipe.learnSkill !== null && recipe.learnSkill <= skill) sure.push(recipe.id);
        break;
      case "single_source":
        if (recipe.learnSkill !== null && recipe.learnSkill <= skill) check.push(recipe.id);
        break;
      case "disputed": {
        const candidates = Object.values(recipe.learnCandidates).filter(
          (value): value is number => typeof value === "number",
        );
        if (candidates.some((value) => value <= skill)) check.push(recipe.id);
        break;
      }
      case "unconfirmed":
        if (recipe.skillYellow - LEARN_MARGIN <= skill) check.push(recipe.id);
        break;
    }
  }
  return { sure, check };
}
