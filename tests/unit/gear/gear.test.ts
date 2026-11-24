import { describe, expect, it } from "vitest";
import type { ClassView, Entry, ItemView } from "@/lib/craftables/types";
import { buildClasses } from "@/lib/game-data/classes";
import { SPEC_PRIORITIES, specPriority } from "@/lib/gear/priorities";
import { rankGear, scoreItem } from "@/lib/gear/rank";
import { slotsFor } from "@/lib/gear/slots";
import { ALL_GEAR_STATS, GEAR_STATS } from "@/lib/gear/stats";
import { canDualWield, canUse, isGear, skillToWear } from "@/lib/gear/usable";
import { loadFixtureTables } from "../../helpers/fixtures";

// The classes exactly as the sync builds them from the game tables.
const classes = buildClasses(loadFixtureTables());
const classOf = (slug: string) => classes.find((c) => c.slug === slug) as ClassView;
const paladin = classOf("paladin");
const warrior = classOf("warrior");
const mage = classOf("mage");
const rogue = classOf("rogue");
const hunter = classOf("hunter");

const STAT = { agility: 3, strength: 4, intellect: 5, stamina: 7, hit: 31, crit: 32, healing: 41, spellPower: 45 };

let nextId = 1;
/** An item for the tests; `stats` are [the game's stat id, value] pairs. */
function item(over: Omit<Partial<ItemView>, "stats"> & { stats?: [number, number][] } = {}): ItemView {
  const { stats = [], ...rest } = over;
  return {
    id: nextId++,
    name: "Item",
    quality: 2,
    iconFileId: 0,
    classId: 4,
    subclassId: 3,
    inventoryType: 5,
    itemLevel: 30,
    requiredLevel: 25,
    bonding: 2,
    tradeable: true,
    sellPrice: 0,
    slotName: "Chest",
    typeName: "Mail",
    armor: 200,
    damage: null,
    tooltip: [],
    tooltipComplete: true,
    ...rest,
    stats: stats.map(([stat, value]) => ({ stat, name: String(stat), value })),
  };
}

const entry = (name: string, made: ItemView, available = false): Entry => ({
  recipe: {
    id: made.id + 1000,
    professionId: 164,
    name,
    iconFileId: 0,
    craftedItemId: made.id,
    craftedCount: 1,
    effectText: null,
    category: "Mail Armor",
    categoryOrder: 103,
    reagents: [],
    crafterIds: [],
  },
  item: { ...made, name },
  reagents: [],
  searchText: name.toLowerCase(),
  crafters: [],
  pending: [],
  available,
  professionName: "Blacksmithing",
  professionSlug: "blacksmithing",
});

describe("the classes the sync builds", () => {
  it("are the nine playable ones, each with three talent trees", () => {
    expect(classes.map((c) => c.name)).toEqual([
      "Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior",
    ]);
    expect(classes.every((c) => c.specs.length === 3)).toBe(true);
    expect(paladin.specs.map((s) => s.slug)).toEqual(["holy", "protection", "retribution"]);
    expect(classOf("druid").specs.map((s) => s.slug)).toEqual(["balance", "feral-combat", "restoration"]);
  });

  it("know when each kind of armour opens to a class", () => {
    const opens = (gameClass: ClassView, name: string) => gameClass.proficiencies.find((p) => p.name === name)?.minLevel;
    expect(opens(paladin, "Mail")).toBe(1);
    expect(opens(paladin, "Plate Mail")).toBe(40);
    expect(opens(hunter, "Mail")).toBe(40);
    expect(opens(mage, "Leather")).toBeUndefined();
  });

  it("have an order of stats for every talent tree", () => {
    const trees = classes.flatMap((c) => c.specs.map((s) => `${c.slug}/${s.slug}`));
    expect(trees).toHaveLength(27);
    expect(trees.filter((tree) => !(tree in SPEC_PRIORITIES))).toEqual([]);
    expect(Object.keys(SPEC_PRIORITIES).filter((tree) => !trees.includes(tree))).toEqual([]);
  });

  it("only use stats the scoring knows, each once", () => {
    for (const [tree, { order }] of Object.entries(SPEC_PRIORITIES)) {
      expect(order.filter((stat) => !(stat in GEAR_STATS)), tree).toEqual([]);
      expect(new Set(order).size, tree).toBe(order.length);
    }
    expect(ALL_GEAR_STATS).toContain("weaponDamage");
  });

  it("say where each order comes from, and admit the two that are our own", () => {
    expect(specPriority("paladin", "retribution")?.guide).toBe("https://wowforever.be/classes/paladin/retribution/");
    expect(specPriority("druid", "feral-combat")?.guide).toBe("https://wowforever.be/classes/druid/feral/");
    const ours = Object.entries(SPEC_PRIORITIES).filter(([, priority]) => priority.guide === null).map(([tree]) => tree);
    expect(ours).toEqual(["paladin/protection", "druid/restoration"]);
    expect(specPriority("paladin", "a-tree-added-later")).toBeNull();
  });
});

