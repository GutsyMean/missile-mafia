import type { Faction, GearSource } from "@/lib/craftables/types";

const KIND: Record<GearSource["kind"], string> = { drop: "Drop", quest: "Quest reward", list: "Listed" };

/** A word for the kind of source, for a tag in the list. */
export function sourceKind(source: GearSource): string {
  return KIND[source.kind];
}

/** Where to look, in a few words: the dungeon, or what a list says of the source. */
export function sourcePlace(source: GearSource): string {
  if (source.kind === "list") return source.from ?? "Best-in-slot list";
  return source.place;
}

/**
 * The faction a piece is limited to: only when every way to get it is a quest
 * for the same side. A drop, or a quest for each side, leaves it open to both.
 */
export function sourcesFaction(sources: GearSource[]): Faction | null {
  const first = sources[0]?.faction;
  if (!first) return null;
  return sources.every((source) => source.kind === "quest" && source.faction === first) ? first : null;
}

/** A sentence about a source in three parts, the middle one being the link to the page that says so. */
export function describeSource(source: GearSource): { before: string; link: string; after: string } {
  switch (source.kind) {
    case "drop":
      return source.from
        ? { before: "Drops from ", link: source.from, after: ` in ${source.place}` }
        : { before: "Drops in ", link: source.place, after: "" };
    case "quest":
      return { before: "Reward of the quest ", link: source.from ?? source.place, after: ` in ${source.place}` };
    case "list":
      return {
        before: "Named on the ",
        link: source.place.toLowerCase(),
        after: source.from ? `: ${source.from}` : "; where it comes from is not listed yet",
      };
  }
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(place: number): string {
  const lastTwo = place % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : (["th", "st", "nd", "rd"][place % 10] ?? "th");
  return `${place}${suffix}`;
}
