import { buildClasses } from "./classes";
import { buildDataset, type Dataset } from "./dataset";
import { buildProfessions, buildRecipes } from "./recipes";
import { fetchGearSources } from "./gear-sources";
import { fetchUnlockPages } from "./sources";
import { fetchAllTables, resolveLatestBuild, type FetchLike } from "./wago";

/**
 * Downloads the current game tables and unlock-level pages and builds the
 * dataset from them. This is what every sync runs first.
 */
export async function loadLiveDataset(
  fetchFn: FetchLike = fetch,
): Promise<{ dataset: Dataset; warnings: string[] }> {
  const build = await resolveLatestBuild(fetchFn);
  const tables = await fetchAllTables(build, fetchFn);
  const professions = buildProfessions(tables, buildRecipes(tables));
  const { pages, questFactions, warnings } = await fetchUnlockPages(professions, fetchFn);
  const gear = await fetchGearSources(fetchFn, buildClasses(tables));
  return {
    dataset: buildDataset(tables, build, pages, questFactions, gear.sources),
    warnings: [...warnings, ...gear.warnings],
  };
}
