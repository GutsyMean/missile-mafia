import type { ItemView } from "@/lib/craftables/types";

/** The places gear goes, in the order the character sheet lists them. */
export const GEAR_SLOTS = [
  "Head",
  "Neck",
  "Shoulder",
  "Back",
  "Chest",
  "Wrist",
  "Hands",
  "Waist",
  "Legs",
  "Feet",
  "Finger",
  "Trinket",
  "Two-Hand",
  "Main Hand",
  "Off Hand",
  "Ranged",
  "Relic",
] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

/** The game's inventory types, by the slot each fills. */
const SLOT_OF: Record<number, GearSlot> = {
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  14: "Off Hand", // shield
  15: "Ranged", // bow
  16: "Back",
  17: "Two-Hand",
  20: "Chest", // robe
  21: "Main Hand",
  23: "Off Hand", // held in off-hand
  25: "Ranged", // thrown
  26: "Ranged", // gun, crossbow, wand
  28: "Relic",
};

const ONE_HAND = 13;
const OFF_HAND_WEAPON = 22;

/**
 * The slots an item can fill. A one-handed weapon goes in the main hand, and
 * in the off hand too for a character who can wield two.
 */
export function slotsFor(item: Pick<ItemView, "inventoryType">, dualWield: boolean): GearSlot[] {
  if (item.inventoryType === ONE_HAND) return dualWield ? ["Main Hand", "Off Hand"] : ["Main Hand"];
  if (item.inventoryType === OFF_HAND_WEAPON) return dualWield ? ["Off Hand"] : [];
  const slot = SLOT_OF[item.inventoryType];
  return slot ? [slot] : [];
}

export const MELEE_SLOTS: ReadonlySet<GearSlot> = new Set(["Two-Hand", "Main Hand", "Off Hand"]);
