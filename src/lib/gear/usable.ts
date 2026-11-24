import type { ClassView, ItemView } from "@/lib/craftables/types";

/** The game's item classes for things that are worn or wielded. */
export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;

const ARMOR_COSMETIC = 5;

/**
 * The skill a class needs for a kind of armour or weapon, by the item's
 * subclass. The game keeps this pairing in its code rather than in a table;
 * which class has which skill, and from what level, does come from the tables.
 */
const ARMOR_SKILL: Record<number, number> = {
  1: 415, // Cloth
  2: 414, // Leather
  3: 413, // Mail
  4: 293, // Plate
  6: 433, // Shields
};

const WEAPON_SKILL: Record<number, number> = {
  0: 44, // One-handed axes
  1: 172, // Two-handed axes
  2: 45, // Bows
  3: 46, // Guns
  4: 54, // One-handed maces
  5: 160, // Two-handed maces
  6: 229, // Polearms
  7: 43, // One-handed swords
  8: 55, // Two-handed swords
  10: 136, // Staves
  13: 473, // Fist weapons
  15: 173, // Daggers
  16: 176, // Thrown
  18: 226, // Crossbows
  19: 228, // Wands
};

const DUAL_WIELD = 118;

/** Relics belong to one class each: librams to Paladins (class 2), idols to Druids (11), totems to Shamans (7). */
const RELIC_CLASS: Record<number, number> = { 7: 2, 8: 11, 9: 7 };

type Wearable = Pick<ItemView, "classId" | "subclassId" | "inventoryType" | "requiredLevel" | "classMask">;

/** Something a character puts on or holds, as opposed to a shirt for show or a potion. */
export function isGear(item: Pick<ItemView, "classId" | "subclassId" | "inventoryType">): boolean {
  if (item.classId !== ITEM_CLASS_WEAPON && item.classId !== ITEM_CLASS_ARMOR) return false;
  if (item.classId === ITEM_CLASS_ARMOR && item.subclassId === ARMOR_COSMETIC) return false;
  // 4 is a shirt and 19 a tabard: worn, but never for their stats.
  return item.inventoryType > 0 && item.inventoryType !== 4 && item.inventoryType !== 19;
}

/** The level at which a class gets a skill, or null when it never does. */
function opensAt(gameClass: ClassView, skillLineId: number): number | null {
  return gameClass.proficiencies.find((p) => p.skillLineId === skillLineId)?.minLevel ?? null;
}

function hasSkill(gameClass: ClassView, level: number, skillLineId: number): boolean {
  const from = opensAt(gameClass, skillLineId);
  return from !== null && from <= level;
}

export function canDualWield(gameClass: ClassView, level: number): boolean {
  return hasSkill(gameClass, level, DUAL_WIELD);
}

/** Whether the item's class limit, if it has one, lets this class use it. */
function allowsClass(item: Wearable, gameClass: ClassView): boolean {
  if (item.classMask === undefined || item.classMask === null) return true;
  return Math.floor(item.classMask / 2 ** (gameClass.id - 1)) % 2 === 1;
}

/**
 * Whether a character of this class and level can equip the item: old enough,
 * of an allowed class, and with the armour or weapon skill it takes.
 */
export function canUse(gameClass: ClassView, level: number, item: Wearable): boolean {
  if (item.requiredLevel > level) return false;
  if (!allowsClass(item, gameClass)) return false;
  if (item.classId === ITEM_CLASS_ARMOR && item.subclassId in RELIC_CLASS) {
    return RELIC_CLASS[item.subclassId] === gameClass.id;
  }
  const skill = (item.classId === ITEM_CLASS_WEAPON ? WEAPON_SKILL : ARMOR_SKILL)[item.subclassId];
  // Rings, trinkets, relics and the like need no skill; their class limit, checked above, is all there is.
  return skill === undefined || hasSkill(gameClass, level, skill);
}

/**
 * The profession skill a character must have themselves to wear the item, as
 * its tooltip states it ("Engineering 150" for most goggles). Null for the
 * great majority, which anyone of the right class and level can wear.
 */
export function skillToWear(item: Pick<ItemView, "tooltip">): string | null {
  for (const line of item.tooltip) {
    const match = line.text.match(/^Requires (?!Level\b)(.+) \((\d+)\)$/);
    if (match) return `${match[1]} ${match[2]}`;
  }
  return null;
}
