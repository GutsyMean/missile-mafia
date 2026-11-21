import { describe, expect, it } from "vitest";
import { buildRecipes } from "@/lib/game-data/recipes";
import {
  parseCoinText,
  parseWikiRecipeTable,
  parseWowForeverRecipes,
  resolveUnlockLevels,
} from "@/lib/game-data/unlock-levels";
import { loadFixtureTables, readFixture } from "../../helpers/fixtures";

const wowForever = parseWowForeverRecipes(readFixture("unlock/wowforever-blacksmithing.html"));
const wiki = parseWikiRecipeTable(readFixture("unlock/wiki-blacksmithing.wikitext"));

describe("parseWowForeverRecipes", () => {
  const byName = new Map(wowForever.map((r) => [r.name, r]));

  it("reads the unlock level, crafted item and how the recipe is acquired", () => {
    expect(byName.get("Silvered Bronze Gauntlets")).toEqual({
      name: "Silvered Bronze Gauntlets",
      itemId: 3483,
      spellId: null,
      learnSkill: 110,
      acquisition: "trainer",
      acquisitionText: "Trainer · 10s",
      questNames: [],
      trainingCost: 1000,
    });
  });

  it("matches every trainer row in the owner's screenshots", () => {
    const seen = ["Bronze Battle Axe", "Silvered Bronze Gauntlets", "Shining Silver Breastplate", "Golden Skeleton Key", "Iron Buckle", "Green Iron Leggings"].map(
      (name) => [name, byName.get(name)!.learnSkill, byName.get(name)!.trainingCost],
    );
    // Screenshot prices are 10% lower than base (reputation discount).
    expect(seen).toEqual([
      ["Bronze Battle Axe", 110, 500],
      ["Silvered Bronze Gauntlets", 110, 1000],
      ["Shining Silver Breastplate", 120, 1000],
      ["Golden Skeleton Key", 125, 250],
      ["Iron Buckle", 125, 250],
      ["Green Iron Leggings", 130, 5000],
    ]);
  });

  it("decodes names and keeps vendor details", () => {
    expect(byName.get("Veteran's Silvered Chain Helm")).toMatchObject({
      itemId: 250528,
      learnSkill: 95,
      acquisition: "drop vendor",
      acquisitionText:
        "Drop, Vendor · Stondry Darkhammer (Redridge Mountains) · Merchant's Favor 30 · Gor'mak (The Barrens) · Merchant's Favor 30",
      trainingCost: null,
    });
  });

  it("recognises recipes known from the start and ones nobody has found yet", () => {
    expect(byName.get("Copper Bracers")).toMatchObject({ acquisition: "starter", learnSkill: 1 });
    expect(byName.get("Icebane Bracers")).toMatchObject({ acquisition: "unknown" });
  });

  it("reads rows that link a spell instead of an item", () => {
    expect(byName.get("Blacksmithing")).toMatchObject({ itemId: null, spellId: 9785 });
  });

  it("picks out the quests a recipe comes from", () => {
    expect(byName.get("Barbaric Iron Boots")).toMatchObject({ acquisition: "quest", questNames: ["Trampled Under Foot"] });
    expect(byName.get("Rough Copper Chain Boots")!.questNames).toEqual(["The Quarry's Smith", "This Is Spinal Axe"]);
    expect(byName.get("Copper Chain Vest")).toMatchObject({
      acquisition: "drop quest fished pickpocket",
      questNames: ["Supplying the Front"],
    });
  });

  it("does not mistake sellers or prices for quests", () => {
    expect(byName.get("Iron Morningstar")).toMatchObject({ acquisition: "quest vendor", questNames: [] });
    expect(byName.get("Veteran's Silvered Chain Helm")!.questNames).toEqual([]);
    expect(byName.get("Silvered Bronze Gauntlets")!.questNames).toEqual([]);
  });
});

