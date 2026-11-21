import { describe, expect, it } from "vitest";
import { buildEntries, mergeGearElsewhere } from "@/lib/craftables/filter";
import type { CraftablesDoc, GearElsewhereDoc, RecipeView } from "@/lib/craftables/types";

const recipe = (id: number, professionId: number, name: string): RecipeView => ({
  id,
  professionId,
  name,
  iconFileId: 0,
  craftedItemId: null,
  craftedCount: 1,
  effectText: null,
  category: "Other",
  categoryOrder: 990,
  reagents: [],
  crafterIds: [],
  pendingCrafterIds: [],
});

const doc: CraftablesDoc = {
  build: "1",
  syncedAt: null,
  professions: [{ id: 197, slug: "tailoring", name: "Tailoring", iconFileId: 0 }],
  crafters: [],
  recipes: [recipe(1, 197, "Linen Belt")],
  items: {},
};

const elsewhere: GearElsewhereDoc = {
  professions: [
    { id: 202, slug: "engineering", name: "Engineering", iconFileId: 0 },
    { id: 197, slug: "tailoring", name: "Tailoring", iconFileId: 0 },
  ],
  recipes: [recipe(2, 202, "Moonsight Rifle"), recipe(1, 197, "Linen Belt")],
  items: {},
};

describe("mergeGearElsewhere", () => {
  it("adds the gear of other professions, and those professions by name", () => {
    const merged = mergeGearElsewhere(doc, elsewhere);
    expect(merged.professions.map((profession) => profession.name)).toEqual(["Engineering", "Tailoring"]);
    expect(merged.recipes.map((entry) => entry.name)).toEqual(["Linen Belt", "Moonsight Rifle"]);
    const rifle = buildEntries(merged).find((entry) => entry.recipe.name === "Moonsight Rifle");
    expect(rifle).toMatchObject({ professionName: "Engineering", available: false, pending: [] });
  });

  it("leaves the document alone when there is nothing to add", () => {
    expect(mergeGearElsewhere(doc, null)).toBe(doc);
    expect(mergeGearElsewhere(doc, { professions: [], recipes: [], items: {} })).toBe(doc);
  });
});
