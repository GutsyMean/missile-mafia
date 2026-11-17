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
