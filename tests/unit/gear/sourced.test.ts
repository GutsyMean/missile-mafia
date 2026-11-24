import { describe, expect, it } from "vitest";
import { applyFilters, isCrafted, withSourcedGear } from "@/lib/craftables/filter";
import { DEFAULT_FILTERS, type Entry, type GearSource, type GearSourcesDoc, type ItemView } from "@/lib/craftables/types";
import { buildClasses } from "@/lib/game-data/classes";
import { rankGear, showSection } from "@/lib/gear/rank";
import { describeSource, ordinal, sourceKind, sourcePlace, sourcesFaction } from "@/lib/gear/sources";
import { loadFixtureTables } from "../../helpers/fixtures";

const classes = buildClasses(loadFixtureTables());
const paladin = classes.find((c) => c.slug === "paladin")!;
const warrior = classes.find((c) => c.slug === "warrior")!;
const STRENGTH = 4;

const item = (id: number, name: string, strength: number, over: Partial<ItemView> = {}): ItemView => ({
  id,
  name,
  quality: 3,
  iconFileId: 0,
  classId: 4,
  subclassId: 3,
  inventoryType: 5,
  itemLevel: 30,
  requiredLevel: 20,
  bonding: 1,
  tradeable: false,
  sellPrice: 0,
  slotName: "Chest",
  typeName: "Mail",
  armor: 200,
  damage: null,
  stats: [{ stat: STRENGTH, name: "Strength", value: strength }],
  tooltip: [],
  tooltipComplete: true,
  ...over,
});

const craftedEntry = (made: ItemView, available: boolean): Entry => ({
  recipe: {
    id: made.id + 1000,
    professionId: 164,
    name: made.name,
    iconFileId: 0,
    craftedItemId: made.id,
    craftedCount: 1,
    effectText: null,
    category: "Mail Armor",
    categoryOrder: 103,
    reagents: [],
    crafterIds: [],
  },
  item: made,
  reagents: [],
  searchText: made.name.toLowerCase(),
  crafters: [],
  pending: [],
  available,
  professionName: "Blacksmithing",
  professionSlug: "blacksmithing",
});

const drop: GearSource = { kind: "drop", place: "Razorfen Kraul", from: "Overlord Ramtusk", url: "https://wowforever.be/k#b" };
const hordeQuest: GearSource = { kind: "quest", place: "Shadowfang Keep", from: "The Book of Ur", faction: "horde", url: "https://wowforever.be/q" };
const allianceQuest: GearSource = { ...hordeQuest, from: "The Crone", faction: "alliance" };
const listed: GearSource = { kind: "list", place: "Pre-raid best-in-slot list", from: "World drop", url: "https://wowforever.be/l" };

const breastplate = item(1, "Shining Silver Breastplate", 14, { tradeable: true, bonding: 2 });
const hauberk = item(2, "Green Iron Hauberk", 7, { tradeable: true, bonding: 2 });
const avenger = item(10, "Avenger's Armor", 15);
const martyr = item(11, "Martyr's Chain", 16);
const phantom = item(12, "Phantom Armor", 17);
const entries = [craftedEntry(breastplate, true), craftedEntry(hauberk, false)];
const gear: GearSourcesDoc = {
  items: { 10: avenger, 11: martyr, 12: phantom, 1: breastplate },
  sources: { 10: [drop], 11: [hordeQuest], 12: [listed], 1: [drop], 999: [drop] },
};

describe("withSourcedGear", () => {
  const all = withSourcedGear(entries, gear);

  it("adds gear that is not crafted as rows of its own, there for the taking", () => {
    const added = all.filter((entry) => !isCrafted(entry));
    expect(added.map((entry) => entry.recipe.name)).toEqual(["Avenger's Armor", "Martyr's Chain", "Phantom Armor"]);
    expect(added[0]).toMatchObject({ available: true, sources: [drop], professionSlug: null, crafters: [] });
    expect(added[0].recipe.id).toBe(-10);
  });

  it("keeps the recipe of a piece that is crafted as well, and notes its other source", () => {
    const crafted = all.find((entry) => entry.item?.id === 1)!;
    expect(isCrafted(crafted)).toBe(true);
    expect(crafted.sources).toEqual([drop]);
    expect(all.filter((entry) => entry.item?.id === 1)).toHaveLength(1);
  });

  it("leaves out a source whose item is not there, and changes nothing while the gear has not arrived", () => {
    expect(all.some((entry) => entry.recipe.id === -999)).toBe(false);
    expect(withSourcedGear(entries, null)).toBe(entries);
  });

  it("can be searched by where it comes from", () => {
    const found = applyFilters(all, { ...DEFAULT_FILTERS, search: "ramtusk" });
    expect(found.map((entry) => entry.recipe.name)).toEqual(["Avenger's Armor"]);
  });
});

