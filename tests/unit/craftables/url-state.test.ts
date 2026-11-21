import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/craftables/types";
import { NO_GEAR, parseViewState, serializeViewState } from "@/lib/craftables/url-state";

describe("serializeViewState", () => {
  it("produces an empty query for the default view", () => {
    expect(serializeViewState({ filters: DEFAULT_FILTERS, recipeId: null, gear: NO_GEAR })).toBe("");
  });

  it("writes only what differs from the default", () => {
    expect(
      serializeViewState({
        filters: { ...DEFAULT_FILTERS, search: "silver bar", slot: "Hands", tradeableOnly: true },
        recipeId: 3333,
        gear: NO_GEAR,
      }),
    ).toBe("q=silver+bar&slot=Hands&tradeable=1&recipe=3333");
  });

  it("writes level range and sort order", () => {
    expect(
      serializeViewState({ filters: { ...DEFAULT_FILTERS, minLevel: 20, maxLevel: 30, sort: "level" }, recipeId: null, gear: NO_GEAR }),
    ).toBe("min=20&max=30&sort=level");
  });
});

describe("parseViewState", () => {
  it("reads back what serializeViewState wrote", () => {
    const state = {
      filters: { ...DEFAULT_FILTERS, search: "silver", type: "Mail", stat: "Strength", minLevel: 10, maxLevel: 40, tradeableOnly: true, sort: "name" as const },
      recipeId: 1252277,
      gear: NO_GEAR,
    };
    expect(parseViewState(new URLSearchParams(serializeViewState(state)))).toEqual(state);
  });

  it("returns the default view for an empty query", () => {
    expect(parseViewState(new URLSearchParams(""))).toEqual({ filters: DEFAULT_FILTERS, recipeId: null, gear: NO_GEAR });
  });

  it("ignores values it does not understand instead of failing", () => {
    const state = parseViewState(new URLSearchParams("min=abc&max=-5&sort=sideways&recipe=1.5&tradeable=maybe"));
    expect(state).toEqual({ filters: DEFAULT_FILTERS, recipeId: null, gear: NO_GEAR });
  });
});

describe("who gear is chosen for", () => {
  it("is carried in the link", () => {
    const view = {
      filters: DEFAULT_FILTERS,
      recipeId: null,
      gear: { classSlug: "paladin", specSlug: "retribution", level: 31 },
    };
    expect(serializeViewState(view)).toBe("class=paladin&spec=retribution&lvl=31");
    expect(parseViewState(new URLSearchParams("class=paladin&spec=retribution&lvl=31"))).toEqual(view);
  });

  it("leaves the talent tree and level out when they are not chosen", () => {
    const gear = { classSlug: "mage", specSlug: "", level: null };
    expect(serializeViewState({ filters: DEFAULT_FILTERS, recipeId: null, gear })).toBe("class=mage");
    expect(parseViewState(new URLSearchParams("class=mage")).gear).toEqual(gear);
  });

  it("is nobody by default, and a tree or level without a class is not kept", () => {
    expect(parseViewState(new URLSearchParams("")).gear).toEqual(NO_GEAR);
    const stray = { classSlug: "", specSlug: "frost", level: 20 };
    expect(serializeViewState({ filters: DEFAULT_FILTERS, recipeId: null, gear: stray })).toBe("");
  });

  it("ignores a level that is not a number", () => {
    expect(parseViewState(new URLSearchParams("class=mage&lvl=abc")).gear.level).toBeNull();
  });
});
