import type { ClassView, Entry } from "@/lib/craftables/types";
import { GEAR_SLOTS, slotsFor, type GearSlot } from "./slots";
import { GEAR_STATS, rankWeight, slotWeight, type GearStat } from "./stats";
import { canDualWield, canUse, isGear } from "./usable";

export interface ScorePart {
  stat: GearStat;
  label: string;
  /** How much of the stat the item has. */
  amount: number;
  /** What that adds to the score. */
  points: number;
}

export interface Ranked {
  entry: Entry;
  slot: GearSlot;
  score: number;
  /** What the score is made of, biggest part first. */
  parts: ScorePart[];
}

export interface GearSection {
  slot: GearSlot;
  /** The best pieces, best first, cut to the number asked for. */
  ranked: Ranked[];
  /** How many pieces were in the running for this slot. */
  candidates: number;
}

type Item = NonNullable<Entry["item"]>;

/**
 * Scores an item for a slot against an order of stats: each stat's amount,
 * times what a point of it is worth, times a weight that falls with its place
 * in the order. With no order to go by, the item's level stands in.
 */
export function scoreItem(item: Item, slot: GearSlot, order: GearStat[] | null): { score: number; parts: ScorePart[] } {
  if (order === null) return { score: item.itemLevel, parts: [] };
  const parts: ScorePart[] = [];
  order.forEach((stat, place) => {
    const rule = GEAR_STATS[stat];
    for (const component of rule.components) {
      const amount = component.amount(item, slot);
      if (amount === 0) continue;
      const points = amount * component.worth * rankWeight(place) * slotWeight(stat, slot);
      parts.push({ stat, label: component.label ?? rule.label, amount, points });
    }
  });
  parts.sort((a, b) => b.points - a.points);
  return { score: parts.reduce((total, part) => total + part.points, 0), parts };
}

/**
 * The best craftable pieces for each slot, for a character of this class and
 * level. Only what they can equip is considered, and only pieces that offer
 * something the order asks for.
 */
export function rankGear(
  entries: Entry[],
  gameClass: ClassView,
  level: number,
  order: GearStat[] | null,
  perSlot: number,
): GearSection[] {
  const dualWield = canDualWield(gameClass, level);
  const bySlot = new Map<GearSlot, Map<number, Ranked>>();
  for (const entry of entries) {
    const { item } = entry;
    if (!item || !isGear(item) || !canUse(gameClass, level, item)) continue;
    for (const slot of slotsFor(item, dualWield)) {
      const { score, parts } = scoreItem(item, slot, order);
      if (score <= 0) continue;
      const pieces = bySlot.get(slot) ?? new Map<number, Ranked>();
      bySlot.set(slot, pieces);
      // Two recipes can make the same item; the one somebody can craft stands for both.
      const known = pieces.get(item.id);
      if (!known || (entry.available && !known.entry.available)) pieces.set(item.id, { entry, slot, score, parts });
    }
  }

  const sections: GearSection[] = [];
  for (const slot of GEAR_SLOTS) {
    const pieces = [...(bySlot.get(slot)?.values() ?? [])].sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.entry.available) - Number(a.entry.available) ||
        (b.entry.item?.itemLevel ?? 0) - (a.entry.item?.itemLevel ?? 0) ||
        a.entry.recipe.name.localeCompare(b.entry.recipe.name),
    );
    if (pieces.length > 0) sections.push({ slot, ranked: pieces.slice(0, perSlot), candidates: pieces.length });
  }
  return sections;
}