describe("filters, with gear that is not crafted in the list", () => {
  const all = withSourcedGear(entries, gear);
  const names = (filters: Partial<typeof DEFAULT_FILTERS>) =>
    applyFilters(all, { ...DEFAULT_FILTERS, sort: "name", ...filters }).map((entry) => entry.recipe.name);

  it("keeps it when a profession is chosen, since it is there to compare with", () => {
    expect(names({ profession: "tailoring" })).toEqual(["Avenger's Armor", "Martyr's Chain", "Phantom Armor"]);
  });

  it("keeps it under Tradeable only: a drop binds to the one who picks it up", () => {
    expect(names({ tradeableOnly: true })).toContain("Avenger's Armor");
  });

  it("keeps it under Available now only, which is about what the guild can craft", () => {
    expect(names({ availableOnly: true })).toEqual([
      "Avenger's Armor",
      "Martyr's Chain",
      "Phantom Armor",
      "Shining Silver Breastplate",
    ]);
  });
});

describe("rankGear, with gear that is not crafted", () => {
  const all = withSourcedGear(entries, gear);

  const [chest] = rankGear(all, paladin, 31, ["strength"]);
  const shown = (view?: Parameters<typeof showSection>[1]) => {
    const section = showSection(chest, view);
    return section.rows.map((ranked) => [ranked.entry.recipe.name, section.notes[ranked.entry.recipe.id] ?? ""]);
  };

  it("gives every piece in the running its place", () => {
    expect(chest.ranked.map((ranked) => [ranked.place, ranked.entry.recipe.name])).toEqual([
      [1, "Phantom Armor"],
      [2, "Martyr's Chain"],
      [3, "Avenger's Armor"],
      [4, "Shining Silver Breastplate"],
      [5, "Green Iron Hauberk"],
    ]);
  });

  it("shows the top three, and the best crafted piece too when none of them is crafted", () => {
    expect(shown()).toEqual([
      ["Phantom Armor", "Best"],
      ["Martyr's Chain", ""],
      ["Avenger's Armor", ""],
      ["Shining Silver Breastplate", "Best craftable · 4th"],
    ]);
    expect(showSection(chest).total).toBe(5);
  });

  it("does not repeat a crafted piece that made the top three", () => {
    const fewer = { ...gear, sources: { 10: [drop] } };
    const [section] = rankGear(withSourcedGear(entries, fewer), paladin, 31, ["strength"]);
    const { rows, notes } = showSection(section);
    expect(rows.map((ranked) => [ranked.entry.recipe.name, notes[ranked.entry.recipe.id] ?? ""])).toEqual([
      ["Avenger's Armor", "Best"],
      ["Shining Silver Breastplate", "Best craftable"],
      ["Green Iron Hauberk", ""],
    ]);
  });

  it("shows everything once the slot is opened, each piece past the third with its place", () => {
    expect(shown({ open: true })).toEqual([
      ["Phantom Armor", "Best"],
      ["Martyr's Chain", ""],
      ["Avenger's Armor", ""],
      ["Shining Silver Breastplate", "Best craftable · 4th"],
      ["Green Iron Hauberk", "5th"],
    ]);
  });

  it("shows what a search finds wherever it stands, with its true place", () => {
    const named = (name: string) => ({ only: (entry: { recipe: { name: string } }) => entry.recipe.name === name });
    expect(shown(named("Green Iron Hauberk"))).toEqual([["Green Iron Hauberk", "5th"]]);
    expect(shown(named("Martyr's Chain"))).toEqual([["Martyr's Chain", "2nd"]]);
    expect(shown(named("Phantom Armor"))).toEqual([["Phantom Armor", "Best"]]);
    expect(shown(named("Shining Silver Breastplate"))).toEqual([["Shining Silver Breastplate", "Best craftable · 4th"]]);
    expect(shown(named("Thunderfury"))).toEqual([]);
  });

  it("leaves out a piece whose every source opens above the character's level", () => {
    const late = { ...gear, sources: { ...gear.sources, 12: [{ ...listed, level: 60 }], 11: [{ ...hordeQuest, level: 48 }, { ...drop, level: 30 }] } };
    const names = (level: number) =>
      rankGear(withSourcedGear(entries, late), paladin, level, ["strength"])[0].ranked.map((ranked) => ranked.entry.recipe.name);
    // The list is for level 60; the chain has a quest from 48 but also drops from 30.
    expect(names(31)).toEqual(["Martyr's Chain", "Avenger's Armor", "Shining Silver Breastplate", "Green Iron Hauberk"]);
    expect(names(29)).toEqual(["Avenger's Armor", "Shining Silver Breastplate", "Green Iron Hauberk"]);
    expect(names(60)[0]).toBe("Phantom Armor");
  });

  it("keeps a class quest's reward to its class", () => {
    const classQuest = { ...allianceQuest, place: "Warrior class quests", forClass: "warrior", level: 20 };
    const forWarriors = { ...gear, sources: { ...gear.sources, 12: [classQuest] } };
    const all = withSourcedGear(entries, forWarriors);
    const names = (gameClass: typeof paladin) =>
      rankGear(all, gameClass, 31, ["strength"])[0].ranked.map((ranked) => ranked.entry.recipe.name);
    expect(names(paladin)).not.toContain("Phantom Armor");
    expect(names(warrior)[0]).toBe("Phantom Armor");
  });

  it("points out no best craftable piece when only crafted gear is ranked", () => {
    const [crafted] = rankGear(entries, paladin, 31, ["strength"]);
    expect(showSection(crafted).notes).toEqual({ [crafted.ranked[0].entry.recipe.id]: "Best" });
  });
});

