import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/craftables/types";
import { parseViewState, serializeViewState } from "@/lib/craftables/url-state";

describe("serializeViewState", () => {
  it("produces an empty query for the default view", () => {
    expect(serializeViewState({ filters: DEFAULT_FILTERS, recipeId: null })).toBe("");
  });

  it("writes only what differs from the default", () => {
    expect(
      serializeViewState({
        filters: { ...DEFAULT_FILTERS, search: "silver bar", slot: "Hands", tradeableOnly: true },
        recipeId: 3333,
      }),
    ).toBe("q=silver+bar&slot=Hands&tradeable=1&recipe=3333");
  });

  it("writes level range and sort order", () => {
    expect(
      serializeViewState({ filters: { ...DEFAULT_FILTERS, minLevel: 20, maxLevel: 30, sort: "level" }, recipeId: null }),
    ).toBe("min=20&max=30&sort=level");
  });
});

describe("parseViewState", () => {
  it("reads back what serializeViewState wrote", () => {
    const state = {
      filters: { ...DEFAULT_FILTERS, search: "silver", type: "Mail", stat: "Strength", minLevel: 10, maxLevel: 40, tradeableOnly: true, sort: "name" as const },
      recipeId: 1252277,
    };
    expect(parseViewState(new URLSearchParams(serializeViewState(state)))).toEqual(state);
  });

  it("returns the default view for an empty query", () => {
    expect(parseViewState(new URLSearchParams(""))).toEqual({ filters: DEFAULT_FILTERS, recipeId: null });
  });

  it("ignores values it does not understand instead of failing", () => {
    const state = parseViewState(new URLSearchParams("min=abc&max=-5&sort=sideways&recipe=1.5&tradeable=maybe"));
    expect(state).toEqual({ filters: DEFAULT_FILTERS, recipeId: null });
  });
});
