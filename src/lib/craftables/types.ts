import type { ItemStat, TooltipLine, WeaponDamage } from "@/lib/game-data/types";

/** The document `guild_craftables()` returns: everything the public window shows. */
export interface CraftablesDoc {
  build: string | null;
  syncedAt: string | null;
  professions: ProfessionView[];
  crafters: CrafterView[];
  recipes: RecipeView[];
  items: Record<string, ItemView>;
}

export interface ProfessionView {
  id: number;
  slug: string;
  name: string;
  iconFileId: number;
}

export interface CrafterView {
  id: string;
  slug: string;
  characterName: string;
  realm: string | null;
  faction: string | null;
  class: string | null;
  level: number | null;
  note: string | null;
  /** Profession id → skill. */
  skills: Record<string, number>;
}

export interface RecipeView {
  id: number;
  professionId: number;
  name: string;
  iconFileId: number;
  craftedItemId: number | null;
  craftedCount: number;
  effectText: string | null;
  category: string;
  categoryOrder: number;
  /** [item id, quantity] in the game's order. */
  reagents: [number, number][];
  crafterIds: string[];
}

export interface ItemView {
  id: number;
  name: string;
  quality: number;
  iconFileId: number;
  classId: number;
  subclassId: number;
  inventoryType: number;
  itemLevel: number;
  requiredLevel: number;
  bonding: number;
  tradeable: boolean;
  sellPrice: number;
  slotName: string | null;
  typeName: string | null;
  armor: number | null;
  damage: WeaponDamage | null;
  stats: ItemStat[];
  tooltip: TooltipLine[];
  tooltipComplete: boolean;
}

/** One row of the list: a recipe joined with what it makes and consumes. */
export interface Entry {
  recipe: RecipeView;
  item: ItemView | null;
  reagents: { item: ItemView | null; itemId: number; quantity: number }[];
  crafters: CrafterView[];
}

export type SortMode = "category" | "name" | "level";

export interface Filters {
  search: string;
  slot: string;
  type: string;
  stat: string;
  minLevel: number | null;
  maxLevel: number | null;
  tradeableOnly: boolean;
  sort: SortMode;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  slot: "",
  type: "",
  stat: "",
  minLevel: null,
  maxLevel: null,
  tradeableOnly: false,
  sort: "category",
};
