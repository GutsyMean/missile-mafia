import { describe, expect, it } from "vitest";
import {
  BIS_INDEX_URL,
  DUNGEON_INDEX_URL,
  bisListUrl,
  collectGearSources,
  dungeonLootUrl,
  dungeonQuestsUrl,
  fetchGearSources,
  parseBisIndex,
  parseBisList,
  parseDungeonIndex,
  parseDungeonLoot,
  parseQuestSides,
} from "@/lib/game-data/gear-sources";
import { readFixture } from "../../helpers/fixtures";

const index = readFixture("gear/dungeon-index.html");
const lootPage = readFixture("gear/deadmines-loot.html");
const questsPage = readFixture("gear/deadmines-quests.html");
const hubPage = readFixture("gear/hub.html");
const bisIndex = readFixture("gear/bis-index.html");
const bisList = readFixture("gear/bis-list.html");

describe("parseDungeonIndex", () => {
  it("finds every dungeon the list links to, once", () => {
    expect(parseDungeonIndex(index)).toEqual(["blackrock-spire", "shadowfang-keep", "the-deadmines"]);
  });
});

describe("parseDungeonLoot", () => {
  const loot = parseDungeonLoot(lootPage)!;

  it("reads the dungeon's name", () => {
    expect(loot.name).toBe("The Deadmines");
  });

  it("reads each boss's drops, with the boss's own name and its place on the page", () => {
    expect(loot.drops.filter((drop) => drop.anchor === "rhahk-zor")).toEqual([
      { itemId: 273289, boss: "Rhahk'Zor", anchor: "rhahk-zor" },
      { itemId: 872, boss: "Rhahk'Zor", anchor: "rhahk-zor" },
      { itemId: 5187, boss: "Rhahk'Zor", anchor: "rhahk-zor" },
    ]);
    expect(loot.drops.find((drop) => drop.itemId === 5193)).toEqual({
      itemId: 5193,
      boss: "Edwin VanCleef",
      anchor: "edwin-vancleef",
    });
  });

  it("names no boss for drops that come from none in particular", () => {
    expect(loot.drops.find((drop) => drop.itemId === 5443)).toEqual({ itemId: 5443, boss: null, anchor: "other-drops" });
  });

  it("reads quest rewards with their quest, and does not count them as drops", () => {
    expect(loot.questRewards.filter((reward) => reward.questId === 214).map((reward) => reward.itemId)).toEqual([
      2074, 2089, 6094, 270005,
    ]);
    expect(loot.questRewards.find((reward) => reward.itemId === 6087)).toEqual({
      itemId: 6087,
      quest: "The Defias Brotherhood",
      questId: 166,
    });
    expect(loot.drops.some((drop) => drop.itemId === 2074)).toBe(false);
  });

  it("returns nothing for a page that lists no loot", () => {
    expect(parseDungeonLoot(hubPage)).toBeNull();
    expect(parseDungeonLoot("<html><body>gone</body></html>")).toBeNull();
  });
});

describe("parseQuestSides", () => {
  it("reads which side can do each quest", () => {
    const sides = parseQuestSides(questsPage);
    expect(sides.get(214)).toBe("alliance");
    expect(sides.get(95036)).toBe("horde");
    expect(sides.size).toBe(9);
  });

  it("leaves out quests both sides can do", () => {
    const table = '<table><tr><td><a href="#quest-7">Open to All</a></td><td>20</td><td>15</td><td>Both</td></tr></table>';
    expect(parseQuestSides(table).has(7)).toBe(false);
  });
});

describe("the best-in-slot lists", () => {
  it("finds every list the index links to", () => {
    expect(parseBisIndex(bisIndex)).toEqual(["paladin-protection", "paladin-retribution"]);
  });

  it("reads each item with what the list says of its source, leaving crafted pieces out", () => {
    expect(parseBisList(bisList)).toEqual([
      { itemId: 226989, source: "Tier 0.5 Questline" },
      { itemId: 2243, source: "World drop" },
      { itemId: 12602, source: "General Drakkisath" },
      { itemId: 279247, source: null },
    ]);
  });
});

