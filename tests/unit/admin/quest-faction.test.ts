import { describe, expect, it } from "vitest";
import { hasQuestSource, questFactionChoices, shownQuestFaction } from "@/lib/admin/quest-faction";

describe("shownQuestFaction", () => {
  it("shows what the wiki says until an admin says otherwise", () => {
    expect(shownQuestFaction({ questFactionWiki: "horde", questFactionOwner: null })).toBe("horde");
    expect(shownQuestFaction({ questFactionWiki: null, questFactionOwner: null })).toBeNull();
  });

  it("lets the admin's choice win", () => {
    expect(shownQuestFaction({ questFactionWiki: "horde", questFactionOwner: "alliance" })).toBe("alliance");
    expect(shownQuestFaction({ questFactionWiki: null, questFactionOwner: "horde" })).toBe("horde");
  });

  it("shows nothing when the admin says both factions can do the quest", () => {
    expect(shownQuestFaction({ questFactionWiki: "horde", questFactionOwner: "none" })).toBeNull();
  });
});

describe("questFactionChoices", () => {
  it("offers the wiki's answer first, then the three an admin can set", () => {
    expect(questFactionChoices({ questFactionWiki: "horde" })).toEqual([
      { value: "", label: "Wiki: Horde only" },
      { value: "horde", label: "Horde only" },
      { value: "alliance", label: "Alliance only" },
      { value: "none", label: "Both factions" },
    ]);
    expect(questFactionChoices({ questFactionWiki: null })[0]).toEqual({ value: "", label: "Wiki: not stated" });
  });
});

describe("hasQuestSource", () => {
  it("is true whenever a quest is one of the ways to get the recipe", () => {
    expect(hasQuestSource({ acquisition: "quest" })).toBe(true);
    expect(hasQuestSource({ acquisition: "drop quest fished" })).toBe(true);
    expect(hasQuestSource({ acquisition: "trainer" })).toBe(false);
    expect(hasQuestSource({ acquisition: "unknown" })).toBe(false);
  });
});
