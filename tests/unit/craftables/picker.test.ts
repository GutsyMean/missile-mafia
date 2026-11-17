import { describe, expect, it } from "vitest";
import { applyFilters, buildEntries, mergeUnlearned, unlearnedToLoad } from "@/lib/craftables/filter";
import { DEFAULT_FILTERS, type CraftablesDoc, type Filters, type RecipeView, type UnlearnedDoc } from "@/lib/craftables/types";
import { parseViewState, serializeViewState } from "@/lib/craftables/url-state";

const recipe = (over: Partial<RecipeView> & { id: number; name: string }): RecipeView => ({
  professionId: 164,
  iconFileId: 0,
  craftedItemId: null,
  craftedCount: 1,
  effectText: null,
  category: "Other",
  categoryOrder: 990,
  reagents: [],
  crafterIds: [],
  pendingCrafterIds: [],
  ...over,
});

/** Two crafters: Damien is a blacksmith; Stitches is a tailor who has dabbled in blacksmithing. */
const doc: CraftablesDoc = {
  build: "1",
  syncedAt: null,
  professions: [
    { id: 164, slug: "blacksmithing", name: "Blacksmithing", iconFileId: 1 },
    { id: 197, slug: "tailoring", name: "Tailoring", iconFileId: 2 },
  ],
  crafters: [
    { id: "c1", slug: "damien", characterName: "Damien", realm: null, faction: null, class: null, level: 24, note: null, skills: { "164": 145 } },
    { id: "c2", slug: "stitches", characterName: "Stitches", realm: null, faction: null, class: null, level: 30, note: null, skills: { "197": 120, "164": 60 } },
  ],
  recipes: [
    recipe({ id: 1, name: "Copper Mace", crafterIds: ["c1", "c2"] }),
    recipe({ id: 2, name: "Silvered Bronze Gauntlets", crafterIds: ["c1"], pendingCrafterIds: ["c2"], learnSkill: 110 }),
    recipe({ id: 3, name: "Linen Cloak", professionId: 197, crafterIds: ["c2"] }),
  ],
  items: {},
  unlearned: [
    { professionId: 164, count: 1 },
    { professionId: 197, count: 1 },
  ],
};

const smithing: UnlearnedDoc = {
  recipes: [recipe({ id: 10, name: "Green Iron Hauberk", pendingCrafterIds: ["c1", "c2"], learnSkill: 155 })],
  items: {},
};
const tailoring: UnlearnedDoc = {
  recipes: [recipe({ id: 20, name: "Silk Robe", professionId: 197, pendingCrafterIds: ["c2"], learnSkill: 150 })],
  items: {},
};
const everything = mergeUnlearned(doc, [smithing, tailoring]);

const view = (crafterId: string | null, filters: Partial<Filters> = {}) =>
  applyFilters(buildEntries(everything, crafterId), { ...DEFAULT_FILTERS, sort: "name", ...filters }).map(
    (e) => `${e.recipe.name}${e.available ? "" : " (not yet)"}`,
  );

describe("looking at everyone", () => {
  it("shows what anyone can make as available, and the rest as not yet", () => {
    expect(view(null)).toEqual([
      "Copper Mace",
      "Green Iron Hauberk (not yet)",
      "Linen Cloak",
      "Silk Robe (not yet)",
      "Silvered Bronze Gauntlets",
    ]);
  });

  it("can be narrowed to one profession", () => {
    expect(view(null, { profession: "tailoring" })).toEqual(["Linen Cloak", "Silk Robe (not yet)"]);
    expect(view(null, { profession: "blacksmithing" })).toEqual([
      "Copper Mace",
      "Green Iron Hauberk (not yet)",
      "Silvered Bronze Gauntlets",
    ]);
  });

  it("ignores a profession the link names but the guild does not have", () => {
    expect(view(null, { profession: "jewelcrafting" })).toHaveLength(5);
  });
});

