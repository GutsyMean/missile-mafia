import type { CraftablesDoc, Entry, Filters, SortMode, UnlearnedDoc } from "./types";

/** Adds lazily loaded "not yet learned" recipes to the main document. */
export function mergeUnlearned(doc: CraftablesDoc, extras: UnlearnedDoc[]): CraftablesDoc {
  if (extras.length === 0) return doc;
  const seen = new Set(doc.recipes.map((recipe) => recipe.id));
  const recipes = [...doc.recipes];
  const items = { ...doc.items };
  for (const extra of extras) {
    for (const recipe of extra.recipes) {
      if (seen.has(recipe.id)) continue;
      seen.add(recipe.id);
      recipes.push(recipe);
    }
    Object.assign(items, extra.items);
  }
  return { ...doc, recipes, items };
}

/**
 * Which professions' "not yet learned" recipes a view needs: the chosen
 * profession, the chosen crafter's professions, or all of them when looking
 * at everyone, so that a search there finds everything.
 */
export function unlearnedToLoad(doc: CraftablesDoc, filters: Filters): number[] {
  if (filters.availableOnly) return [];
  const withUnlearned = (doc.unlearned ?? []).map((entry) => entry.professionId);
  const profession = doc.professions.find((p) => p.slug === filters.profession);
  if (profession) return withUnlearned.filter((id) => id === profession.id);
  if (filters.crafter) {
    const crafter = doc.crafters.find((c) => c.slug === filters.crafter);
    if (!crafter) return [];
    return withUnlearned.filter((id) => (crafter.skills[String(id)] ?? 0) > 0);
  }
  return withUnlearned;
}

/**
 * What of that is worth sending with the page itself rather than fetching once
 * it is up: only the single profession of a guild that has just one. Several
 * professions' worth would weigh the page down for everyone.
 */
export function unlearnedWithPage(doc: CraftablesDoc): number[] {
  const withUnlearned = (doc.unlearned ?? []).map((entry) => entry.professionId);
  return withUnlearned.length === 1 ? withUnlearned : [];
}

/**
 * Joins every recipe with the item it makes, its reagents and who can craft it.
 * With a crafter, the list is theirs: only recipes of their professions, marked
 * available when they themselves have learned them.
 */