describe("parseCoinText", () => {
  it("converts gold, silver and copper to copper", () => {
    expect(parseCoinText("2s 50c")).toBe(250);
    expect(parseCoinText("5g")).toBe(50000);
    expect(parseCoinText("1g 20s 5c")).toBe(12005);
    expect(parseCoinText("Merchant's Favor 30")).toBeNull();
  });
});

describe("parseWikiRecipeTable", () => {
  it("reads item, skill and source from every table on the page", () => {
    expect(wiki).toContainEqual({ name: "Silvered Bronze Gauntlets", skill: 110, source: "Trainer" });
    expect(wiki).toContainEqual({ name: "Coarse Sharpening Stone", skill: 40, source: "Trainer" });
    expect(wiki).toContainEqual({ name: "Truesilver Gauntlets", skill: 200, source: "Trainer" });
  });

  it("keeps rows whose source the wiki has not filled in", () => {
    expect(wiki).toContainEqual({ name: "Copper Bracers", skill: 20, source: "?" });
  });
});

describe("resolveUnlockLevels", () => {
  const tables = loadFixtureTables();
  const recipes = buildRecipes(tables);
  const itemNames = new Map(tables.ItemSparse.map((r) => [Number(r.ID), r.Display_lang]));
  const resolved = resolveUnlockLevels(recipes, itemNames, wowForever, wiki);
  const idByName = new Map(recipes.filter((r) => r.status === "ok").map((r) => [r.name, r.id]));
  const get = (name: string) => resolved.get(idByName.get(name)!)!;

  it("confirms a level when both sources agree", () => {
    expect(get("Silvered Bronze Gauntlets")).toEqual({
      learnSkill: 110,
      status: "confirmed",
      candidates: { wowForever: 110, wiki: 110, recipeItem: null },
      acquisition: "trainer",
      acquisitionText: "Trainer · 10s",
      questFaction: null,
      trainingCost: 1000,
    });
  });

  it("does not use the old estimate: Iron Buckle and Golden Skeleton Key unlock at 125", () => {
    expect(get("Iron Buckle").learnSkill).toBe(125);
    expect(get("Golden Skeleton Key").learnSkill).toBe(125);
  });

  it("confirms a plan-taught recipe when the level printed on the plans agrees", () => {
    expect(get("Veteran's Silvered Chain Helm")).toMatchObject({
      learnSkill: 95,
      status: "confirmed",
      candidates: { wowForever: 95, wiki: 95, recipeItem: 95 },
    });
  });

  it("trusts the level printed on the plans over the sites, even when both sites agree", () => {
    // The game was retuned and the sites still carry the old number.
    const stale = (name: string) => name === "Veteran's Silvered Chain Helm";
    const result = resolveUnlockLevels(
      recipes,
      itemNames,
      wowForever.map((row) => (stale(row.name) ? { ...row, learnSkill: 120 } : row)),
      wiki.map((row) => (stale(row.name) ? { ...row, skill: 120 } : row)),
    );
    expect(result.get(idByName.get("Veteran's Silvered Chain Helm")!)).toMatchObject({
      learnSkill: 95,
      status: "confirmed",
      candidates: { wowForever: 120, wiki: 120, recipeItem: 95 },
    });
  });

  it("trusts the plans when the only site that lists the recipe disagrees", () => {
    const result = resolveUnlockLevels(
      recipes,
      itemNames,
      wowForever.map((row) => (row.name === "Jagged Obsidian Shield" ? { ...row, learnSkill: 310 } : row)),
      wiki.filter((row) => row.name !== "Jagged Obsidian Shield"),
    );
    expect(result.get(idByName.get("Jagged Obsidian Shield")!)).toMatchObject({
      learnSkill: 300,
      status: "confirmed",
      candidates: { wowForever: 310, wiki: null, recipeItem: 300 },
    });
  });

  it("rejects a level from the sites that the game data rules out", () => {
    // A recipe cannot need more skill than the point where the game already turns it yellow.
    const steel = recipes.find((r) => r.name === "Steel Breastplate")!;
    const tooHigh = steel.skillYellow + 25;
    const result = resolveUnlockLevels(
      recipes,
      itemNames,
      wowForever.map((row) => (row.name === "Steel Breastplate" ? { ...row, learnSkill: tooHigh } : row)),
      wiki.map((row) => (row.name === "Steel Breastplate" ? { ...row, skill: tooHigh } : row)),
    );
    expect(result.get(steel.id)).toMatchObject({
      learnSkill: null,
      status: "disputed",
      candidates: { wowForever: tooHigh, wiki: tooHigh, recipeItem: null },
    });
  });

  it("leaves a level empty and marks it disputed when the two sites disagree", () => {
    const wikiDisagreeing = wiki.map((row) =>
      row.name === "Steel Breastplate" ? { ...row, skill: 200 } : row,
    );
    const result = resolveUnlockLevels(recipes, itemNames, wowForever, wikiDisagreeing);
    expect(result.get(idByName.get("Steel Breastplate")!)).toMatchObject({
      learnSkill: null,
      status: "disputed",
      candidates: { wowForever: 175, wiki: 200, recipeItem: null },
    });
  });

  it("lets the level printed on the plans break a tie between the two sites", () => {
    // wowforever.be says 300, the wiki says 320, the plans themselves say 300.
    expect(get("Jagged Obsidian Shield")).toMatchObject({
      learnSkill: 300,
      status: "confirmed",
      candidates: { wowForever: 300, wiki: 320, recipeItem: 300 },
    });
  });

  it("lets the level printed on the plans settle it when only one site lists the recipe", () => {
    const wikiWithout = wiki.filter((row) => row.name !== "Jagged Obsidian Shield");
    const result = resolveUnlockLevels(recipes, itemNames, wowForever, wikiWithout);
    expect(result.get(idByName.get("Jagged Obsidian Shield")!)).toMatchObject({
      learnSkill: 300,
      status: "confirmed",
      candidates: { wowForever: 300, wiki: null, recipeItem: 300 },
    });
  });

  it("marks a level as single-source when only one site lists a trainer recipe", () => {
    const wikiWithout = wiki.filter((row) => row.name !== "Steel Breastplate");
    const result = resolveUnlockLevels(recipes, itemNames, wowForever, wikiWithout);
    expect(result.get(idByName.get("Steel Breastplate")!)).toMatchObject({
      learnSkill: 175,
      status: "single_source",
      candidates: { wowForever: 175, wiki: null, recipeItem: null },
    });
  });

  it("marks a recipe no source knows as unconfirmed, with no number", () => {
    expect(get("Enchant Bracer - Inferior Stamina")).toEqual({
      learnSkill: null,
      status: "unconfirmed",
      candidates: { wowForever: null, wiki: null, recipeItem: null },
      acquisition: "unknown",
      acquisitionText: null,
      questFaction: null,
      trainingCost: null,
    });
  });

  it("marks a recipe whose quest is for one faction only", () => {
    const fromQuest = (name: string, questNames: string[]) =>
      wowForever.map((row) => (row.name === name ? { ...row, acquisition: "quest", questNames } : row));
    const factions = { "Trampled Under Foot": "horde", "The Quarry's Smith": "alliance" } as const;
    const marked = (questNames: string[]) =>
      resolveUnlockLevels(recipes, itemNames, fromQuest("Steel Breastplate", questNames), wiki, factions).get(
        idByName.get("Steel Breastplate")!,
      )!.questFaction;

    expect(marked(["Trampled Under Foot"])).toBe("horde");
    expect(marked(["The Quarry's Smith", "Trampled Under Foot"])).toBeNull();
    expect(marked(["A quest the wiki has no page for"])).toBeNull();
    expect(get("Steel Breastplate").questFaction).toBeNull();
  });
});
