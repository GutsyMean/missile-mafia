import { buildClasses } from "./classes";
import { ARMOR_SUBCLASS_SHIELD, ITEM_CLASS_ARMOR, ITEM_CLASS_WEAPON } from "./constants";
import { buildItem, indexGameData, type GameDataIndex } from "./items";
import type { QuestFaction } from "./quest-factions";
import { buildProfessions, buildRecipes } from "./recipes";
import { requireTable, type Tables } from "./tables";
import type { GameClass, GameItem, GameProfession, GameRecipe } from "./types";
import {
  parseWikiRecipeTable,
  parseWowForeverRecipes,
  resolveUnlockLevels,
  type UnlockInfo,
} from "./unlock-levels";

export interface DatasetRecipe extends GameRecipe {
  unlock: UnlockInfo;
  /** Heading the recipe is listed under, e.g. "Mail Armor". */
  category: string;
  categoryOrder: number;
}

export interface Dataset {
  build: string;
  professions: GameProfession[];
  /** The playable classes, for choosing gear by class, talent tree and level. */
  classes: GameClass[];
  items: GameItem[];
  recipes: DatasetRecipe[];
}

/** Raw unlock-level pages for one profession, as downloaded. */
export interface UnlockPages {
  wowForever?: string;
  wiki?: string;
}

function categoryOf(
  index: GameDataIndex,
  classNames: Map<number, string>,
  recipe: GameRecipe,
  item: GameItem | undefined,
): { category: string; categoryOrder: number } {
  if (!item) {
    return recipe.craftedItemId === null
      ? { category: "Enchantments", categoryOrder: 900 }
      : { category: "Other", categoryOrder: 990 };
  }
  if (item.classId === ITEM_CLASS_ARMOR) {
    if (item.subclassId === ARMOR_SUBCLASS_SHIELD) return { category: "Shields", categoryOrder: 150 };
    if (item.typeName) {
      return { category: `${item.typeName} Armor`, categoryOrder: 100 + item.subclassId };
    }
    return { category: "Armor", categoryOrder: 140 };
  }
  if (item.classId === ITEM_CLASS_WEAPON) {
    const subclass = index.subclass.get(`${item.classId}:${item.subclassId}`);
    const name = subclass?.VerboseName_lang || subclass?.DisplayName_lang || "Weapons";
    return { category: name, categoryOrder: 200 + item.subclassId };
  }
  return {
    category: classNames.get(item.classId) ?? "Other",
    categoryOrder: 500 + item.classId,
  };
}

/** Turns the raw game tables and unlock-level pages into everything the site stores. */
export function buildDataset(
  tables: Tables,
  build: string,
  unlockPagesBySlug: Record<string, UnlockPages> = {},
  questFactions: Record<string, QuestFaction> = {},
): Dataset {
  const index = indexGameData(tables);
  const recipes = buildRecipes(tables, index);
  const professions = buildProfessions(tables, recipes);

  const items = new Map<number, GameItem>();
  const include = (itemId: number | null) => {
    if (itemId === null || items.has(itemId)) return;
    const item = buildItem(index, itemId);
    if (item) items.set(itemId, item);
  };
  for (const recipe of recipes) {
    include(recipe.craftedItemId);
    include(recipe.recipeItemId);
    for (const reagent of recipe.reagents) include(reagent.itemId);
  }

  const itemNames = new Map<number, string>();
  for (const item of items.values()) itemNames.set(item.id, item.name);
  const classNames = new Map<number, string>();
  for (const row of requireTable(tables, "ItemClass")) {
    classNames.set(Number(row.ClassID), row.ClassName_lang);
  }

  const datasetRecipes: DatasetRecipe[] = [];
  for (const profession of professions) {
    const own = recipes.filter((r) => r.professionId === profession.id);
    const pages = unlockPagesBySlug[profession.slug] ?? {};
    const unlocks = resolveUnlockLevels(
      own,
      itemNames,
      pages.wowForever ? parseWowForeverRecipes(pages.wowForever) : [],
      pages.wiki ? parseWikiRecipeTable(pages.wiki) : [],
      questFactions,
    );
    for (const recipe of own) {
      const item = recipe.craftedItemId !== null ? items.get(recipe.craftedItemId) : undefined;
      datasetRecipes.push({
        ...recipe,
        unlock: unlocks.get(recipe.id)!,
        ...categoryOf(index, classNames, recipe, item),
      });
    }
  }

  return {
    build,
    professions,
    classes: buildClasses(tables),
    items: [...items.values()],
    recipes: datasetRecipes,
  };
}
