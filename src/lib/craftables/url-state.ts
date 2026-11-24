import { DEFAULT_FILTERS, type Filters, type SortMode } from "./types";

/** Who gear is being chosen for. An empty class means nobody: the ordinary list. */
export interface GearChoice {
  classSlug: string;
  /** The talent tree. Empty for the class's first. */
  specSlug: string;
  /** The character's level. Null for the highest. */
  level: number | null;
  /** Compare with gear that is not crafted too: dungeon drops and quest rewards. */
  everySource: boolean;
}

export const NO_GEAR: GearChoice = { classSlug: "", specSlug: "", level: null, everySource: false };

/** What a link to the crafting window can carry: the filters, the open recipe, and who gear is chosen for. */
export interface ViewState {
  filters: Filters;
  /** The open recipe. Minus an item's id for a piece of gear that is not crafted. */
  recipeId: number | null;
  gear: GearChoice;
}

const SORTS: SortMode[] = ["category", "name", "level"];

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number > 0 ? number : null;
}

const negated = (value: number | null) => (value === null ? null : -value);

export function parseViewState(params: URLSearchParams): ViewState {
  const sort = params.get("sort") as SortMode | null;
  return {
    filters: {
      crafter: params.get("crafter") ?? "",
      profession: params.get("prof") ?? "",
      search: params.get("q") ?? "",
      slot: params.get("slot") ?? "",
      type: params.get("type") ?? "",
      stat: params.get("stat") ?? "",
      minLevel: positiveInteger(params.get("min")),
      maxLevel: positiveInteger(params.get("max")),
      tradeableOnly: params.get("tradeable") === "1",
      availableOnly: params.get("available") === "1",
      sort: sort && SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    },
    recipeId: positiveInteger(params.get("recipe")) ?? negated(positiveInteger(params.get("item"))),
    gear: {
      classSlug: params.get("class") ?? "",
      specSlug: params.get("spec") ?? "",
      level: positiveInteger(params.get("lvl")),
      everySource: params.get("all") === "1",
    },
  };
}

export function serializeViewState({ filters, recipeId, gear }: ViewState): string {
  const params = new URLSearchParams();
  if (filters.crafter) params.set("crafter", filters.crafter);
  if (filters.profession) params.set("prof", filters.profession);
  if (filters.search) params.set("q", filters.search);
  if (filters.slot) params.set("slot", filters.slot);
  if (filters.type) params.set("type", filters.type);
  if (filters.stat) params.set("stat", filters.stat);
  if (filters.minLevel !== null) params.set("min", String(filters.minLevel));
  if (filters.maxLevel !== null) params.set("max", String(filters.maxLevel));
  if (filters.tradeableOnly) params.set("tradeable", "1");
  if (filters.availableOnly) params.set("available", "1");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (recipeId !== null && recipeId > 0) params.set("recipe", String(recipeId));
  if (gear.classSlug) {
    params.set("class", gear.classSlug);
    if (gear.specSlug) params.set("spec", gear.specSlug);
    if (gear.level !== null) params.set("lvl", String(gear.level));
    if (gear.everySource) params.set("all", "1");
    // Gear that is not crafted only shows while every source is being compared.
    if (gear.everySource && recipeId !== null && recipeId < 0) params.set("item", String(-recipeId));
  }
  return params.toString();
}
