import type { GearStat } from "./stats";

export interface SpecPriority {
  /** The stats the talent tree wants, most wanted first. */
  order: GearStat[];
  /**
   * Where the order comes from: the "Stats and gear" section of the tree's
   * guide on wowforever.be, or null where that guide has none yet and the
   * order is our own best reading of the class.
   */
  guide: string | null;
}

const guide = (path: string) => `https://wowforever.be/classes/${path}/`;

const HUNTER: GearStat[] = ["rangedDamage", "agility", "hit", "crit", "rangedAttackPower", "intellect", "spirit", "stamina"];
const ROGUE: GearStat[] = ["weaponDamage", "agility", "attackPower", "crit", "strength", "stamina", "spirit"];

/**
 * By "class/talent tree", using the slugs of the game's own names. The guides
 * give their orders in words, as read on 21 November 2026; several say the
 * level 60 order is still to be confirmed. Weapon damage leads wherever a guide
 * says the weapon matters most.
 */
export const SPEC_PRIORITIES: Record<string, SpecPriority> = {
  "warrior/arms": {
    order: ["weaponDamage", "strength", "attackPower", "hit", "crit", "agility", "stamina", "armor"],
    guide: guide("warrior/arms"),
  },
  "warrior/fury": {
    order: ["weaponDamage", "hit", "crit", "strength", "attackPower", "agility", "stamina", "armor"],
    guide: guide("warrior/fury"),
  },
  "warrior/protection": {
    order: ["hit", "stamina", "armor", "defense", "dodge", "parry", "block", "strength", "attackPower", "weaponDamage", "crit", "agility"],
    guide: guide("warrior/protection"),
  },
  "paladin/holy": {
    order: ["healing", "intellect", "crit", "spirit", "mp5", "stamina"],
    guide: guide("paladin/holy"),
  },
  "paladin/protection": {
    order: ["stamina", "armor", "defense", "dodge", "parry", "block", "strength", "spellDamage", "hit", "intellect", "weaponDamage"],
    guide: null,
  },
  "paladin/retribution": {
    order: ["weaponDamage", "hit", "crit", "strength", "attackPower", "spellDamage", "intellect", "agility", "stamina"],
    guide: guide("paladin/retribution"),
  },
  "hunter/beast-mastery": { order: HUNTER, guide: guide("hunter/beast-mastery") },
  "hunter/marksmanship": { order: HUNTER, guide: guide("hunter/marksmanship") },
  "hunter/survival": {
    order: ["rangedDamage", "weaponDamage", "agility", "hit", "crit", "rangedAttackPower", "intellect", "spirit", "stamina"],
    guide: guide("hunter/survival"),
  },
  "rogue/assassination": { order: ROGUE, guide: guide("rogue/assassination") },
  "rogue/combat": { order: ROGUE, guide: guide("rogue/combat") },
  "rogue/subtlety": { order: ROGUE, guide: guide("rogue/subtlety") },
  "priest/discipline": {
    order: ["healing", "intellect", "mp5", "spirit", "crit", "stamina"],
    guide: guide("priest/discipline"),
  },
  "priest/holy": {
    order: ["healing", "intellect", "mp5", "spirit", "crit", "stamina"],
    guide: guide("priest/holy"),
  },
  "priest/shadow": {
    order: ["hit", "spellDamage", "crit", "intellect", "spirit", "stamina"],
    guide: guide("priest/shadow"),
  },
  "shaman/elemental": {
    order: ["spellDamage", "crit", "hit", "intellect", "spirit", "stamina"],
    guide: guide("shaman/elemental"),
  },
  "shaman/enhancement": {
    order: ["weaponDamage", "strength", "attackPower", "hit", "crit", "intellect", "spirit", "agility", "stamina"],
    guide: guide("shaman/enhancement"),
  },
  "shaman/restoration": {
    order: ["healing", "spirit", "intellect", "crit", "mp5", "stamina"],
    guide: guide("shaman/restoration"),
  },
  "mage/arcane": {
    order: ["spellDamage", "intellect", "crit", "spirit", "mp5", "stamina"],
    guide: guide("mage/arcane"),
  },
  "mage/fire": {
    order: ["spellDamage", "crit", "intellect", "spirit", "mp5", "stamina"],
    guide: guide("mage/fire"),
  },
  "mage/frost": {
    order: ["spellDamage", "crit", "intellect", "spirit", "mp5", "stamina"],
    guide: guide("mage/frost"),
  },
  "warlock/affliction": {
    order: ["spellDamage", "stamina", "spirit", "intellect"],
    guide: guide("warlock/affliction"),
  },
  "warlock/demonology": {
    order: ["spellDamage", "stamina", "spirit", "intellect"],
    guide: guide("warlock/demonology"),
  },
  "warlock/destruction": {
    order: ["spellDamage", "intellect", "spirit", "stamina", "crit"],
    guide: guide("warlock/destruction"),
  },
  "druid/balance": {
    order: ["spellDamage", "hit", "crit", "intellect", "spirit", "stamina"],
    guide: guide("druid/balance"),
  },
  "druid/feral-combat": {
    order: ["weaponDamage", "hit", "expertise", "crit", "agility", "strength", "attackPower", "stamina", "armor"],
    guide: guide("druid/feral"),
  },
  "druid/restoration": {
    order: ["healing", "spirit", "intellect", "mp5", "crit", "stamina"],
    guide: null,
  },
};

/** The order for a talent tree, or null for one this table does not know (a tree the game has just added, say). */
export function specPriority(classSlug: string, specSlug: string): SpecPriority | null {
  return SPEC_PRIORITIES[`${classSlug}/${specSlug}`] ?? null;
}