describe("describing a source", () => {
  it("names the kind of source, and where to look", () => {
    expect([drop, hordeQuest, listed].map(sourceKind)).toEqual(["Drop", "Quest reward", "Listed"]);
    expect([drop, hordeQuest, listed].map(sourcePlace)).toEqual(["Razorfen Kraul", "Shadowfang Keep", "World drop"]);
    expect(sourcePlace({ ...listed, from: null })).toBe("Best-in-slot list");
  });

  it("writes a sentence around the link to the page that says so", () => {
    expect(describeSource(drop)).toEqual({ before: "Drops from ", link: "Overlord Ramtusk", after: " in Razorfen Kraul" });
    expect(describeSource({ ...drop, from: null })).toEqual({ before: "Drops in ", link: "Razorfen Kraul", after: "" });
    expect(describeSource(hordeQuest)).toEqual({
      before: "Reward of the quest ",
      link: "The Book of Ur",
      after: " in Shadowfang Keep",
    });
    expect(describeSource(listed)).toEqual({ before: "Named on the ", link: "pre-raid best-in-slot list", after: ": World drop" });
    expect(describeSource({ ...listed, from: null }).after).toBe("; where it comes from is not listed yet");
    expect(describeSource({ ...hordeQuest, level: 18 }).after).toBe(" in Shadowfang Keep, from level 18");
    expect(
      describeSource({ ...allianceQuest, place: "Paladin class quests", from: "Return to Delgren", forClass: "paladin", level: 22 }),
    ).toEqual({
      before: "Reward of the quest ",
      link: "Return to Delgren",
      after: ", one of the Paladin class quests, from level 22",
    });
    expect(describeSource({ ...allianceQuest, place: "Paladin class quests", from: null, forClass: "paladin" })).toEqual({
      before: "Reward of one of the ",
      link: "Paladin class quests",
      after: "",
    });
    expect(describeSource({ ...drop, from: null, level: 44 })).toEqual({
      before: "Drops in ",
      link: "Razorfen Kraul",
      after: ", from level 44",
    });
  });

  it("limits a piece to one side only when every way to get it is a quest for that side", () => {
    expect(sourcesFaction([hordeQuest])).toBe("horde");
    expect(sourcesFaction([hordeQuest, { ...hordeQuest, from: "Another" }])).toBe("horde");
    expect(sourcesFaction([hordeQuest, allianceQuest])).toBeNull();
    expect(sourcesFaction([hordeQuest, drop])).toBeNull();
    expect(sourcesFaction([drop])).toBeNull();
    expect(sourcesFaction([])).toBeNull();
  });

  it("counts places in words", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd",
    ]);
  });
});
