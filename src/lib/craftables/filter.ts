import type { CraftablesDoc, Entry, Filters, SortMode } from "./types";

/** Joins every recipe with the item it makes, its reagents and who can craft it. */
export function buildEntries(doc: CraftablesDoc): Entry[] {
  const crafters = new Map(doc.crafters.map((crafter) => [crafter.id, crafter]));
  const professions = new Map(doc.professions.map((profession) => [profession.id, profession.name]));
  const itemOf = (id: number | null) => (id === null ? null : (doc.items[String(id)] ?? null));
  return doc.recipes.map((recipe) => {
    const makers = recipe.crafterIds.flatMap((id) => crafters.get(id) ?? []);
    return {
      recipe,
      item: itemOf(recipe.craftedItemId),
      reagents: recipe.reagents.map(([itemId, quantity]) => ({ item: itemOf(itemId), itemId, quantity })),
      crafters: makers,
      pending: (recipe.pendingCrafterIds ?? []).flatMap((id) => crafters.get(id) ?? []),
      available: makers.length > 0,
      professionName: professions.get(recipe.professionId) ?? null,
    };
  });
}

function searchText(entry: Entry): string {
  return [entry.recipe.name, entry.item?.name, entry.recipe.effectText, ...entry.reagents.map((r) => r.item?.name)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matches(entry: Entry, filters: Filters, words: string[]): boolean {
  const { item } = entry;
  if (words.length > 0) {
    const text = searchText(entry);
    if (!words.every((word) => text.includes(word))) return false;
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

export function applyFilters(entries: Entry[], filters: Filters): Entry[] {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => matches(entry, filters, words)).sort(COMPARATORS[filters.sort]);
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
