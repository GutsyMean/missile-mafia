import { isCrafted } from "@/lib/craftables/filter";
import type { ClassView, Entry } from "@/lib/craftables/types";
import { GEAR_SLOTS, slotsFor, type GearSlot } from "./slots";
import { ordinal } from "./sources";
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
  /** Its place among everything in the running for the slot, counting from 1. */
  place: number;
}

export interface GearSection {
  slot: GearSlot;
  /** Every piece in the running for the slot, best first. */
  ranked: Ranked[];
}

/** How many pieces a slot shows until it is opened up. */
export const SHORT_LIST = 3;

/** What a slot shows of its ranking: some of the pieces, and a word for the ones worth pointing out. */
export interface ShownSection {
  slot: GearSlot;
  rows: Ranked[];
  /** By recipe id: "Best", "Best craftable", or a place further down such as "11th". */
  notes: Record<number, string>;
  /** How many pieces are in the running in all. */
  total: number;
}

/**
 * Chooses what to show of a slot's ranking. Closed, it is the top few, with
 * the best crafted piece added when gear that is not crafted kept every
 * crafted one out of them. Open, it is everything. With `only`, it is the
 * pieces a search found, wherever they stand: each keeps its true place.
 */
export function showSection(
  section: GearSection,
  view: { open?: boolean; only?: (entry: Entry) => boolean } = {},
): ShownSection {
  const { slot, ranked } = section;
  const bestCrafted = ranked.length > 0 && !isCrafted(ranked[0].entry) ? ranked.find((piece) => isCrafted(piece.entry)) : undefined;
  let rows: Ranked[];
  if (view.only) {
    rows = ranked.filter((piece) => view.only!(piece.entry));
  } else if (view.open) {
    rows = ranked;
  } else {
    rows = ranked.slice(0, SHORT_LIST);
    if (bestCrafted && !rows.includes(bestCrafted)) rows = [...rows, bestCrafted];
  }

  const notes: Record<number, string> = {};
  for (const piece of rows) {
    // In the short list the first three places speak for themselves; anywhere else a place is worth stating.
    const place = piece.place > SHORT_LIST || (view.only && piece.place > 1) ? ordinal(piece.place) : null;
    if (piece.place === 1) notes[piece.entry.recipe.id] = "Best";
    else if (piece === bestCrafted) notes[piece.entry.recipe.id] = place ? `Best craftable · ${place}` : "Best craftable";
    else if (place) notes[piece.entry.recipe.id] = place;
  }
  return { slot, rows, notes, total: ranked.length };
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
 * Ranks the pieces for each slot, best first, for a character of this class
 * and level. Only what they can equip is considered, and only pieces that
 * offer something the order asks for.
 */
export function rankGear(
  entries: Entry[],
  gameClass: ClassView,
  level: number,
  order: GearStat[] | null,
): GearSection[] {
  const dualWield = canDualWield(gameClass, level);
  const bySlot = new Map<GearSlot, Map<number, Omit<Ranked, "place">>>();
  for (const entry of entries) {
    const { item } = entry;
    if (!item || !isGear(item) || !canUse(gameClass, level, item)) continue;
    // Gear that is not crafted must also be within reach: a quest reward cannot be had before its quest,
    // nor a class quest's by another class.
    const withinReach = (entry.sources ?? []).some(
      (source) => (source.level ?? 0) <= level && (!source.forClass || source.forClass === gameClass.slug),
    );
    if (!isCrafted(entry) && !withinReach) continue;
    for (const slot of slotsFor(item, dualWield)) {
      const { score, parts } = scoreItem(item, slot, order);
      if (score <= 0) continue;
      const pieces = bySlot.get(slot) ?? new Map<number, Omit<Ranked, "place">>();
      bySlot.set(slot, pieces);
      // Two recipes can make the same item; the one somebody can craft stands for both.
      const known = pieces.get(item.id);
      if (!known || (entry.available && !known.entry.available)) pieces.set(item.id, { entry, slot, score, parts });
    }
  }

  const sections: GearSection[] = [];
  for (const slot of GEAR_SLOTS) {
    const pieces: Ranked[] = [...(bySlot.get(slot)?.values() ?? [])]
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(b.entry.available) - Number(a.entry.available) ||
          (b.entry.item?.itemLevel ?? 0) - (a.entry.item?.itemLevel ?? 0) ||
          a.entry.recipe.name.localeCompare(b.entry.recipe.name),
      )
      .map((piece, index) => ({ ...piece, place: index + 1 }));
    if (pieces.length > 0) sections.push({ slot, ranked: pieces });
  }
  return sections;
}