describe("collectGearSources", () => {
  const dungeon = { slug: "the-deadmines", loot: parseDungeonLoot(lootPage)!, sides: parseQuestSides(questsPage) };
  const lists = [{ slug: "paladin-protection", rows: [...parseBisList(bisList), { itemId: 872, source: "The Deadmines" }] }];
  const sources = collectGearSources([dungeon], lists);

  it("says where a drop comes from, with a link to the boss on the page", () => {
    expect(sources[872]).toEqual([
      {
        kind: "drop",
        place: "The Deadmines",
        from: "Rhahk'Zor",
        url: "https://wowforever.be/guides/dungeons/the-deadmines/#rhahk-zor",
      },
    ]);
  });

  it("says which quest rewards an item, and which side can do it", () => {
    expect(sources[2074]).toEqual([
      {
        kind: "quest",
        place: "The Deadmines",
        from: "Red Silk Bandanas",
        faction: "alliance",
        url: "https://wowforever.be/guides/dungeons/the-deadmines/quests/#quest-214",
      },
    ]);
  });

  it("uses a list only for an item with no drop or quest known", () => {
    expect(sources[872]).toHaveLength(1);
    expect(sources[2243]).toEqual([
      {
        kind: "list",
        place: "Pre-raid best-in-slot list",
        from: "World drop",
        url: "https://wowforever.be/bis/forever/preraid/paladin-protection/",
      },
    ]);
    expect(sources[279247][0].from).toBeNull();
  });

  it("names a source once, however many times the pages repeat it", () => {
    const twice = collectGearSources([dungeon, dungeon], [...lists, ...lists]);
    expect(twice[872]).toHaveLength(1);
    expect(twice[2243]).toHaveLength(1);
  });
});

describe("fetchGearSources", () => {
  const pages: Record<string, string> = {
    [DUNGEON_INDEX_URL]: index,
    [dungeonLootUrl("the-deadmines")]: lootPage,
    [dungeonQuestsUrl("the-deadmines")]: questsPage,
    [dungeonLootUrl("shadowfang-keep")]: lootPage.replace("The Deadmines", "Shadowfang Keep"),
    [dungeonQuestsUrl("shadowfang-keep")]: questsPage,
    [dungeonLootUrl("blackrock-spire")]: hubPage,
    [BIS_INDEX_URL]: bisIndex,
    [bisListUrl("paladin-protection")]: bisList,
  };
  const serve = (overrides: Record<string, Response | undefined> = {}) => {
    const calls: string[] = [];
    return {
      calls,
      fetchFn: async (url: string) => {
        calls.push(url);
        if (url in overrides) return overrides[url] ?? new Response("gone", { status: 500 });
        return url in pages ? new Response(pages[url]) : new Response("missing", { status: 404 });
      },
    };
  };
  // The slices name fewer items than the real pages do, so a boss with plenty of drops is added before the quest rewards.
  const plenty = (html: string) =>
    html.replace(
      '<section id="quest-rewards"',
      `<section class="wf-dng__boss" id="extra"><h3>Extra</h3>${Array.from({ length: 120 }, (_, i) => `<a class="wf-item__name" href="/item=${900000 + i}">x</a>`).join("")}</section><section id="quest-rewards"`,
    );

  it("reads every dungeon and list, and skips a page with no loot or a list not written yet", async () => {
    const { fetchFn, calls } = serve({ [dungeonLootUrl("the-deadmines")]: new Response(plenty(lootPage)) });
    const { sources, warnings } = await fetchGearSources(fetchFn);
    expect(warnings).toEqual([]);
    // Both dungeons here are served the same loot, so the axe drops in each.
    expect(sources![872].map((source) => source.place)).toEqual(["Shadowfang Keep", "The Deadmines"]);
    expect(sources![872][1]).toMatchObject({ kind: "drop", from: "Rhahk'Zor" });
    expect(sources![2074][0]).toMatchObject({ kind: "quest", faction: "alliance" });
    expect(sources![2243][0]).toMatchObject({ kind: "list", from: "World drop" });
    // The hub page has no quests to ask about, and the list announced but not written is a plain 404.
    expect(calls).not.toContain(dungeonQuestsUrl("blackrock-spire"));
    expect(calls).toContain(bisListUrl("paladin-retribution"));
  });

  it("keeps what is known when a page cannot be read, and says which", async () => {
    const { fetchFn } = serve({ [dungeonLootUrl("shadowfang-keep")]: new Response("oops", { status: 503 }) });
    const { sources, warnings } = await fetchGearSources(fetchFn);
    expect(sources).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/left as it was.*dungeon shadowfang-keep: HTTP 503/);
  });

  it("keeps what is known when the list of dungeons itself cannot be read", async () => {
    const { fetchFn } = serve({ [DUNGEON_INDEX_URL]: new Response("oops", { status: 500 }) });
    const { sources, warnings } = await fetchGearSources(fetchFn);
    expect(sources).toBeNull();
    expect(warnings[0]).toMatch(/dungeon list: HTTP 500/);
  });

  it("does not trust pages that suddenly name almost nothing", async () => {
    const { sources, warnings } = await fetchGearSources(serve().fetchFn);
    expect(sources).toBeNull();
    expect(warnings[0]).toMatch(/named only \d+ items/);
  });
});