describe("canUse", () => {
  const mail = item({ subclassId: 3, requiredLevel: 25 });
  const plate = item({ subclassId: 4, requiredLevel: 40 });

  it("needs the level the item asks for", () => {
    expect(canUse(paladin, 24, mail)).toBe(false);
    expect(canUse(paladin, 25, mail)).toBe(true);
  });

  it("needs the armour skill, from the level the class gets it", () => {
    expect(canUse(mage, 60, mail)).toBe(false);
    expect(canUse(hunter, 39, mail)).toBe(false);
    expect(canUse(hunter, 40, mail)).toBe(true);
    expect(canUse(paladin, 40, plate)).toBe(true);
    expect(canUse(paladin, 39, item({ subclassId: 4, requiredLevel: 30 }))).toBe(false);
  });

  it("needs the weapon skill", () => {
    const staff = item({ classId: 2, subclassId: 10, inventoryType: 17 });
    const polearm = item({ classId: 2, subclassId: 6, inventoryType: 17, requiredLevel: 10 });
    expect(canUse(paladin, 60, staff)).toBe(false);
    expect(canUse(mage, 60, staff)).toBe(true);
    expect(canUse(paladin, 19, polearm)).toBe(false);
    expect(canUse(paladin, 20, polearm)).toBe(true);
  });

  it("respects an item made for particular classes", () => {
    const justice = item({ classMask: 2 }); // Paladin only
    expect(canUse(paladin, 60, justice)).toBe(true);
    expect(canUse(warrior, 60, justice)).toBe(false);
    expect(canUse(warrior, 60, item({ classMask: null }))).toBe(true);
  });

  it("lets anyone wear what needs no skill, but keeps relics to their class", () => {
    const ring = item({ subclassId: 0, inventoryType: 11 });
    const libram = item({ subclassId: 7, inventoryType: 28 });
    expect(canUse(mage, 60, ring)).toBe(true);
    expect(canUse(paladin, 60, libram)).toBe(true);
    expect(canUse(warrior, 60, libram)).toBe(false);
  });

  it("knows who can wield two weapons, and from when", () => {
    expect(canDualWield(rogue, 9)).toBe(false);
    expect(canDualWield(rogue, 10)).toBe(true);
    expect(canDualWield(paladin, 60)).toBe(false);
  });
});

describe("skillToWear", () => {
  const line = (text: string) => ({ text, color: "white" as const });

  it("reads the profession a wearer must have from the tooltip", () => {
    const goggles = item({ tooltip: [line("Flying Tiger Goggles"), line("Requires Level 10"), line("Requires Engineering (100)")] });
    expect(skillToWear(goggles)).toBe("Engineering 100");
  });

  it("is nothing for gear that only asks for a level", () => {
    expect(skillToWear(item({ tooltip: [line("Requires Level 24")] }))).toBeNull();
    expect(skillToWear(item())).toBeNull();
  });
});

