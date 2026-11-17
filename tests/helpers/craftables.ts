import type { CraftablesDoc, ItemView, RecipeView } from "@/lib/craftables/types";

const item = (over: Partial<ItemView> & { id: number; name: string }): ItemView => ({
  quality: 1,
  iconFileId: 0,
  classId: 7,
  subclassId: 0,
  inventoryType: 0,
  itemLevel: 20,
  requiredLevel: 0,
  bonding: 0,
  tradeable: true,
  sellPrice: 0,
  slotName: null,
  typeName: null,
  armor: null,
  damage: null,
  stats: [],
  tooltip: [{ text: over.name, color: "quality" }],
  tooltipComplete: true,
  ...over,
});

const recipe = (over: Partial<RecipeView> & { id: number; name: string }): RecipeView => ({
  professionId: 164,
  iconFileId: 0,
  craftedItemId: null,
  craftedCount: 1,
  effectText: null,
  category: "Other",
  categoryOrder: 990,
  reagents: [],
  crafterIds: ["c1"],
  ...over,
});

/** A small hand-written document covering the cases the list logic must handle. */
export function sampleDoc(): CraftablesDoc {
  const items = [
    item({ id: 3483, name: "Silvered Bronze Gauntlets", quality: 2, classId: 4, subclassId: 3, inventoryType: 10, itemLevel: 27, requiredLevel: 22, bonding: 2, slotName: "Hands", typeName: "Mail", armor: 118,
      stats: [{ stat: 4, name: "Strength", value: 4 }, { stat: 7, name: "Stamina", value: 4 }, { stat: 6, name: "Spirit", value: 3 }] }),
    item({ id: 3842, name: "Green Iron Leggings", quality: 2, classId: 4, subclassId: 3, inventoryType: 7, itemLevel: 31, requiredLevel: 26, bonding: 2, slotName: "Legs", typeName: "Mail", armor: 176,
      stats: [{ stat: 4, name: "Strength", value: 8 }, { stat: 7, name: "Stamina", value: 8 }] }),
    item({ id: 250528, name: "Veteran's Silvered Chain Helm", quality: 3, classId: 4, subclassId: 3, inventoryType: 1, itemLevel: 25, requiredLevel: 20, bonding: 1, tradeable: false, slotName: "Head", typeName: "Mail", armor: 163,
      stats: [{ stat: 4, name: "Strength", value: 10 }, { stat: 7, name: "Stamina", value: 9 }] }),
    item({ id: 7958, name: "Bronze Battle Axe", quality: 2, classId: 2, subclassId: 1, inventoryType: 17, itemLevel: 27, requiredLevel: 22, bonding: 2, slotName: "Two-Hand", typeName: "Axe",
      damage: { min: 48, max: 73, speed: 3.3, dps: 18.3 }, stats: [{ stat: 4, name: "Strength", value: 10 }] }),
    item({ id: 7071, name: "Iron Buckle", itemLevel: 30 }),
    item({ id: 2841, name: "Bronze Bar" }),
    item({ id: 2842, name: "Silver Bar", quality: 2 }),
    item({ id: 3575, name: "Iron Bar" }),
  ];
  return {
    build: "1.60.1.70938",
    syncedAt: "2026-11-17T00:00:00Z",
    professions: [{ id: 164, slug: "blacksmithing", name: "Blacksmithing", iconFileId: 136241 }],
    crafters: [{ id: "c1", slug: "damien", characterName: "Damien", realm: null, faction: "Alliance", class: "Paladin", level: 24, note: "Whisper me in game", skills: { "164": 145 } }],
    recipes: [
      recipe({ id: 3333, name: "Silvered Bronze Gauntlets", craftedItemId: 3483, category: "Mail Armor", categoryOrder: 103, reagents: [[2841, 8], [2842, 1]] }),
      recipe({ id: 3506, name: "Green Iron Leggings", craftedItemId: 3842, category: "Mail Armor", categoryOrder: 103, reagents: [[3575, 8]] }),
      recipe({ id: 1252277, name: "Veteran's Silvered Chain Helm", craftedItemId: 250528, category: "Mail Armor", categoryOrder: 103, reagents: [[2841, 15], [2842, 4]] }),
      recipe({ id: 9987, name: "Bronze Battle Axe", craftedItemId: 7958, category: "Two-Handed Axes", categoryOrder: 201, reagents: [[2841, 14]] }),
      recipe({ id: 8768, name: "Iron Buckle", craftedItemId: 7071, craftedCount: 2, category: "Trade Goods", categoryOrder: 507, reagents: [[3575, 1]] }),
      recipe({ id: 7418, name: "Enchant Bracer - Inferior Stamina", professionId: 164, effectText: "Stamina +2", category: "Enchantments", categoryOrder: 900, reagents: [[99999, 1]] }),
    ],
    items: Object.fromEntries(items.map((i) => [String(i.id), i])),
  };
}

/**
 * The sample document plus recipes Damien has not learned: two trainer recipes
 * above his skill, a vendor plan, and one whose unlock level nobody has confirmed.
 */
export function sampleDocWithPending(): CraftablesDoc {
  const doc = sampleDoc();
  const pending = (over: Partial<RecipeView> & { id: number; name: string }) =>
    recipe({ crafterIds: [], pendingCrafterIds: ["c1"], category: "Mail Armor", categoryOrder: 103, ...over });
  doc.items["3844"] = item({ id: 3844, name: "Green Iron Hauberk", quality: 2, classId: 4, subclassId: 3, inventoryType: 5, requiredLevel: 31, slotName: "Chest", typeName: "Mail" });
  doc.items["3835"] = item({ id: 3835, name: "Green Iron Bracers", quality: 2, classId: 4, subclassId: 3, inventoryType: 9, requiredLevel: 28, slotName: "Wrist", typeName: "Mail" });
  doc.recipes.find((r) => r.id === 3333)!.learnSkill = 110;
  doc.recipes.push(
    pending({ id: 3508, name: "Green Iron Hauberk", craftedItemId: 3844, learnSkill: 180, acquisition: "trainer", acquisitionText: "Trainer · 75s" }),
    pending({ id: 3501, name: "Green Iron Bracers", craftedItemId: 3835, learnSkill: 165, acquisition: "trainer", acquisitionText: "Trainer · 50s" }),
    pending({ id: 5001, name: "Azure Skyforged Chain", learnSkill: 50, acquisition: "vendor", acquisitionText: "Vendor · Vayn Moongaze (Zephras Isle)" }),
    pending({ id: 5002, name: "Truesilver Gauntlets", learnSkill: null, acquisition: "trainer", acquisitionText: null, category: "Plate Armor", categoryOrder: 104 }),
  );
  return doc;
}
