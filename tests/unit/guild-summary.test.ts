import { describe, expect, it } from "vitest";
import type { CraftablesDoc, RecipeView } from "@/lib/craftables/types";
import { craftableNow, professionCoverage, roster } from "@/lib/guild-summary";

const recipe = (id: number, professionId: number, crafterIds: string[]): RecipeView => ({
  id,
  professionId,
  name: `Recipe ${id}`,
  iconFileId: 0,
  craftedItemId: null,
  craftedCount: 1,
  effectText: null,
  category: "Other",
  categoryOrder: 990,
  reagents: [],
  crafterIds,
});

const crafter = (id: string, characterName: string, skills: Record<string, number>) => ({
  id,
  slug: id,
  characterName,
  realm: null,
  faction: null,
  class: null,
  level: null,
  note: null,
  skills,
});

const doc: CraftablesDoc = {
  build: "1.60.1.71091",
  syncedAt: "2026-11-25T00:00:00Z",
  professions: [
    { id: 197, slug: "tailoring", name: "Tailoring", iconFileId: 3 },
    { id: 164, slug: "blacksmithing", name: "Blacksmithing", iconFileId: 1 },
    { id: 171, slug: "alchemy", name: "Alchemy", iconFileId: 2 },
    { id: 202, slug: "engineering", name: "Engineering", iconFileId: 4 },
  ],
  crafters: [
    crafter("b", "Bram", { "164": 215, "171": 0 }),
    crafter("a", "Ada", { "164": 215, "197": 170 }),
    crafter("c", "Cole", { "164": 42 }),
  ],
  recipes: [
    recipe(1, 164, ["b", "a"]),
    recipe(2, 164, ["b"]),
    recipe(3, 197, ["a"]),
    recipe(4, 197, []),
    recipe(5, 171, []),
  ],
  items: {},
};

describe("professionCoverage", () => {
  it("lists the professions somebody practises, by name, with what can be made now", () => {
    expect(professionCoverage(doc).map((c) => [c.profession.name, c.recipes])).toEqual([
      ["Blacksmithing", 2],
      ["Tailoring", 1],
    ]);
  });

  it("names who to ask, the most skilled first and by name among equals", () => {
    const [blacksmithing] = professionCoverage(doc);
    expect(blacksmithing.crafters.map((c) => [c.crafter.characterName, c.skill])).toEqual([
      ["Ada", 215],
      ["Bram", 215],
      ["Cole", 42],
    ]);
  });
});

describe("roster", () => {
  it("has a column for each profession anybody has", () => {
    expect(roster(doc).professions.map((p) => p.name)).toEqual(["Blacksmithing", "Tailoring"]);
  });

  it("gives each crafter their skills in column order and the size of their list", () => {
    expect(roster(doc).rows.map((row) => [row.crafter.characterName, row.skills, row.recipes])).toEqual([
      ["Ada", [215, 170], 2],
      ["Bram", [215, 0], 2],
      ["Cole", [42, 0], 0],
    ]);
  });

  it("knows the highest skill in each profession", () => {
    expect(roster(doc).best).toEqual([215, 170]);
  });

  it("is empty for a guild with no crafters", () => {
    expect(roster({ ...doc, crafters: [] })).toEqual({ professions: [], rows: [], best: [] });
  });
});

describe("craftableNow", () => {
  it("counts the recipes somebody has learned", () => {
    expect(craftableNow(doc)).toBe(3);
  });
});
