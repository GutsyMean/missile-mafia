export type TooltipColor = "quality" | "white" | "green" | "yellow" | "red" | "grey";

/** One line of an item tooltip, in display order. `right` is the right-aligned half. */
export interface TooltipLine {
  text: string;
  right?: string;
  color: TooltipColor;
}

export interface ItemStat {
  /** The game's stat id (4 = Strength, 7 = Stamina, ...). */
  stat: number;
  /** Short display name used for filtering, e.g. "Strength". */
  name: string;
  value: number;
}

export interface WeaponDamage {
  min: number;
  max: number;
  speed: number;
  dps: number;
}

export interface GameItem {
  id: number;
  name: string;
  quality: number;
  iconFileId: number;
  classId: number;
  subclassId: number;
  inventoryType: number;
  itemLevel: number;
  requiredLevel: number;
  /** 0 none, 1 pickup, 2 equip, 3 use, 4 quest. */
  bonding: number;
  /** False when the item binds to whoever makes or loots it. */
  tradeable: boolean;
  sellPrice: number;
  slotName: string | null;
  typeName: string | null;
  armor: number | null;
  damage: WeaponDamage | null;
  stats: ItemStat[];
  requiredSkill: { skillLineId: number; rank: number } | null;
  tooltip: TooltipLine[];
  /** False when part of the tooltip could not be reproduced from the game tables. */
  tooltipComplete: boolean;
}

export type RecipeStatus = "ok" | "no_item_data" | "not_a_recipe";

export interface RecipeReagent {
  itemId: number;
  quantity: number;
}

export interface GameRecipe {
  /** The recipe's spell id. */
  id: number;
  professionId: number;
  name: string;
  craftedItemId: number | null;
  craftedCount: number;
  /** For recipes that make no item (enchants): what they apply. */
  effectText: string | null;
  skillYellow: number;
  skillGreen: number;
  skillGrey: number;
  /** The plans / pattern / schematic item that teaches the recipe, if any. */
  recipeItemId: number | null;
  /** Skill printed on the recipe item, when there is one. */
  recipeItemSkill: number | null;
  reagents: RecipeReagent[];
  iconFileId: number;
  status: RecipeStatus;
}

export interface GameProfession {
  /** The profession's skill line id (164 = Blacksmithing). */
  id: number;
  slug: string;
  name: string;
  iconFileId: number;
  /** Other skill line ids that belong to this profession. */
  childSkillLineIds: number[];
}
