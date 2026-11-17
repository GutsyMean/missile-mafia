import { describe, expect, it } from "vitest";
import { buildItem, indexGameData } from "@/lib/game-data/items";
import { loadFixtureTables } from "../../helpers/fixtures";

const index = indexGameData(loadFixtureTables());

describe("buildItem — tooltips taken from the owner's in-game screenshots", () => {
  it("Silvered Bronze Gauntlets", () => {
    const item = buildItem(index, 3483)!;
    expect(item.tooltip).toEqual([
      { text: "Silvered Bronze Gauntlets", color: "quality" },
      { text: "Binds when equipped", color: "white" },
      { text: "Hands", right: "Mail", color: "white" },
      { text: "118 Armor", color: "white" },
      { text: "+4 Strength", color: "white" },
      { text: "+4 Stamina", color: "white" },
      { text: "+3 Spirit", color: "white" },
      { text: "Requires Level 22", color: "white" },
    ]);
    expect(item.quality).toBe(2);
    expect(item.tooltipComplete).toBe(true);
  });

  it("Green Iron Leggings lists Strength before Stamina, as the game does", () => {
    const item = buildItem(index, 3842)!;
    expect(item.tooltip).toEqual([
      { text: "Green Iron Leggings", color: "quality" },
      { text: "Binds when equipped", color: "white" },
      { text: "Legs", right: "Mail", color: "white" },
      { text: "176 Armor", color: "white" },
      { text: "+8 Strength", color: "white" },
      { text: "+8 Stamina", color: "white" },
      { text: "Requires Level 26", color: "white" },
    ]);
  });

  it("Shining Silver Breastplate", () => {
    const item = buildItem(index, 2870)!;
    expect(item.tooltip).toEqual([
      { text: "Shining Silver Breastplate", color: "quality" },
      { text: "Binds when equipped", color: "white" },
      { text: "Chest", right: "Mail", color: "white" },
      { text: "214 Armor", color: "white" },
      { text: "+14 Strength", color: "white" },
      { text: "+6 Stamina", color: "white" },
      { text: "Requires Level 24", color: "white" },
    ]);
    expect(item.quality).toBe(3);
  });
});

describe("buildItem — binding and tradeability", () => {
  it("marks a Bind on Pickup craft as not tradeable", () => {
    const helm = buildItem(index, 250528)!;
    expect(helm.name).toBe("Veteran's Silvered Chain Helm");
    expect(helm.tooltip[1]).toEqual({ text: "Binds when picked up", color: "white" });
    expect(helm.tradeable).toBe(false);
  });

  it("marks a Bind on Equip craft as tradeable", () => {
    expect(buildItem(index, 3483)!.tradeable).toBe(true);
  });

  it("treats an item with no binding as tradeable and shows no binding line", () => {
    const buckle = buildItem(index, 7071)!;
    expect(buckle.tradeable).toBe(true);
    expect(buckle.tooltip).toEqual([{ text: "Iron Buckle", color: "quality" }]);
  });
});

describe("buildItem — fields used for filtering and display", () => {
  it("exposes slot, armor type, levels, sell price and stats", () => {
    const item = buildItem(index, 3483)!;
    expect(item).toMatchObject({
      id: 3483,
      slotName: "Hands",
      typeName: "Mail",
      itemLevel: 27,
      requiredLevel: 22,
      armor: 118,
      sellPrice: 965,
      stats: [
        { stat: 4, name: "Strength", value: 4 },
        { stat: 7, name: "Stamina", value: 4 },
        { stat: 6, name: "Spirit", value: 3 },
      ],
    });
  });

  it("takes the icon from the item row", () => {
    expect(buildItem(index, 3483)!.iconFileId).toBe(132939);
  });

  it("falls back to the appearance icon when the item row has none", () => {
    expect(buildItem(index, 250528)!.iconFileId).toBe(133141);
  });

  it("returns null for an item the game tables do not describe", () => {
    expect(buildItem(index, 234458)).toBeNull();
  });
});

describe("buildItem — weapons", () => {
  it("shows slot, type, damage range, speed and damage per second", () => {
    const axe = buildItem(index, 7958)!;
    expect(axe.tooltip).toEqual([
      { text: "Bronze Battle Axe", color: "quality" },
      { text: "Binds when equipped", color: "white" },
      { text: "Two-Hand", right: "Axe", color: "white" },
      { text: "48 - 73 Damage", right: "Speed 3.30", color: "white" },
      { text: "(18.3 damage per second)", color: "white" },
      { text: "+10 Strength", color: "white" },
      { text: "Requires Level 22", color: "white" },
    ]);
    expect(axe.damage).toEqual({ min: 48, max: 73, speed: 3.3, dps: 18.3 });
    expect(axe.armor).toBeNull();
  });
});

describe("buildItem — stats beyond the five primary ones", () => {
  it("renders them as green Equip lines after the level requirement", () => {
    const helm = buildItem(index, 250531)!;
    expect(helm.name).toBe("Acolyte's Silvered Chain Helm");
    expect(helm.tooltip.slice(3)).toEqual([
      { text: "163 Armor", color: "white" },
      { text: "+9 Stamina", color: "white" },
      { text: "Requires Level 20", color: "white" },
      {
        text: "Equip: Increases damage done by magical spells and effects by up to 7.",
        color: "green",
      },
      {
        text: "Equip: Increases healing done by magical spells and effects by up to 21.",
        color: "green",
      },
    ]);
  });
});

describe("buildItem — shields", () => {
  it("uses the shield armor table", () => {
    const shield = buildItem(index, 22198)!;
    expect(shield.slotName).toBe("Off Hand");
    expect(shield.typeName).toBe("Shield");
    expect(shield.armor).toBeGreaterThan(1000);
  });
});

describe("buildItem — recipe items", () => {
  it("shows the profession requirement and what the plans teach", () => {
    const plans = buildItem(index, 251380)!;
    expect(plans.tooltip).toEqual([
      { text: "Plans: Veteran's Silvered Chain Helm", color: "quality" },
      { text: "Binds when picked up", color: "white" },
      { text: "Requires Blacksmithing (95)", color: "white" },
      { text: "Use: Teaches you how to craft Veteran's Silvered Chain Helm.", color: "green" },
    ]);
    expect(plans.requiredSkill).toEqual({ skillLineId: 164, rank: 95 });
  });
});
