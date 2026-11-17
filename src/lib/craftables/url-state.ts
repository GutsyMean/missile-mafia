import { DEFAULT_FILTERS, type Filters, type SortMode } from "./types";

/** What a link to the crafting window can carry: the filters and the open recipe. */
export interface ViewState {
  filters: Filters;
  recipeId: number | null;
}

const SORTS: SortMode[] = ["category", "name", "level"];

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number > 0 ? number : null;
}

export function parseViewState(params: URLSearchParams): ViewState {
  const sort = params.get("sort") as SortMode | null;
  return {
    filters: {
      search: params.get("q") ?? "",
      slot: params.get("slot") ?? "",
      type: params.get("type") ?? "",
      stat: params.get("stat") ?? "",
      minLevel: positiveInteger(params.get("min")),
      maxLevel: positiveInteger(params.get("max")),
      tradeableOnly: params.get("tradeable") === "1",
      sort: sort && SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    },
    recipeId: positiveInteger(params.get("recipe")),
  };
}

export function serializeViewState({ filters, recipeId }: ViewState): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.slot) params.set("slot", filters.slot);
  if (filters.type) params.set("type", filters.type);
  if (filters.stat) params.set("stat", filters.stat);
  if (filters.minLevel !== null) params.set("min", String(filters.minLevel));
  if (filters.maxLevel !== null) params.set("max", String(filters.maxLevel));
  if (filters.tradeableOnly) params.set("tradeable", "1");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (recipeId !== null) params.set("recipe", String(recipeId));
  return params.toString();
}