export function buildEntries(doc: CraftablesDoc, crafterId: string | null = null): Entry[] {
  const crafters = new Map(doc.crafters.map((crafter) => [crafter.id, crafter]));
  const professions = new Map(doc.professions.map((profession) => [profession.id, profession]));
  const itemOf = (id: number | null) => (id === null ? null : (doc.items[String(id)] ?? null));
  const entries: Entry[] = [];
  for (const recipe of doc.recipes) {
    const pendingIds = recipe.pendingCrafterIds ?? [];
    if (crafterId !== null && !recipe.crafterIds.includes(crafterId) && !pendingIds.includes(crafterId)) continue;
    const makers = recipe.crafterIds.flatMap((id) => crafters.get(id) ?? []);
    const profession = professions.get(recipe.professionId);
    const item = itemOf(recipe.craftedItemId);
    const reagents = recipe.reagents.map(([itemId, quantity]) => ({ item: itemOf(itemId), itemId, quantity }));
    entries.push({
      recipe,
      item,
      reagents,
      // Worked out once here, not on every keystroke: the list can run to a couple of thousand recipes.
      searchText: [recipe.name, item?.name, recipe.effectText, ...reagents.map((reagent) => reagent.item?.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      crafters: makers,
      pending: (crafterId !== null ? pendingIds.filter((id) => id === crafterId) : pendingIds).flatMap(
        (id) => crafters.get(id) ?? [],
      ),
      available: crafterId !== null ? recipe.crafterIds.includes(crafterId) : makers.length > 0,
      professionName: profession?.name ?? null,
      professionSlug: profession?.slug ?? null,
    });
  }
  return entries;
}

function matches(entry: Entry, filters: Filters, words: string[]): boolean {
  const { item } = entry;
  if (words.length > 0) {
    if (!words.every((word) => entry.searchText.includes(word))) return false;
  }
  if (filters.slot && item?.slotName !== filters.slot) return false;
  if (filters.type && item?.typeName !== filters.type) return false;
  if (filters.stat && !item?.stats.some((stat) => stat.name === filters.stat)) return false;
  if (filters.minLevel !== null && (item?.requiredLevel ?? 0) < filters.minLevel) return false;
  if (filters.maxLevel !== null && (item?.requiredLevel ?? 0) > filters.maxLevel) return false;
  // A recipe that makes no item (an enchant) is applied for the customer, so it counts as tradeable.
  if (filters.tradeableOnly && item && !item.tradeable) return false;
  if (filters.availableOnly && !entry.available) return false;
  return true;
}

const level = (entry: Entry) => entry.item?.requiredLevel ?? 0;
const byName = (a: Entry, b: Entry) => a.recipe.name.localeCompare(b.recipe.name);
/** Recipes with no confirmed skill sort after the ones that have one. */
const skillNeeded = (entry: Entry) => entry.recipe.learnSkill ?? Number.MAX_SAFE_INTEGER;

const COMPARATORS: Record<SortMode, (a: Entry, b: Entry) => number> = {
  // Within a type: what can be made now first, then what is still to be learned, soonest first.
  category: (a, b) =>
    a.recipe.categoryOrder - b.recipe.categoryOrder ||
    a.recipe.category.localeCompare(b.recipe.category) ||
    Number(b.available) - Number(a.available) ||
    (a.available ? 0 : skillNeeded(a) - skillNeeded(b)) ||
    level(a) - level(b) ||
    byName(a, b),
  name: byName,
  level: (a, b) => level(b) - level(a) || byName(a, b),
};

/**
 * A link can name a crafter who has left or a profession the guild no longer
 * has. Those two choices then fall back to "everyone" and "all professions",
 * which is also what the pickers show. Everything else is taken as given.
 */
export function resolveFilters(doc: CraftablesDoc, filters: Filters): Filters {
  const crafter = doc.crafters.some((c) => c.slug === filters.crafter) ? filters.crafter : "";
  const profession = doc.professions.some((p) => p.slug === filters.profession) ? filters.profession : "";
  return crafter === filters.crafter && profession === filters.profession ? filters : { ...filters, crafter, profession };
}

/** Every filter narrows the list. One that matches nothing leaves nothing: it never falls back to showing more. */
export function applyFilters(entries: Entry[], filters: Filters): Entry[] {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .filter(
      (entry) =>
        (filters.profession === "" || entry.professionSlug === filters.profession) && matches(entry, filters, words),
    )
    .sort(COMPARATORS[filters.sort]);
}

export interface EntryGroup {
  /** Null when the list is not grouped. */
  category: string | null;
  entries: Entry[];
}

export function groupEntries(sorted: Entry[], sort: SortMode): EntryGroup[] {
  if (sort !== "category") return [{ category: null, entries: sorted }];
  const groups: EntryGroup[] = [];
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.category === entry.recipe.category) last.entries.push(entry);
    else groups.push({ category: entry.recipe.category, entries: [entry] });
  }
  return groups;
}

export interface FilterOptions {
  slots: string[];
  types: string[];
  stats: string[];
}

/** The choices worth offering: only values some listed item actually has. */
export function filterOptions(entries: Entry[]): FilterOptions {
  const slots = new Set<string>();
  const types = new Set<string>();
  const stats = new Set<string>();
  for (const { item } of entries) {
    if (!item) continue;
    if (item.slotName) slots.add(item.slotName);
    if (item.typeName) types.add(item.typeName);
    for (const stat of item.stats) stats.add(stat.name);
  }
  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));
  return { slots: sorted(slots), types: sorted(types), stats: sorted(stats) };
}
