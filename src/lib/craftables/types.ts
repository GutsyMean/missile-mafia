import type { ItemStat, TooltipLine, WeaponDamage } from "@/lib/game-data/types";

/** The document `guild_craftables()` returns: everything the public window shows. */
export interface CraftablesDoc {
  build: string | null;
  syncedAt: string | null;
  professions: ProfessionView[];
  crafters: CrafterView[];
  recipes: RecipeView[];
  items: Record<string, ItemView>;
  /**
   * Professions with recipes no listed crafter has learned yet. Those recipes are
   * not in this document; they are fetched per profession when a view needs them.
   */
  unlearned?: { professionId: number; count: number }[];
}

/** The recipes of one profession that nobody has learned yet, with the items they involve. */
export interface UnlearnedDoc {
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
  /** Listed crafters who have learned this recipe. Empty when nobody can make it yet. */
  crafterIds: string[];
  /** Listed crafters who have the profession but have not learned this recipe. */
  pendingCrafterIds?: string[];
  /** The profession skill needed to learn it. Null when no source has confirmed it. */
  learnSkill?: number | null;
  /** The skill at which crafting it gives fewer skill-ups (yellow, green) and none (grey). */
  skillYellow?: number;
  skillGreen?: number;
  skillGrey?: number;
  /** "trainer", "vendor", "drop", "quest", "starter", "unknown" or a combination. */
  acquisition?: string;
  /** Where it comes from, in full, e.g. "Trainer · 10s". */
  acquisitionText?: string | null;
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
  /** Everything a search looks through, in lower case: the names of the recipe, its item and its reagents. */
  searchText: string;
  /** Who can craft it now. */
  crafters: CrafterView[];
  /** Who has the profession but has not learned it yet. */
  pending: CrafterView[];
  /**
   * False when it cannot be made in this view: nobody has learned it, or the
   * crafter being looked at has not. Shown greyed out.
   */
  available: boolean;
  professionName: string | null;
  professionSlug: string | null;
}

export type SortMode = "category" | "name" | "level";

export interface Filters {
  /** The crafter being looked at, by slug. Empty for everyone. */
  crafter: string;
  /** The profession being looked at, by slug. Empty for all of them. */
  profession: string;
  search: string;
  slot: string;
  type: string;
  stat: string;
  minLevel: number | null;
  maxLevel: number | null;
  tradeableOnly: boolean;
  /** Hide recipes nobody has learned yet. */
  availableOnly: boolean;
  sort: SortMode;
}

export const DEFAULT_FILTERS: Filters = {
  crafter: "",
  profession: "",
  search: "",
  slot: "",
  type: "",
  stat: "",
  minLevel: null,
  maxLevel: null,
  tradeableOnly: false,
  availableOnly: false,
  sort: "category",
};
