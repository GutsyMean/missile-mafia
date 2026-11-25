import { describe, expect, it } from "vitest";
import { applyFilters, buildEntries, filterOptions, groupEntries } from "@/lib/craftables/filter";
import { DEFAULT_FILTERS, type Filters } from "@/lib/craftables/types";
import { sampleDoc } from "../../helpers/craftables";

const entries = buildEntries(sampleDoc());
const names = (filters: Partial<Filters>) =>
  applyFilters(entries, { ...DEFAULT_FILTERS, ...filters }).map((e) => e.recipe.name);

describe("buildEntries", () => {
  it("joins each recipe with its item, reagents and crafters", () => {
    const gauntlets = entries.find((e) => e.recipe.id === 3333)!;
    expect(gauntlets.item!.name).toBe("Silvered Bronze Gauntlets");
    expect(gauntlets.reagents.map((r) => [r.item?.name, r.quantity])).toEqual([
      ["Bronze Bar", 8],
      ["Silver Bar", 1],
    ]);
    expect(gauntlets.crafters.map((c) => c.characterName)).toEqual(["Damien"]);
  });

  it("keeps a reagent the item list does not describe", () => {
    const enchant = entries.find((e) => e.recipe.id === 7418)!;
    expect(enchant.item).toBeNull();
    expect(enchant.reagents).toEqual([{ item: null, itemId: 99999, quantity: 1 }]);
  });
});

describe("applyFilters — search", () => {
  it("returns everything with no filters, in list order", () => {
    expect(names({})).toEqual([
      "Veteran's Silvered Chain Helm",
      "Silvered Bronze Gauntlets",
      "Green Iron Leggings",
      "Bronze Battle Axe",
      "Iron Buckle",
      "Enchant Bracer - Inferior Stamina",
    ]);
  });

  it("matches item names regardless of case", () => {
    expect(names({ search: "SILVER" })).toEqual(["Veteran's Silvered Chain Helm", "Silvered Bronze Gauntlets"]);
  });

  it("requires every word to match", () => {
    expect(names({ search: "bronze axe" })).toEqual(["Bronze Battle Axe"]);
  });

  it("also finds recipes by what they consume", () => {
    expect(names({ search: "iron bar" })).toEqual(["Green Iron Leggings", "Iron Buckle"]);
  });

  it("ignores surrounding spaces", () => {
    expect(names({ search: "  buckle  " })).toEqual(["Iron Buckle"]);
  });
});

describe("applyFilters — properties", () => {
  it("filters by slot", () => {
    expect(names({ slot: "Hands" })).toEqual(["Silvered Bronze Gauntlets"]);
  });

  it("filters by armor or weapon type", () => {
    expect(names({ type: "Axe" })).toEqual(["Bronze Battle Axe"]);
  });

  it("filters by a stat the item gives", () => {
    expect(names({ stat: "Spirit" })).toEqual(["Silvered Bronze Gauntlets"]);
  });

  it("filters by required level range, inclusive", () => {
    expect(names({ minLevel: 22, maxLevel: 22 })).toEqual(["Silvered Bronze Gauntlets", "Bronze Battle Axe"]);
    expect(names({ minLevel: 26 })).toEqual(["Green Iron Leggings"]);
  });

  it("hides soulbound crafts when only tradeable items are wanted", () => {
    expect(names({ tradeableOnly: true })).not.toContain("Veteran's Silvered Chain Helm");
    expect(names({ tradeableOnly: true })).toContain("Enchant Bracer - Inferior Stamina");
  });

  it("combines filters", () => {
    expect(names({ type: "Mail", stat: "Strength", tradeableOnly: true, maxLevel: 25 })).toEqual([
      "Silvered Bronze Gauntlets",
    ]);
  });
});

describe("applyFilters — sorting", () => {
  it("sorts by name", () => {
    expect(names({ sort: "name" })[0]).toBe("Bronze Battle Axe");
  });

  it("sorts by required level, highest first", () => {
    expect(names({ sort: "level" }).slice(0, 2)).toEqual(["Green Iron Leggings", "Bronze Battle Axe"]);
  });
});

describe("groupEntries", () => {
  it("groups under category headings in the default order", () => {
    const groups = groupEntries(applyFilters(entries, DEFAULT_FILTERS), "category");
    expect(groups.map((g) => [g.category, g.entries.length])).toEqual([
      ["Mail Armor", 3],
      ["Two-Handed Axes", 1],
      ["Trade Goods", 1],
      ["Enchantments", 1],
    ]);
  });

  it("returns one unnamed group for the other sort orders", () => {
    const groups = groupEntries(applyFilters(entries, { ...DEFAULT_FILTERS, sort: "name" }), "name");
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBeNull();
  });

  it("tells apart two categories the game gives one name", () => {
    // Engineering has "Miscellaneous" twice: a kind of weapon, and odds and ends at the end of the list.
    const renamed = entries.map((entry) =>
      ["Mail Armor", "Enchantments"].includes(entry.recipe.category)
        ? { ...entry, recipe: { ...entry.recipe, category: "Miscellaneous" } }
        : entry,
    );
    const groups = groupEntries(applyFilters(renamed, DEFAULT_FILTERS), "category");
    expect(groups.map((g) => [g.category, g.entries.length])).toEqual([
      ["Miscellaneous", 3],
      ["Two-Handed Axes", 1],
      ["Trade Goods", 1],
      ["Miscellaneous", 1],
    ]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  it("gives a group the same key however the list around it changes", () => {
    const all = groupEntries(applyFilters(entries, DEFAULT_FILTERS), "category");
    const some = groupEntries(applyFilters(entries, { ...DEFAULT_FILTERS, search: "axe" }), "category");
    expect(some.map((g) => g.key)).toEqual([all.find((g) => g.category === "Two-Handed Axes")?.key]);
  });
});

describe("filterOptions", () => {
  it("offers only values that occur, alphabetically", () => {
    expect(filterOptions(entries)).toEqual({
      slots: ["Hands", "Head", "Legs", "Two-Hand"],
      types: ["Axe", "Mail"],
      stats: ["Spirit", "Stamina", "Strength"],
    });
  });
});
