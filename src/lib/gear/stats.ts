import type { ItemView } from "@/lib/craftables/types";
import { MELEE_SLOTS, type GearSlot } from "./slots";

/** The things a piece of gear is judged on. */
export type GearStat =
  | "weaponDamage"
  | "rangedDamage"
  | "strength"
  | "agility"
  | "stamina"
  | "intellect"
  | "spirit"
  | "attackPower"
  | "rangedAttackPower"
  | "spellDamage"
  | "healing"
  | "crit"
  | "hit"
  | "expertise"
  | "defense"
  | "dodge"
  | "parry"
  | "block"
  | "mp5"
  | "armor";

/** The game's ids for the stats an item carries. */
const STRENGTH = 4;
const AGILITY = 3;
const STAMINA = 7;
const INTELLECT = 5;
const SPIRIT = 6;
const DEFENSE = 12;
const DODGE = 13;
const PARRY = 14;
const BLOCK = 15;
const HIT = 31;
const CRIT = 32;
const EXPERTISE = 37;
const ATTACK_POWER = 38;
const RANGED_ATTACK_POWER = 39;
const SPELL_HEALING = 41;
const SPELL_DAMAGE = 42;
const MANA_PER_5 = 43;
const SPELL_POWER = 45;

type Scored = Pick<ItemView, "classId" | "subclassId" | "stats" | "armor" | "damage">;

const sum = (item: Scored, ...ids: number[]) =>
  item.stats.reduce((total, stat) => (ids.includes(stat.stat) ? total + stat.value : total), 0);

/** Bows, guns and crossbows: the weapons a shot is fired from. */
const SHOOTING_SUBCLASSES = new Set([2, 3, 18]);
const ITEM_CLASS_WEAPON = 2;

/**
 * One number on an item that counts towards a stat. `worth` is what a point of
 * it is taken to be worth beside a point of Strength or Intellect. The game
 * publishes no such table: the figures are rounded from how the stats convert
 * (2 attack power per Strength, 14 critical strike or 10 hit per percent at
 * level 60) and are the one part of the ranking that is a judgement.
 */
interface Component {
  /** Named when it differs from the stat it counts towards, as spell power does for healing. */
  label?: string;
  amount: (item: Scored, slot: GearSlot) => number;
  worth: number;
}

interface StatRule {
  label: string;
  components: Component[];
}

const stat = (label: string, worth: number, ...ids: number[]): StatRule => ({
  label,
  components: [{ amount: (item) => sum(item, ...ids), worth }],
});

export const GEAR_STATS: Record<GearStat, StatRule> = {
  weaponDamage: {
    label: "Weapon damage",
    components: [
      {
        amount: (item, slot) => (MELEE_SLOTS.has(slot) && item.classId === ITEM_CLASS_WEAPON ? (item.damage?.dps ?? 0) : 0),
        worth: 4,
      },
    ],
  },
  rangedDamage: {
    label: "Ranged weapon damage",
    components: [
      {
        amount: (item, slot) =>
          slot === "Ranged" && item.classId === ITEM_CLASS_WEAPON && SHOOTING_SUBCLASSES.has(item.subclassId)
            ? (item.damage?.dps ?? 0)
            : 0,
        worth: 4,
      },
    ],
  },
  strength: stat("Strength", 1, STRENGTH),
  agility: stat("Agility", 1, AGILITY),
  stamina: stat("Stamina", 1, STAMINA),
  intellect: stat("Intellect", 1, INTELLECT),
  spirit: stat("Spirit", 1, SPIRIT),
  attackPower: stat("Attack power", 0.5, ATTACK_POWER),
  rangedAttackPower: {
    label: "Ranged attack power",
    components: [
      { label: "Attack power", amount: (item) => sum(item, ATTACK_POWER), worth: 0.5 },
      { amount: (item) => sum(item, RANGED_ATTACK_POWER), worth: 0.5 },
    ],
  },
  // "Spell power" raises damage and healing alike, so it counts towards both.
  spellDamage: {
    label: "Spell damage",
    components: [
      { label: "Spell power", amount: (item) => sum(item, SPELL_POWER), worth: 1 },
      { amount: (item) => sum(item, SPELL_DAMAGE), worth: 1 },
    ],
  },
  healing: {
    label: "Healing power",
    components: [
      { label: "Spell power", amount: (item) => sum(item, SPELL_POWER), worth: 1 },
      // Healing-only bonuses come in numbers about twice the size of spell power.
      { amount: (item) => sum(item, SPELL_HEALING), worth: 0.5 },
    ],
  },
  crit: stat("Critical strike", 0.8, CRIT),
  hit: stat("Hit", 1.2, HIT),
  expertise: stat("Expertise", 1, EXPERTISE),
  defense: stat("Defense", 1.2, DEFENSE),
  dodge: stat("Dodge", 0.8, DODGE),
  parry: stat("Parry", 0.8, PARRY),
  block: stat("Block", 0.6, BLOCK),
  mp5: stat("Mana per 5 seconds", 2.5, MANA_PER_5),
  armor: { label: "Armor", components: [{ amount: (item) => item.armor ?? 0, worth: 0.03 }] },
};

export const ALL_GEAR_STATS = Object.keys(GEAR_STATS) as GearStat[];

/** Each place down the order counts for a fifth less than the one before. */
export function rankWeight(place: number): number {
  return 0.8 ** place;
}

/** A weapon in the off hand hits for half, as it does in the game. */
export function slotWeight(stat: GearStat, slot: GearSlot): number {
  return stat === "weaponDamage" && slot === "Off Hand" ? 0.5 : 1;
}
