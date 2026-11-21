import { createHash } from "node:crypto";
import type { Dataset, DatasetRecipe } from "./dataset";
import type { GameItem, GameProfession } from "./types";

/**
 * The game-data sync: compare a freshly built dataset with what the database
 * holds and write only the differences. It runs from the daily schedule, from
 * the "Check for game updates" button, and from the command line.
 */

export type SyncTrigger = "cron" | "manual" | "cli";

/** Rows use the database column names so the SQL side can store them directly. */
export type DbRow = Record<string, unknown> & { id: number };

export interface SyncBatch {
  professions?: DbRow[];
  items?: DbRow[];
  recipes?: DbRow[];
}

export interface StoreState {
  items: Record<string, string>;
  recipes: Record<string, string>;
  professions: number[];
}

export interface SyncStats {
  build: string | null;
  itemsTotal: number;
  recipesTotal: number;
  itemsWritten: number;
  recipesWritten: number;
  newRecipes: number;
  removedRecipes: number;
}

export interface SyncFinish {
  status: "ok" | "failed";
  build: string | null;
  stats: SyncStats;
  warnings: string[];
  error: string | null;
  /** Every recipe id in the fresh data; null when the run failed. */
  presentRecipeIds: number[] | null;
}

/** Where game data is kept. Implemented by the database and by a test double. */
export interface GameDataStore {
  start(trigger: SyncTrigger): Promise<number>;
  state(): Promise<StoreState>;
  apply(runId: number, batch: SyncBatch): Promise<{ items: number; recipes: number; newRecipes: number }>;
  /** Closes the run and returns how many recipes were retired. */
  finish(runId: number, finish: SyncFinish): Promise<number>;
}

export interface SyncResult {
  runId: number;
  status: "ok" | "failed";
  stats: SyncStats;
  warnings: string[];
  error: string | null;
}

export interface SyncOptions {
  store: GameDataStore;
  trigger: SyncTrigger;
  load: () => Promise<{ dataset: Dataset; warnings: string[] }>;
  batchSize?: number;
}

/**
 * If a download comes back with far fewer recipes than the database has, the
 * source is broken; retiring everything would be worse than skipping a day.
 */
const MIN_SURVIVING_FRACTION = 0.5;

function withHash(row: DbRow): DbRow {
  const content_hash = createHash("sha1").update(JSON.stringify(row)).digest("hex");
  return { ...row, content_hash };
}

export function professionRow(profession: GameProfession): DbRow {
  return {
    id: profession.id,
    slug: profession.slug,
    name: profession.name,
    icon_file_id: profession.iconFileId,
    child_skill_line_ids: profession.childSkillLineIds,
  };
}

export function itemRow(item: GameItem): DbRow {
  return withHash({
    id: item.id,
    name: item.name,
    quality: item.quality,
    icon_file_id: item.iconFileId,
    class_id: item.classId,
    subclass_id: item.subclassId,
    inventory_type: item.inventoryType,
    item_level: item.itemLevel,
    required_level: item.requiredLevel,
    bonding: item.bonding,
    sell_price: item.sellPrice,
    slot_name: item.slotName,
    type_name: item.typeName,
    armor: item.armor,
    damage: item.damage,
    stats: item.stats,
    tooltip: item.tooltip,
    tooltip_complete: item.tooltipComplete,
  });
}

export function recipeRow(recipe: DatasetRecipe): DbRow {
  return withHash({
    id: recipe.id,
    profession_id: recipe.professionId,
    name: recipe.name,
    icon_file_id: recipe.iconFileId,
    crafted_item_id: recipe.craftedItemId,
    crafted_count: recipe.craftedCount,
    effect_text: recipe.effectText,
    skill_yellow: recipe.skillYellow,
    skill_green: recipe.skillGreen,
    skill_grey: recipe.skillGrey,
    recipe_item_id: recipe.recipeItemId,
    learn_skill: recipe.unlock.learnSkill,
    learn_skill_status: recipe.unlock.status,
    learn_skill_candidates: recipe.unlock.candidates,
    acquisition: recipe.unlock.acquisition,
    acquisition_text: recipe.unlock.acquisitionText,
    quest_faction: recipe.unlock.questFaction,
    training_cost: recipe.unlock.trainingCost,
    category: recipe.category,
    category_order: recipe.categoryOrder,
    status: recipe.status,
    reagents: recipe.reagents.map((reagent) => [reagent.itemId, reagent.quantity]),
  });
}

function changedRows(rows: DbRow[], known: Record<string, string>): DbRow[] {
  return rows.filter((row) => known[String(row.id)] !== row.content_hash);
}

function chunk(rows: DbRow[], size: number, key: "items" | "recipes"): SyncBatch[] {
  const batches: SyncBatch[] = [];
  for (let i = 0; i < rows.length; i += size) batches.push({ [key]: rows.slice(i, i + size) });
  return batches;
}

function emptyStats(): SyncStats {
  return {
    build: null,
    itemsTotal: 0,
    recipesTotal: 0,
    itemsWritten: 0,
    recipesWritten: 0,
    newRecipes: 0,
    removedRecipes: 0,
  };
}

export async function runSync({ store, trigger, load, batchSize = 400 }: SyncOptions): Promise<SyncResult> {
  const runId = await store.start(trigger);
  const stats = emptyStats();
  let warnings: string[] = [];

  try {
    const loaded = await load();
    const dataset = loaded.dataset;
    warnings = loaded.warnings;
    stats.build = dataset.build;
    stats.itemsTotal = dataset.items.length;
    stats.recipesTotal = dataset.recipes.length;

    const state = await store.state();
    const knownRecipes = Object.keys(state.recipes).length;
    if (dataset.recipes.length < knownRecipes * MIN_SURVIVING_FRACTION) {
      throw new Error(
        `Recipes dropped from ${knownRecipes} to ${dataset.recipes.length}; the download looks broken, so nothing was changed`,
      );
    }

    const items = changedRows(dataset.items.map(itemRow), state.items);
    const recipes = changedRows(dataset.recipes.map(recipeRow), state.recipes);
    const knownProfessions = new Set(state.professions);
    const professionsChanged =
      recipes.length > 0 || dataset.professions.some((p) => !knownProfessions.has(p.id));

    // Professions first (recipes reference them), then items, then recipes.
    const batches: SyncBatch[] = [
      ...(professionsChanged ? [{ professions: dataset.professions.map(professionRow) }] : []),
      ...chunk(items, batchSize, "items"),
      ...chunk(recipes, batchSize, "recipes"),
    ];
    for (const batch of batches) {
      const applied = await store.apply(runId, batch);
      stats.itemsWritten += applied.items;
      stats.recipesWritten += applied.recipes;
      stats.newRecipes += applied.newRecipes;
    }

    stats.removedRecipes = await store.finish(runId, {
      status: "ok",
      build: dataset.build,
      stats,
      warnings,
      error: null,
      presentRecipeIds: dataset.recipes.map((recipe) => recipe.id),
    });
    return { runId, status: "ok", stats, warnings, error: null };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await store.finish(runId, {
      status: "failed",
      build: stats.build,
      stats,
      warnings,
      error,
      presentRecipeIds: null,
    });
    return { runId, status: "failed", stats, warnings, error };
  }
}