describe("isGear and slotsFor", () => {
  it("leaves out shirts, tabards, cosmetics and things that are not worn", () => {
    expect(isGear(item())).toBe(true);
    expect(isGear(item({ inventoryType: 4 }))).toBe(false);
    expect(isGear(item({ inventoryType: 19 }))).toBe(false);
    expect(isGear(item({ subclassId: 5 }))).toBe(false);
    expect(isGear(item({ classId: 0, inventoryType: 0 }))).toBe(false);
  });

  it("puts each item in its slot", () => {
    expect(slotsFor(item({ inventoryType: 20 }), false)).toEqual(["Chest"]);
    expect(slotsFor(item({ inventoryType: 14 }), false)).toEqual(["Off Hand"]);
    expect(slotsFor(item({ inventoryType: 26 }), false)).toEqual(["Ranged"]);
    expect(slotsFor(item({ inventoryType: 4 }), false)).toEqual([]);
  });

  it("offers a one-handed weapon for the off hand only to those who can wield two", () => {
    expect(slotsFor(item({ inventoryType: 13 }), false)).toEqual(["Main Hand"]);
    expect(slotsFor(item({ inventoryType: 13 }), true)).toEqual(["Main Hand", "Off Hand"]);
    expect(slotsFor(item({ inventoryType: 22 }), false)).toEqual([]);
  });
});

describe("scoreItem", () => {
  it("counts each stat for what it is worth, less the further down the order it is", () => {
    const chest = item({ stats: [[STAT.strength, 10], [STAT.stamina, 10]] });
    const { score, parts } = scoreItem(chest, "Chest", ["strength", "stamina"]);
    expect(parts).toEqual([
      { stat: "strength", label: "Strength", amount: 10, points: 10 },
      { stat: "stamina", label: "Stamina", amount: 10, points: 8 },
    ]);
    expect(score).toBe(18);
  });

  it("ignores stats the order does not ask for", () => {
    const chest = item({ stats: [[STAT.intellect, 20]] });
    expect(scoreItem(chest, "Chest", ["strength", "stamina"]).score).toBe(0);
  });

  it("counts spell power towards healing, and healing-only bonuses for half", () => {
    const robe = item({ stats: [[STAT.spellPower, 10], [STAT.healing, 20]] });
    expect(scoreItem(robe, "Chest", ["healing"]).parts).toEqual([
      { stat: "healing", label: "Spell power", amount: 10, points: 10 },
      { stat: "healing", label: "Healing power", amount: 20, points: 10 },
    ]);
  });

  it("counts a weapon's damage in the hands, and half of it in the off hand", () => {
    const sword = item({ classId: 2, subclassId: 7, inventoryType: 13, armor: null, damage: { min: 10, max: 20, speed: 2, dps: 10 } });
    expect(scoreItem(sword, "Main Hand", ["weaponDamage"]).score).toBe(40);
    expect(scoreItem(sword, "Off Hand", ["weaponDamage"]).score).toBe(20);
  });

  it("counts ranged damage only for a weapon that fires shots", () => {
    const gun = item({ classId: 2, subclassId: 3, inventoryType: 26, armor: null, damage: { min: 10, max: 20, speed: 2, dps: 10 } });
    const thrown = item({ classId: 2, subclassId: 16, inventoryType: 25, armor: null, damage: { min: 10, max: 20, speed: 2, dps: 10 } });
    expect(scoreItem(gun, "Ranged", ["rangedDamage"]).score).toBe(40);
    expect(scoreItem(thrown, "Ranged", ["rangedDamage"]).score).toBe(0);
  });

  it("falls back to the item's level when there is no order to go by", () => {
    expect(scoreItem(item({ itemLevel: 42 }), "Chest", null)).toEqual({ score: 42, parts: [] });
  });
});