describe("looking at one crafter", () => {
  it("shows only their professions, and marks what they have not learned", () => {
    expect(view("c1")).toEqual(["Copper Mace", "Green Iron Hauberk (not yet)", "Silvered Bronze Gauntlets"]);
  });

  it("marks a recipe as not yet theirs even when someone else can make it", () => {
    expect(view("c2")).toEqual([
      "Copper Mace",
      "Green Iron Hauberk (not yet)",
      "Linen Cloak",
      "Silk Robe (not yet)",
      "Silvered Bronze Gauntlets (not yet)",
    ]);
    const gauntlets = buildEntries(everything, "c2").find((e) => e.recipe.id === 2)!;
    expect(gauntlets.crafters.map((c) => c.characterName)).toEqual(["Damien"]);
    expect(gauntlets.pending.map((c) => c.characterName)).toEqual(["Stitches"]);
  });

  it("combines with a profession", () => {
    expect(view("c2", { profession: "blacksmithing" })).toEqual([
      "Copper Mace",
      "Green Iron Hauberk (not yet)",
      "Silvered Bronze Gauntlets (not yet)",
    ]);
  });

  it("hides what they have not learned with Available now only", () => {
    expect(view("c2", { availableOnly: true })).toEqual(["Copper Mace", "Linen Cloak"]);
  });

  it("shows nothing for a crafter the document does not list", () => {
    expect(view("gone")).toEqual([]);
  });
});

describe("mergeUnlearned", () => {
  it("adds the extra recipes and items without repeating any", () => {
    const twice = mergeUnlearned(doc, [smithing, smithing]);
    expect(twice.recipes.map((r) => r.id)).toEqual([1, 2, 3, 10]);
    expect(mergeUnlearned(doc, []).recipes).toHaveLength(3);
  });
});

describe("unlearnedToLoad: which professions' not-yet-learned recipes to fetch", () => {
  const filters = (over: Partial<Filters> = {}) => ({ ...DEFAULT_FILTERS, ...over });

  it("fetches the chosen profession", () => {
    expect(unlearnedToLoad(doc, filters({ profession: "tailoring" }))).toEqual([197]);
  });

  it("fetches the chosen crafter's professions", () => {
    expect(unlearnedToLoad(doc, filters({ crafter: "damien" }))).toEqual([164]);
    expect(unlearnedToLoad(doc, filters({ crafter: "stitches" }))).toEqual([164, 197]);
  });

  it("fetches only the chosen profession when both are chosen", () => {
    expect(unlearnedToLoad(doc, filters({ crafter: "stitches", profession: "tailoring" }))).toEqual([197]);
  });

  it("fetches nothing for everyone and everything, to keep the page light", () => {
    expect(unlearnedToLoad(doc, filters())).toEqual([]);
  });

  it("fetches it straight away when the guild has a single profession", () => {
    expect(unlearnedToLoad({ ...doc, unlearned: [{ professionId: 164, count: 1 }] }, filters())).toEqual([164]);
  });

  it("fetches nothing when only available recipes are wanted", () => {
    expect(unlearnedToLoad(doc, filters({ profession: "tailoring", availableOnly: true }))).toEqual([]);
  });

  it("fetches nothing a profession has nothing left to learn in", () => {
    expect(unlearnedToLoad({ ...doc, unlearned: [] }, filters({ profession: "tailoring" }))).toEqual([]);
  });
});

describe("the link to a view", () => {
  it("carries the chosen crafter and profession", () => {
    const state = { filters: { ...DEFAULT_FILTERS, crafter: "damien", profession: "blacksmithing" }, recipeId: null };
    expect(serializeViewState(state)).toBe("crafter=damien&prof=blacksmithing");
    expect(parseViewState(new URLSearchParams("crafter=damien&prof=blacksmithing"))).toEqual(state);
  });

  it("means everyone and every profession when it names neither", () => {
    const { filters } = parseViewState(new URLSearchParams(""));
    expect([filters.crafter, filters.profession]).toEqual(["", ""]);
  });
});
