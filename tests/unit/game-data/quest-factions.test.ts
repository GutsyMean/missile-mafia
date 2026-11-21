import { describe, expect, it } from "vitest";
import {
  isAskable,
  parseQuestFaction,
  questFactionOf,
  questTitles,
  readQuestFactions,
  type WikiQuery,
} from "@/lib/game-data/quest-factions";

const page = (title: string, content: string) => ({ title, revisions: [{ slots: { main: { content } } }] });

// Opening sections as the Warcraft Wiki returns them.
const HORDE = "{{Questbox\n | name = Trampled Under Foot\n | faction = Horde\n | level = {{level|Thousand Needles}}\n}}";
const ALLIANCE = "{{Classic only|patch=4.0.3a}}\n{{Questbox\n | name = The Origins of Smithing\n | faction = Alliance\n | level = 40\n}}";
const NEUTRAL = "{{questbox\n| name= Deviate Eradication\n| faction= Neutral\n}}";
const UNSTATED = "{{Questbox\n | name = The Great Silver Deceiver\n | level = 45\n}}";
const ITEM = "{{#data:Itemtip\n|name=Kodo Hide Bag\n|quality=common\n}}";

describe("parseQuestFaction", () => {
  it("reads the faction from a quest page's infobox", () => {
    expect(parseQuestFaction(HORDE)).toBe("horde");
    expect(parseQuestFaction(ALLIANCE)).toBe("alliance");
    expect(parseQuestFaction(NEUTRAL)).toBe("neutral");
  });

  it("says nothing when the page does not state a faction", () => {
    expect(parseQuestFaction(UNSTATED)).toBeNull();
  });

  it("ignores pages that are not quests, even when they mention a faction", () => {
    expect(parseQuestFaction(ITEM)).toBeNull();
    expect(parseQuestFaction("{{Npcbox\n| name = Aturk the Anvil\n| faction = Horde\n}}")).toBeNull();
  });

  it("treats a quest open to both as neutral", () => {
    expect(parseQuestFaction("{{Questbox|name=X\n|faction=Both\n}}")).toBe("neutral");
  });
});

describe("readQuestFactions", () => {
  it("prefers the page named as a quest over an item of the same name", () => {
    const query: WikiQuery = {
      pages: [
        page("Kodo Hide Bag", ITEM),
        page("Kodo Hide Bag (quest)", "{{Questbox\n| name= Kodo Hide Bag\n| faction= Horde\n}}"),
        { title: "Trampled Under Foot (quest)", missing: true },
        page("Trampled Under Foot", HORDE),
      ],
    };
    expect(readQuestFactions(["Kodo Hide Bag", "Trampled Under Foot"], query)).toEqual({
      "Kodo Hide Bag": "horde",
      "Trampled Under Foot": "horde",
    });
  });

  it("follows the wiki's renames and redirects", () => {
    const query: WikiQuery = {
      normalized: [{ from: "joys of Omosh", to: "Joys of Omosh" }],
      redirects: [{ from: "Joys of Omosh", to: "Joys of Omosh (Horde)" }],
      pages: [page("Joys of Omosh (Horde)", HORDE)],
    };
    expect(readQuestFactions(["joys of Omosh"], query)).toEqual({ "joys of Omosh": "horde" });
  });

  it("leaves out quests with no page, no stated faction, or only a list of meanings", () => {
    const query: WikiQuery = {
      pages: [
        { title: "Crab Season", missing: true },
        { title: "Crab Season (quest)", missing: true },
        page("The Great Silver Deceiver", UNSTATED),
        page("Corruption", "{{For|other uses|Corruption (disambiguation)}}"),
      ],
    };
    expect(readQuestFactions(["Crab Season", "The Great Silver Deceiver", "Corruption"], query)).toEqual({});
  });
});

describe("questFactionOf", () => {
  const factions = { "Trampled Under Foot": "horde", "Wild Eyes": "horde", "My First Real Potion": "alliance", "Sweet Serenity": "neutral" } as const;

  it("marks a recipe whose only quest belongs to one faction", () => {
    expect(questFactionOf(["Trampled Under Foot"], factions)).toBe("horde");
    expect(questFactionOf(["My First Real Potion"], factions)).toBe("alliance");
  });

  it("does not mark a recipe each faction has its own quest for", () => {
    expect(questFactionOf(["My First Real Potion", "Wild Eyes"], factions)).toBeNull();
  });

  it("does not mark a recipe when one of its quests is unknown", () => {
    expect(questFactionOf(["Trampled Under Foot", "This Is Spinal Axe"], factions)).toBeNull();
    expect(questFactionOf(["The Quarry's Smith"], factions)).toBeNull();
  });

  it("does not mark neutral quests, or recipes with no quest named", () => {
    expect(questFactionOf(["Sweet Serenity"], factions)).toBeNull();
    expect(questFactionOf([], factions)).toBeNull();
  });
});

describe("asking the wiki", () => {
  it("asks for the quest page first, then the plain name", () => {
    expect(questTitles("Kodo Hide Bag")).toEqual(["Kodo Hide Bag (quest)", "Kodo Hide Bag"]);
  });

  it("skips names that would break a list of titles", () => {
    expect(isAskable("Enchanted Thorium Platemail: Volume I")).toBe(true);
    expect(isAskable("A | B")).toBe(false);
    expect(isAskable(" ")).toBe(false);
  });
});
