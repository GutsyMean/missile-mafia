/** Item `Bonding` values and the localisation tag of the line the tooltip shows. */
export const BONDING_TAGS: Record<number, string> = {
  1: "ITEM_BIND_ON_PICKUP",
  2: "ITEM_BIND_ON_EQUIP",
  3: "ITEM_BIND_ON_USE",
  4: "ITEM_BIND_QUEST",
};

/** Bondings that tie the item to whoever makes or loots it. */
export const UNTRADEABLE_BONDINGS = new Set([1, 4]);

/** Item `InventoryType` values and the localisation tag of the slot name. */
export const INVENTORY_TYPE_TAGS: Record<number, string> = {
  1: "INVTYPE_HEAD",
  2: "INVTYPE_NECK",
  3: "INVTYPE_SHOULDER",
  4: "INVTYPE_BODY",
  5: "INVTYPE_CHEST",
  6: "INVTYPE_WAIST",
  7: "INVTYPE_LEGS",
  8: "INVTYPE_FEET",
  9: "INVTYPE_WRIST",
  10: "INVTYPE_HAND",
  11: "INVTYPE_FINGER",
  12: "INVTYPE_TRINKET",
  13: "INVTYPE_WEAPON",
  14: "INVTYPE_SHIELD",
  15: "INVTYPE_RANGED",
  16: "INVTYPE_CLOAK",
  17: "INVTYPE_2HWEAPON",
  18: "INVTYPE_BAG",
  19: "INVTYPE_TABARD",
  20: "INVTYPE_ROBE",
  21: "INVTYPE_WEAPONMAINHAND",
  22: "INVTYPE_WEAPONOFFHAND",
  23: "INVTYPE_HOLDABLE",
  24: "INVTYPE_AMMO",
  25: "INVTYPE_THROWN",
  26: "INVTYPE_RANGEDRIGHT",
  27: "INVTYPE_QUIVER",
  28: "INVTYPE_RELIC",
};

/**
 * Which column group of `RandPropPoints` budgets an inventory type.
 * 0 = head/chest/legs/two-hand, 1 = shoulder/waist/feet/hands/trinket,
 * 2 = neck/wrist/finger/shield/back/held, 3 = one-hand weapons, 4 = ranged.
 */
export const STAT_BUDGET_SLOT: Record<number, number> = {
  1: 0, 4: 0, 5: 0, 7: 0, 17: 0, 20: 0,
  3: 1, 6: 1, 8: 1, 10: 1, 12: 1,
  2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2,
  13: 3, 21: 3, 22: 3,
  15: 4, 25: 4, 26: 4,
};

/** Item stat ids and the localisation tag that words them (`ITEM_MOD_<tag>`). */
export const STAT_TAGS: Record<number, string> = {
  0: "MANA",
  1: "HEALTH",
  3: "AGILITY",
  4: "STRENGTH",
  5: "INTELLECT",
  6: "SPIRIT",
  7: "STAMINA",
  12: "DEFENSE_SKILL_RATING",
  13: "DODGE_RATING",
  14: "PARRY_RATING",
  15: "BLOCK_RATING",
  16: "HIT_MELEE_RATING",
  17: "HIT_RANGED_RATING",
  18: "HIT_SPELL_RATING",
  19: "CRIT_MELEE_RATING",
  20: "CRIT_RANGED_RATING",
  21: "CRIT_SPELL_RATING",
  28: "HASTE_MELEE_RATING",
  29: "HASTE_RANGED_RATING",
  30: "HASTE_SPELL_RATING",
  31: "HIT_RATING",
  32: "CRIT_RATING",
  35: "RESILIENCE_RATING",
  36: "HASTE_RATING",
  37: "EXPERTISE_RATING",
  38: "ATTACK_POWER",
  39: "RANGED_ATTACK_POWER",
  40: "FERAL_ATTACK_POWER",
  41: "SPELL_HEALING_DONE",
  42: "SPELL_DAMAGE_DONE",
  43: "MANA_REGENERATION",
  44: "ARMOR_PENETRATION_RATING",
  45: "SPELL_POWER",
  46: "HEALTH_REGEN",
  47: "SPELL_PENETRATION",
  48: "BLOCK_VALUE",
};

/** The order the tooltip lists the white "+N Stat" lines in. */
export const PRIMARY_STAT_ORDER = [4, 3, 7, 5, 6, 1, 0];

export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;
export const ITEM_CLASS_RECIPE = 9;
export const ARMOR_SUBCLASS_SHIELD = 6;

/** Armor subclass → column name in `ItemArmorTotal` and in `ArmorLocation`. */
export const ARMOR_COLUMNS: Record<number, { total: string; location: string }> = {
  1: { total: "Cloth", location: "Clothmodifier" },
  2: { total: "Leather", location: "Leathermodifier" },
  3: { total: "Mail", location: "Chainmodifier" },
  4: { total: "Plate", location: "Platemodifier" },
};

/** `Flags_1` bit marking a weapon as a caster weapon (lower damage budget). */
export const ITEM_FLAG2_CASTER_WEAPON = 0x200;

/** Item effect trigger types. */
export const ITEM_TRIGGER_ON_USE = 0;
export const ITEM_TRIGGER_ON_EQUIP = 1;
export const ITEM_TRIGGER_ON_PROC = 2;
export const ITEM_TRIGGER_LEARN = 6;

/** Spell effect ids. */
export const SPELL_EFFECT_CREATE_ITEM = 24;
export const SPELL_EFFECT_LEARN_SPELL = 36;
export const SPELL_EFFECT_ENCHANT_ITEM = 53;
export const SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY = 54;
export const SPELL_EFFECT_ENCHANT_HELD_ITEM = 92;

/** Skill line categories that hold professions (11 primary, 9 secondary). */
export const PROFESSION_CATEGORIES = new Set([9, 11]);

/** Armour worn for looks alone. */
export const ARMOR_SUBCLASS_COSMETIC = 5;
/** Inventory types that are worn but never for their stats. */
export const INVENTORY_SHIRT = 4;
export const INVENTORY_TABARD = 19;
