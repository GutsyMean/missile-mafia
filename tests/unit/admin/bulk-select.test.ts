import { describe, expect, it } from "vitest";
import { planBulkSelect } from "@/lib/admin/bulk-select";
import type { CatalogRecipe } from "@/lib/admin/types";

const recipe = (over: Partial<CatalogRecipe> & { id: number }): CatalogRecipe => ({
  professionId: 164,
  name: `Recipe ${over.id}`,
  iconFileId: 0,
  quality: 2,
  tradeable: true,
  requiredLevel: 0,
  slotName: null,
  typeName: null,
  category: "Mail Armor",
  categoryOrder: 103,
  learnSkill: 100,
  learnStatus: "confirmed",
  learnCandidates: {},
  acquisition: "trainer",
  acquisitionText: null,
  questFactionWiki: null,
  questFactionOwner: null,
  trainingCost: null,
  skillYellow: 130,
  skillGrey: 160,
  firstSeenRunId: 1,
  ...over,
});

const plan = (recipes: CatalogRecipe[], skill = 145) => planBulkSelect(recipes, 164, skill);

describe("planBulkSelect — what is ticked without asking", () => {
  it("ticks trainer recipes whose confirmed unlock level is within the skill", () => {
    const result = plan([recipe({ id: 1, learnSkill: 110 }), recipe({ id: 2, learnSkill: 145 }), recipe({ id: 3, learnSkill: 146 })]);
    expect(result.sure).toEqual([1, 2]);
    expect(result.check).toEqual([]);
  });

  it("includes recipes known from the start", () => {
    expect(plan([recipe({ id: 1, acquisition: "starter", learnSkill: 1 })]).sure).toEqual([1]);
  });

  it("trusts a level the owner entered", () => {
    expect(plan([recipe({ id: 1, learnStatus: "owner", learnSkill: 120 })]).sure).toEqual([1]);
  });

  it("leaves out recipes that come from plans, vendors, drops or quests", () => {
    const result = plan([
      recipe({ id: 1, acquisition: "vendor", learnSkill: 50 }),
      recipe({ id: 2, acquisition: "drop", learnSkill: 50 }),
      recipe({ id: 3, acquisition: "quest", learnSkill: 50 }),
      recipe({ id: 4, acquisition: "drop vendor", learnSkill: 50 }),
    ]);
    expect(result).toEqual({ sure: [], check: [] });
  });

  it("only looks at the chosen profession", () => {
    expect(plan([recipe({ id: 1, professionId: 197, learnSkill: 10 })])).toEqual({ sure: [], check: [] });
  });
});

describe("planBulkSelect — what is put to the owner instead of guessed", () => {
  it("asks about a level only one source gives", () => {
    const result = plan([recipe({ id: 1, learnStatus: "single_source", learnSkill: 120 })]);
    expect(result).toEqual({ sure: [], check: [1] });
  });

  it("asks about a disputed recipe when either source would put it within the skill", () => {
    const within = recipe({ id: 1, learnStatus: "disputed", learnSkill: null, learnCandidates: { wowForever: 140, wiki: 160 } });
    const beyond = recipe({ id: 2, learnStatus: "disputed", learnSkill: null, learnCandidates: { wowForever: 220, wiki: 200 } });
    expect(plan([within, beyond])).toEqual({ sure: [], check: [1] });
  });

  it("asks about a trainer recipe with no known level if it could plausibly be learnable", () => {
    const near = recipe({ id: 1, learnStatus: "unconfirmed", learnSkill: null, skillYellow: 160 });
    const far = recipe({ id: 2, learnStatus: "unconfirmed", learnSkill: null, skillYellow: 250 });
    expect(plan([near, far])).toEqual({ sure: [], check: [1] });
  });

  it("never ticks a recipe whose level is not confirmed", () => {
    const result = plan([
      recipe({ id: 1, learnStatus: "single_source", learnSkill: 10 }),
      recipe({ id: 2, learnStatus: "disputed", learnSkill: null, learnCandidates: { wowForever: 1, wiki: 20 } }),
      recipe({ id: 3, learnStatus: "unconfirmed", learnSkill: null, skillYellow: 20 }),
    ]);
    expect(result.sure).toEqual([]);
    expect(result.check).toEqual([1, 2, 3]);
  });
});
