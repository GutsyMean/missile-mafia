import { describe, expect, it } from "vitest";
import { applyFilters, buildEntries, groupEntries } from "@/lib/craftables/filter";
import { factionNote, skillLabel, sourceLabel, sourceParts } from "@/lib/craftables/pending";
import { DEFAULT_FILTERS, type Filters } from "@/lib/craftables/types";
import { parseViewState, serializeViewState } from "@/lib/craftables/url-state";
import { sampleDoc, sampleDocWithPending } from "../../helpers/craftables";

const entries = buildEntries(sampleDocWithPending());
const names = (filters: Partial<Filters>) =>
  applyFilters(entries, { ...DEFAULT_FILTERS, ...filters }).map((e) => e.recipe.name);
const entry = (name: string) => entries.find((e) => e.recipe.name === name)!;

describe("recipes nobody has learned yet", () => {
  it("are marked as not available, with who could learn them", () => {
    const hauberk = entry("Green Iron Hauberk");
    expect(hauberk.available).toBe(false);
    expect(hauberk.crafters).toEqual([]);
    expect(hauberk.pending.map((c) => c.characterName)).toEqual(["Damien"]);
  });

  it("leave learned recipes available", () => {
    const gauntlets = entry("Silvered Bronze Gauntlets");
    expect(gauntlets.available).toBe(true);
    expect(gauntlets.pending).toEqual([]);
  });

  it("treat a document without the new fields as fully available", () => {
    expect(buildEntries(sampleDoc()).every((e) => e.available && e.pending.length === 0)).toBe(true);
  });

  it("are listed after the available recipes of their type, lowest skill first, unknown last", () => {
    expect(names({})).toEqual([
      "Veteran's Silvered Chain Helm",
      "Silvered Bronze Gauntlets",
      "Green Iron Leggings",
      "Azure Skyforged Chain",
      "Green Iron Bracers",
      "Green Iron Hauberk",
      "Truesilver Gauntlets",
      "Bronze Battle Axe",
      "Iron Buckle",
      "Enchant Bracer - Inferior Stamina",
    ]);
  });

  it("stay under their own type heading", () => {
    const groups = groupEntries(applyFilters(entries, DEFAULT_FILTERS), "category");
    expect(groups.map((g) => [g.category, g.entries.length])).toEqual([
      ["Mail Armor", 6],
      ["Plate Armor", 1],
      ["Two-Handed Axes", 1],
      ["Trade Goods", 1],
      ["Enchantments", 1],
    ]);
  });

  it("are hidden by Available now only", () => {
    expect(names({ availableOnly: true })).toEqual([
      "Veteran's Silvered Chain Helm",
      "Silvered Bronze Gauntlets",
      "Green Iron Leggings",
      "Bronze Battle Axe",
      "Iron Buckle",
      "Enchant Bracer - Inferior Stamina",
    ]);
  });

  it("still answer to the other filters", () => {
    expect(names({ slot: "Chest" })).toEqual(["Green Iron Hauberk"]);
    expect(names({ search: "skyforged" })).toEqual(["Azure Skyforged Chain"]);
  });
});

describe("skillLabel", () => {
  it("names the profession skill a recipe needs", () => {
    expect(skillLabel(entry("Green Iron Hauberk"))).toBe("Blacksmithing 180");
  });

  it("covers recipes that are already learned too", () => {
    expect(skillLabel(entry("Silvered Bronze Gauntlets"))).toBe("Blacksmithing 110");
  });

  it("is empty when no source has confirmed the skill", () => {
    expect(skillLabel(entry("Truesilver Gauntlets"))).toBeNull();
    expect(skillLabel(entry("Iron Buckle"))).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("prefers the full description of where a recipe comes from", () => {
    expect(sourceLabel({ acquisition: "vendor", acquisitionText: "Vendor · Vayn Moongaze (Zephras Isle)" })).toBe(
      "Vendor · Vayn Moongaze (Zephras Isle)",
    );
  });

  it("falls back to the kind of source", () => {
    expect(sourceLabel({ acquisition: "drop vendor", acquisitionText: null })).toBe("Drop Vendor");
    expect(sourceLabel({ acquisition: "starter", acquisitionText: null })).toBe("Known from the start");
    expect(sourceLabel({ acquisition: "unknown", acquisitionText: null })).toBe("Source not known yet");
  });
});

describe("the link to a view", () => {
  it("carries Available now only", () => {
    const view = { filters: { ...DEFAULT_FILTERS, availableOnly: true }, recipeId: null };
    expect(serializeViewState(view)).toBe("available=1");
    expect(parseViewState(new URLSearchParams("available=1"))).toEqual(view);
  });

  it("shows everything by default", () => {
    expect(parseViewState(new URLSearchParams("")).filters.availableOnly).toBe(false);
  });
});

describe("sourceParts", () => {
  it("splits the kind of source from the rest", () => {
    expect(sourceParts({ acquisition: "quest", acquisitionText: "Quest · Trampled Under Foot" })).toEqual({
      kind: "Quest",
      detail: "Trampled Under Foot",
    });
    expect(
      sourceParts({ acquisition: "quest vendor", acquisitionText: "Quest, Vendor · Saenorion (Darnassus) · Beasts of Thunder Ridge" }),
    ).toEqual({ kind: "Quest, Vendor", detail: "Saenorion (Darnassus) · Beasts of Thunder Ridge" });
  });

  it("has no detail when only the kind is known", () => {
    expect(sourceParts({ acquisition: "quest", acquisitionText: null })).toEqual({ kind: "Quest", detail: null });
  });
});

describe("factionNote", () => {
  it("says a recipe is for one faction only when its quest is the only way to get it", () => {
    expect(factionNote({ acquisition: "quest", questFaction: "horde" })).toEqual({
      faction: "horde",
      sole: true,
      text: "Horde only",
    });
    expect(factionNote({ acquisition: "quest", questFaction: "alliance" })?.text).toBe("Alliance only");
  });

  it("only speaks of the quest when there is another way to get the recipe", () => {
    expect(factionNote({ acquisition: "quest vendor", questFaction: "alliance" })).toEqual({
      faction: "alliance",
      sole: false,
      text: "Alliance-only quest",
    });
  });

  it("says nothing when the quest is open to both, or not known", () => {
    expect(factionNote({ acquisition: "quest" })).toBeNull();
    expect(factionNote({ acquisition: "quest", questFaction: null })).toBeNull();
  });
});