describe("rankGear", () => {
  const order = specPriority("paladin", "retribution")!.order;
  const entries = [
    entry("Shining Silver Breastplate", item({ stats: [[STAT.strength, 14], [STAT.stamina, 6]], requiredLevel: 24 }), true),
    entry("Green Iron Hauberk", item({ stats: [[STAT.strength, 7], [STAT.stamina, 11]], requiredLevel: 31 })),
    entry("Steel Breastplate", item({ subclassId: 4, stats: [[STAT.strength, 30]], requiredLevel: 35 })),
    entry("Robe of Power", item({ subclassId: 1, stats: [[STAT.intellect, 2]], requiredLevel: 10 })),
    entry("Plain Vest", item({ subclassId: 1, requiredLevel: 5 })),
    entry("Green Iron Helm", item({ inventoryType: 1, stats: [[STAT.strength, 5]], requiredLevel: 29 }), true),
    entry("Moonsteel Broadsword", item({ classId: 2, subclassId: 8, inventoryType: 17, armor: null, requiredLevel: 31, damage: { min: 50, max: 80, speed: 3, dps: 24.7 } })),
    entry("Glimmering Staff", item({ classId: 2, subclassId: 10, inventoryType: 17, armor: null, requiredLevel: 25, damage: { min: 50, max: 80, speed: 3, dps: 30 } })),
    entry("Linen Shirt", item({ inventoryType: 4, stats: [[STAT.strength, 99]], requiredLevel: 1 })),
    entry("Enchant Bracer", item()),
  ];
  entries[entries.length - 1].item = null;

  const sections = rankGear(entries, paladin, 31, order, 3);
  const names = (slot: string) => sections.find((s) => s.slot === slot)?.ranked.map((r) => r.entry.recipe.name);

  it("lists the slots in the order of the character sheet", () => {
    expect(sections.map((s) => s.slot)).toEqual(["Head", "Chest", "Two-Hand"]);
  });

  it("ranks what the character can equip, best first, leaving out what offers nothing", () => {
    expect(names("Chest")).toEqual(["Shining Silver Breastplate", "Green Iron Hauberk", "Robe of Power"]);
    expect(sections.find((s) => s.slot === "Chest")?.candidates).toBe(3);
  });

  it("leaves out plate before 40, weapons the class cannot use, and shirts", () => {
    expect(names("Chest")).not.toContain("Steel Breastplate");
    expect(names("Two-Hand")).toEqual(["Moonsteel Broadsword"]);
    expect(sections.flatMap((s) => s.ranked).map((r) => r.entry.recipe.name)).not.toContain("Linen Shirt");
  });

  it("opens up more as the character levels", () => {
    const later = rankGear(entries, paladin, 40, order, 3);
    expect(later.find((s) => s.slot === "Chest")?.ranked[0].entry.recipe.name).toBe("Steel Breastplate");
  });

  it("cuts each slot to the number asked for, and says how many were in the running", () => {
    const one = rankGear(entries, paladin, 31, order, 1);
    const chest = one.find((s) => s.slot === "Chest")!;
    expect(chest.ranked).toHaveLength(1);
    expect(chest.candidates).toBe(3);
  });

  it("shows an item once when two recipes make it, preferring the one somebody can craft", () => {
    const gauntlets = item({ inventoryType: 10, stats: [[STAT.strength, 9]], requiredLevel: 30 });
    const twice = [entry("Golden Scale Gauntlets", gauntlets), { ...entry("Golden Scale Gauntlets", gauntlets, true), recipe: { ...entry("x", gauntlets).recipe, id: 4242, name: "Golden Scale Gauntlets" } }];
    const hands = rankGear(twice, paladin, 31, order, 3).find((s) => s.slot === "Hands")!;
    expect(hands.ranked).toHaveLength(1);
    expect(hands.ranked[0].entry.available).toBe(true);
    expect(hands.ranked[0].entry.recipe.id).toBe(4242);
  });

  it("ranks by item level for a talent tree with no order", () => {
    const plain = rankGear(entries, paladin, 31, null, 3);
    expect(plain.find((s) => s.slot === "Chest")?.ranked.map((r) => r.entry.recipe.name)).toHaveLength(3);
    expect(plain.find((s) => s.slot === "Chest")?.ranked.every((r) => r.score === 30)).toBe(true);
  });
});
