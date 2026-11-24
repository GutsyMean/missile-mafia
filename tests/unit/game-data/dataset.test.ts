import { describe, expect, it } from "vitest";
import { buildDataset } from "@/lib/game-data/dataset";
import { loadFixtureTables, readFixture } from "../../helpers/fixtures";

const dataset = buildDataset(loadFixtureTables(), "1.60.1.70938", {
  blacksmithing: {
    wowForever: readFixture("unlock/wowforever-blacksmithing.html"),
    wiki: readFixture("unlock/wiki-blacksmithing.wikitext"),
  },
});
const recipe = (id: number) => dataset.recipes.find((r) => r.id === id)!;
const itemIds = new Set(dataset.items.map((i) => i.id));

describe("buildDataset", () => {
  it("records the build it was made from", () => {
    expect(dataset.build).toBe("1.60.1.70938");
  });

  it("includes every item a recipe makes, consumes or is taught by", () => {
    expect(itemIds.has(3483)).toBe(true); // crafted: Silvered Bronze Gauntlets
    expect(itemIds.has(2841)).toBe(true); // reagent: Bronze Bar
    expect(itemIds.has(251380)).toBe(true); // plans
  });

  it("leaves out items the game tables do not describe", () => {
    expect(itemIds.has(234459)).toBe(false);
  });

  it("attaches the unlock level to each recipe", () => {
    expect(recipe(3333).unlock).toMatchObject({ learnSkill: 110, status: "confirmed", acquisition: "trainer" });
    expect(recipe(8768).unlock.learnSkill).toBe(125);
  });

  it("uses each profession's own pages, so one without pages stays unconfirmed", () => {
    expect(recipe(7418).unlock).toMatchObject({ learnSkill: null, status: "unconfirmed" });
  });

  it("groups recipes for the list by what they make", () => {
    expect(recipe(3333).category).toBe("Mail Armor");
    expect(recipe(9987).category).toBe("Two-Handed Axes");
    expect(recipe(27586).category).toBe("Shields");
    expect(recipe(8768).category).toBe("Trade Goods");
    expect(recipe(2665).category).toBe("Consumable");
    expect(recipe(7418).category).toBe("Enchantments");
  });

  it("orders groups armor first, then weapons, then everything else", () => {
    const order = (id: number) => recipe(id).categoryOrder;
    expect(order(3333)).toBeLessThan(order(27586));
    expect(order(27586)).toBeLessThan(order(9987));
    expect(order(9987)).toBeLessThan(order(8768));
  });

  it("lists the professions that have recipes", () => {
    expect(dataset.professions.map((p) => p.slug).sort()).toEqual(["blacksmithing", "enchanting"]);
  });
});

describe("buildDataset — gear that is not crafted", () => {
  const source = { kind: "drop" as const, place: "The Deadmines", from: "Edwin VanCleef", url: "https://wowforever.be/x" };
  const tables = loadFixtureTables();

  it("takes in the gear a page names a source for, and builds its item", () => {
    // 273908 is a pair of leggings no recipe in these tables makes.
    const withGear = buildDataset(tables, "1.60.1.70938", {}, {}, { 273908: [source] });
    expect(withGear.gearSources).toEqual({ 273908: [source] });
    expect(withGear.items.find((item) => item.id === 273908)?.name).toBe("Justice Leggings");
    expect(dataset.items.some((item) => item.id === 273908)).toBe(false);
  });

  it("leaves out what is not gear, and what the game tables do not have", () => {
    // 2841 is a Bronze Bar; 999999 is not an item at all.
    const withGear = buildDataset(tables, "1.60.1.70938", {}, {}, { 2841: [source], 999999: [source], 273908: [source] });
    expect(Object.keys(withGear.gearSources ?? {})).toEqual(["273908"]);
  });

  it("keeps the level a source opens at only where the item has none of its own, or the source is a quest", () => {
    const drop = { ...source, level: 18 };
    const quest = { kind: "quest" as const, place: "The Deadmines", from: "Red Silk Bandanas", level: 14, url: "https://wowforever.be/q" };
    const list = { kind: "list" as const, place: "Pre-raid best-in-slot list", from: null, level: 60, url: "https://wowforever.be/l" };
    // The leggings ask for a level themselves, so only the quest's level is kept.
    const withGear = buildDataset(tables, "1.60.1.70938", {}, {}, { 273908: [drop, quest, list] });
    expect(withGear.items.find((item) => item.id === 273908)?.requiredLevel).toBeGreaterThan(0);
    expect(withGear.gearSources?.[273908]).toEqual([source, quest, { ...list, level: undefined }].map((s) => JSON.parse(JSON.stringify(s))));
  });

  it("keeps every source's level for an item that only nominally requires level 1", () => {
    const list = { kind: "list" as const, place: "Pre-raid best-in-slot list", from: null, level: 60, url: "https://wowforever.be/l" };
    const nominal = {
      ...tables,
      ItemSparse: tables.ItemSparse.map((row) => (row.ID === "273908" ? { ...row, RequiredLevel: "1" } : row)),
    };
    expect(buildDataset(nominal, "1.60.1.70938", {}, {}, { 273908: [list] }).gearSources?.[273908]).toEqual([list]);
  });

  it("says so when the sources could not be read, rather than saying there are none", () => {
    expect(buildDataset(tables, "1.60.1.70938").gearSources).toBeNull();
    expect(buildDataset(tables, "1.60.1.70938", {}, {}, {}).gearSources).toEqual({});
  });
});
