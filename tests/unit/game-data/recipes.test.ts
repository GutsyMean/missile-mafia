import { describe, expect, it } from "vitest";
import { buildProfessions, buildRecipes } from "@/lib/game-data/recipes";
import { loadFixtureTables } from "../../helpers/fixtures";

const tables = loadFixtureTables();
const recipes = buildRecipes(tables);
const byId = new Map(recipes.map((r) => [r.id, r]));

describe("buildRecipes — reagents taken from the owner's in-game screenshots", () => {
  it("Silvered Bronze Gauntlets: 8 Bronze Bar, 1 Silver Bar, 2 Coarse Grinding Stone", () => {
    expect(byId.get(3333)).toMatchObject({
      name: "Silvered Bronze Gauntlets",
      professionId: 164,
      craftedItemId: 3483,
      craftedCount: 1,
      reagents: [
        { itemId: 2841, quantity: 8 },
        { itemId: 2842, quantity: 1 },
        { itemId: 3478, quantity: 2 },
      ],
      status: "ok",
    });
  });

  it("Green Iron Leggings: 8 Iron Bar, 1 Heavy Grinding Stone, 1 Green Dye", () => {
    expect(byId.get(3506)!.reagents).toEqual([
      { itemId: 3575, quantity: 8 },
      { itemId: 3486, quantity: 1 },
      { itemId: 2605, quantity: 1 },
    ]);
  });

  it("Shining Silver Breastplate: five reagents in the game's order", () => {
    expect(byId.get(2675)!.reagents).toEqual([
      { itemId: 2841, quantity: 20 },
      { itemId: 1206, quantity: 2 },
      { itemId: 1705, quantity: 2 },
      { itemId: 5500, quantity: 2 },
      { itemId: 2842, quantity: 4 },
    ]);
  });

  it("Veteran's Silvered Chain Helm: includes Forever-only Pristine Leather", () => {
    expect(byId.get(1252277)!.reagents).toEqual([
      { itemId: 2841, quantity: 15 },
      { itemId: 3478, quantity: 6 },
      { itemId: 2842, quantity: 4 },
      { itemId: 249427, quantity: 4 },
      { itemId: 5498, quantity: 6 },
    ]);
  });
});

describe("buildRecipes — skill-up thresholds", () => {
  it("reads yellow and grey from the table and puts green halfway, rounded down", () => {
    expect(byId.get(3333)).toMatchObject({ skillYellow: 140, skillGreen: 155, skillGrey: 170 });
    expect(byId.get(3506)).toMatchObject({ skillYellow: 155, skillGreen: 167, skillGrey: 180 });
  });
});

describe("buildRecipes — what a recipe makes", () => {
  it("reads how many items one craft produces", () => {
    expect(byId.get(8768)).toMatchObject({ name: "Iron Buckle", craftedItemId: 7071, craftedCount: 2 });
  });

  it("describes an enchant, which makes no item, by what it applies", () => {
    expect(byId.get(7418)).toMatchObject({
      name: "Enchant Bracer - Inferior Stamina",
      professionId: 333,
      craftedItemId: null,
      effectText: "Stamina +2",
      status: "ok",
    });
  });

  it("uses the crafted item's icon, or the spell's icon when there is no item", () => {
    expect(byId.get(3333)!.iconFileId).toBe(132939);
    expect(byId.get(7418)!.iconFileId).toBe(135913);
  });

  it("flags a recipe whose crafted item the game tables do not describe", () => {
    expect(byId.get(1214270)).toMatchObject({ craftedItemId: 234459, status: "no_item_data" });
  });
});

describe("buildRecipes — how a recipe is learned", () => {
  it("links the plans item that teaches it and the skill printed on the plans", () => {
    expect(byId.get(1252277)).toMatchObject({ recipeItemId: 251380, recipeItemSkill: 95 });
  });

  it("leaves both empty for a recipe no item teaches", () => {
    expect(byId.get(3333)).toMatchObject({ recipeItemId: null, recipeItemSkill: null });
  });
});

describe("buildRecipes — what is left out", () => {
  it("skips profession rank and specialisation spells, which craft nothing", () => {
    expect(byId.has(2018)).toBe(false);
    expect(byId.has(9788)).toBe(false);
    expect(byId.has(1240944)).toBe(false);
  });
});

describe("buildProfessions", () => {
  const professions = buildProfessions(tables, recipes);

  it("lists only skill lines that have recipes", () => {
    expect(professions.map((p) => p.name).sort()).toEqual(["Blacksmithing", "Enchanting"]);
  });

  it("gives each a slug, an icon and its child skill lines", () => {
    expect(professions.find((p) => p.id === 164)).toMatchObject({
      slug: "blacksmithing",
      name: "Blacksmithing",
      childSkillLineIds: [2938],
    });
    expect(professions.find((p) => p.id === 164)!.iconFileId).toBeGreaterThan(0);
  });
});
