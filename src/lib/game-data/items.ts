import {
  ARMOR_COLUMNS,
  ARMOR_SUBCLASS_SHIELD,
  BONDING_TAGS,
  INVENTORY_TYPE_TAGS,
  ITEM_CLASS_ARMOR,
  ITEM_CLASS_RECIPE,
  ITEM_CLASS_WEAPON,
  ITEM_FLAG2_CASTER_WEAPON,
  ITEM_TRIGGER_ON_EQUIP,
  ITEM_TRIGGER_ON_PROC,
  ITEM_TRIGGER_ON_USE,
  PRIMARY_STAT_ORDER,
  STAT_BUDGET_SLOT,
  STAT_TAGS,
  UNTRADEABLE_BONDINGS,
} from "./constants";
import { groupBy, indexBy, requireTable, type Row, type Tables } from "./tables";
import type { GameItem, ItemStat, TooltipLine, WeaponDamage } from "./types";

/** Lookup maps over the game tables, built once and shared by every builder. */
export interface GameDataIndex {
  tables: Tables;
  itemSparse: Map<number, Row>;
  item: Map<number, Row>;
  randPropPoints: Map<number, Row>;
  armorTotal: Map<number, Row>;
  armorQuality: Map<number, Row>;
  armorShield: Map<number, Row>;
  armorLocation: Map<number, Row>;
  damage: Record<string, Map<number, Row>>;
  subclass: Map<string, Row>;
  skillLine: Map<number, Row>;
  strings: Map<string, string>;
  appearanceIcon: Map<number, number>;
  itemEffects: Map<number, Row[]>;
  spellDescription: Map<number, string>;
}

/** Effect triggers the tooltip words, in the order it lists them. */
const EFFECT_LABEL_TAGS: [number, string][] = [
  [ITEM_TRIGGER_ON_EQUIP, "ITEM_SPELL_TRIGGER_ONEQUIP"],
  [ITEM_TRIGGER_ON_PROC, "ITEM_SPELL_TRIGGER_ONPROC"],
  [ITEM_TRIGGER_ON_USE, "ITEM_SPELL_TRIGGER_ONUSE"],
];

const DAMAGE_TABLES = [
  "ItemDamageOneHand",
  "ItemDamageOneHandCaster",
  "ItemDamageTwoHand",
  "ItemDamageTwoHandCaster",
  "ItemDamageRanged",
  "ItemDamageWand",
  "ItemDamageThrown",
];

export function indexGameData(tables: Tables): GameDataIndex {
  const strings = new Map<string, string>();
  for (const row of requireTable(tables, "GlobalStrings")) {
    strings.set(row.BaseTag, row.TagText_lang);
  }

  const subclass = new Map<string, Row>();
  for (const row of requireTable(tables, "ItemSubClass")) {
    subclass.set(`${row.ClassID}:${row.SubClassID}`, row);
  }

  const appearance = indexBy(requireTable(tables, "ItemAppearance"), "ID");
  const appearanceIcon = new Map<number, number>();
  const modified = [...requireTable(tables, "ItemModifiedAppearance")].sort(
    (a, b) => Number(a.OrderIndex) - Number(b.OrderIndex),
  );
  for (const row of modified) {
    const itemId = Number(row.ItemID);
    if (appearanceIcon.has(itemId)) continue;
    const icon = Number(appearance.get(Number(row.ItemAppearanceID))?.DefaultIconFileDataID ?? 0);
    if (icon > 0) appearanceIcon.set(itemId, icon);
  }

  const damage: Record<string, Map<number, Row>> = {};
  for (const name of DAMAGE_TABLES) {
    damage[name] = indexBy(requireTable(tables, name), "ItemLevel");
  }

  return {
    tables,
    itemSparse: indexBy(requireTable(tables, "ItemSparse"), "ID"),
    item: indexBy(requireTable(tables, "Item"), "ID"),
    randPropPoints: indexBy(requireTable(tables, "RandPropPoints"), "ID"),
    armorTotal: indexBy(requireTable(tables, "ItemArmorTotal"), "ItemLevel"),
    armorQuality: indexBy(requireTable(tables, "ItemArmorQuality"), "ID"),
    armorShield: indexBy(requireTable(tables, "ItemArmorShield"), "ItemLevel"),
    armorLocation: indexBy(requireTable(tables, "ArmorLocation"), "ID"),
    damage,
    subclass,
    skillLine: indexBy(requireTable(tables, "SkillLine"), "ID"),
    strings,
    appearanceIcon,
    itemEffects: itemEffectsByItem(tables),
    spellDescription: new Map(
      requireTable(tables, "Spell").map((row) => [Number(row.ID), row.Description_lang]),
    ),
  };
}

/** The game rounds half up when it turns a budget into a whole number. */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function fill(template: string, ...values: (string | number)[]): string {
  let i = 0;
  return template.replace(/%[sd]/g, () => String(values[i++] ?? ""));
}

function budgetColumn(quality: number): string {
  if (quality >= 4) return "EpicF";
  if (quality === 3) return "SuperiorF";
  return "GoodF";
}

interface ComputedStats {
  stats: ItemStat[];
  complete: boolean;
}

function computeStats(index: GameDataIndex, sparse: Row): ComputedStats {
  const quality = Number(sparse.OverallQualityID);
  const slot = STAT_BUDGET_SLOT[Number(sparse.InventoryType)] ?? 0;
  const budgetRow = index.randPropPoints.get(Number(sparse.ItemLevel));
  const budget = Number(budgetRow?.[`${budgetColumn(quality)}_${slot}`] ?? 0);

  const stats: ItemStat[] = [];
  let complete = true;
  for (let i = 0; i < 10; i++) {
    const stat = Number(sparse[`StatModifier_bonusStat_${i}`]);
    const percent = Number(sparse[`StatPercentEditor_${i}`]);
    if (stat < 0 || percent === 0) continue;
    const value = roundHalfUp((budget * percent) / 10000);
    const tag = STAT_TAGS[stat];
    const name = tag ? index.strings.get(`ITEM_MOD_${tag}_SHORT`) : undefined;
    if (!tag || !name || !budgetRow) {
      complete = false;
      continue;
    }
    if (value !== 0) stats.push({ stat, name, value });
  }
  return { stats, complete };
}

function computeArmor(index: GameDataIndex, item: Row, sparse: Row): number | null {
  if (Number(item.ClassID) !== ITEM_CLASS_ARMOR) return null;
  const subclassId = Number(item.SubclassID);
  const itemLevel = Number(sparse.ItemLevel);
  const quality = Number(sparse.OverallQualityID);

  if (subclassId === ARMOR_SUBCLASS_SHIELD) {
    const armor = Number(index.armorShield.get(itemLevel)?.[`Quality_${quality}`] ?? 0);
    return armor > 0 ? roundHalfUp(armor) : null;
  }

  const columns = ARMOR_COLUMNS[subclassId];
  if (!columns) return null;
  // Robes share the chest slot's armor share.
  const inventoryType = Number(sparse.InventoryType) === 20 ? 5 : Number(sparse.InventoryType);
  const qualityMod = Number(index.armorQuality.get(itemLevel)?.[`Qualitymod_${quality}`] ?? 0);
  const total = Number(index.armorTotal.get(itemLevel)?.[columns.total] ?? 0);
  const location = Number(index.armorLocation.get(inventoryType)?.[columns.location] ?? 0);
  const armor = roundHalfUp(qualityMod * total * location);
  return armor > 0 ? armor : null;
}

function damageTableName(inventoryType: number, subclassId: number, caster: boolean): string | null {
  switch (inventoryType) {
    case 13:
    case 21:
    case 22:
      return caster ? "ItemDamageOneHandCaster" : "ItemDamageOneHand";
    case 17:
      return caster ? "ItemDamageTwoHandCaster" : "ItemDamageTwoHand";
    case 15:
    case 25:
    case 26:
      if (subclassId === 19) return "ItemDamageWand";
      if (subclassId === 16) return "ItemDamageThrown";
      return "ItemDamageRanged"; // bows, guns, crossbows
    default:
      return null;
  }
}

function computeDamage(index: GameDataIndex, item: Row, sparse: Row): WeaponDamage | null {
  if (Number(item.ClassID) !== ITEM_CLASS_WEAPON) return null;
  const delay = Number(sparse.ItemDelay);
  if (delay <= 0) return null;
  const caster = (Number(sparse.Flags_1) & ITEM_FLAG2_CASTER_WEAPON) !== 0;
  const table = damageTableName(Number(sparse.InventoryType), Number(item.SubclassID), caster);
  if (!table) return null;
  const quality = Number(sparse.OverallQualityID);
  const budgetDps = Number(index.damage[table].get(Number(sparse.ItemLevel))?.[`Quality_${quality}`] ?? 0);
  if (budgetDps <= 0) return null;

  const speed = delay / 1000;
  const average = budgetDps * speed;
  const variance = Number(sparse.DmgVariance);
  const min = Math.floor(average * (1 - variance / 2));
  const max = Math.floor(average * (1 + variance / 2) + 0.5);
  const dps = Math.round(((min + max) / 2 / speed) * 10) / 10;
  return { min, max, speed, dps };
}

function iconFor(index: GameDataIndex, item: Row): number {
  const own = Number(item.IconFileDataID);
  return own > 0 ? own : (index.appearanceIcon.get(Number(item.ID)) ?? 0);
}

/** The icon of any item the tables list, or 0 when there is none. */
export function itemIconFileId(index: GameDataIndex, itemId: number): number {
  const item = index.item.get(itemId);
  return item ? iconFor(index, item) : 0;
}

function slotName(index: GameDataIndex, inventoryType: number): string | null {
  const tag = INVENTORY_TYPE_TAGS[inventoryType];
  return (tag && index.strings.get(tag)) || null;
}

function typeName(index: GameDataIndex, item: Row): string | null {
  const classId = Number(item.ClassID);
  const subclassId = Number(item.SubclassID);
  const isTypedArmor = classId === ITEM_CLASS_ARMOR && subclassId !== 0;
  if (classId !== ITEM_CLASS_WEAPON && !isTypedArmor) return null;
  return index.subclass.get(`${classId}:${subclassId}`)?.DisplayName_lang || null;
}

function sortedForTooltip(stats: ItemStat[]): { white: ItemStat[]; green: ItemStat[] } {
  const white = stats
    .filter((s) => PRIMARY_STAT_ORDER.includes(s.stat))
    .sort((a, b) => PRIMARY_STAT_ORDER.indexOf(a.stat) - PRIMARY_STAT_ORDER.indexOf(b.stat));
  const green = stats.filter((s) => !PRIMARY_STAT_ORDER.includes(s.stat));
  return { white, green };
}

export function buildItem(index: GameDataIndex, itemId: number): GameItem | null {
  const sparse = index.itemSparse.get(itemId);
  const item = index.item.get(itemId);
  if (!sparse || !item) return null;

  const strings = index.strings;
  const quality = Number(sparse.OverallQualityID);
  const bonding = Number(sparse.Bonding);
  const inventoryType = Number(sparse.InventoryType);
  const requiredLevel = Number(sparse.RequiredLevel);
  const classId = Number(item.ClassID);

  const computed = computeStats(index, sparse);
  const stats = computed.stats;
  let complete = computed.complete;
  const armor = computeArmor(index, item, sparse);
  const damage = computeDamage(index, item, sparse);
  const slot = slotName(index, inventoryType);
  const type = typeName(index, item);

  const requiredSkillId = Number(sparse.RequiredSkill);
  const requiredSkill =
    requiredSkillId > 0
      ? { skillLineId: requiredSkillId, rank: Number(sparse.RequiredSkillRank) }
      : null;

  const tooltip: TooltipLine[] = [{ text: sparse.Display_lang, color: "quality" }];
  const white = (text: string, right?: string) =>
    tooltip.push(right ? { text, right, color: "white" } : { text, color: "white" });

  const bindText = strings.get(BONDING_TAGS[bonding] ?? "");
  if (bindText) white(bindText);

  const maxCount = Number(sparse.MaxCount);
  if (maxCount === 1) white(strings.get("ITEM_UNIQUE") ?? "Unique");
  else if (maxCount > 1) white(fill(strings.get("ITEM_UNIQUE_MULTIPLE") ?? "Unique (%d)", maxCount));

  if (slot) white(slot, type ?? undefined);

  if (damage) {
    white(
      fill(strings.get("DAMAGE_TEMPLATE") ?? "%s - %s Damage", damage.min, damage.max),
      `${strings.get("SPEED") ?? "Speed"} ${damage.speed.toFixed(2)}`,
    );
    white(fill(strings.get("DPS_TEMPLATE") ?? "(%s damage per second)", damage.dps.toFixed(1)));
  }
  if (armor) white(fill(strings.get("ARMOR_TEMPLATE") ?? "%s Armor", armor));

  const { white: whiteStats, green: greenStats } = sortedForTooltip(stats);
  for (const stat of whiteStats) {
    const sign = stat.value < 0 ? "-" : "+";
    white(`${sign}${Math.abs(stat.value)} ${stat.name}`);
  }

  if (requiredLevel > 1) {
    white(fill(strings.get("ITEM_MIN_LEVEL") ?? "Requires Level %d", requiredLevel));
  }
  if (requiredSkill) {
    const skillName = index.skillLine.get(requiredSkill.skillLineId)?.DisplayName_lang ?? "";
    white(fill(strings.get("ITEM_MIN_SKILL") ?? "Requires %s (%d)", skillName, requiredSkill.rank));
  }

  const equip = strings.get("ITEM_SPELL_TRIGGER_ONEQUIP") ?? "Equip:";
  for (const stat of greenStats) {
    const template = strings.get(`ITEM_MOD_${STAT_TAGS[stat.stat]}`) ?? "";
    tooltip.push({ text: `${equip} ${fill(template, stat.value)}`, color: "green" });
  }

  // Recipe items describe what they teach in their own description instead.
  const effects = classId === ITEM_CLASS_RECIPE ? [] : (index.itemEffects.get(itemId) ?? []);
  for (const [trigger, labelTag] of EFFECT_LABEL_TAGS) {
    for (const effect of effects) {
      if (Number(effect.TriggerType) !== trigger) continue;
      const text = index.spellDescription.get(Number(effect.SpellID));
      if (!text) continue;
      if (text.includes("$")) {
        // The text needs values looked up from other spell data; better absent than wrong.
        complete = false;
        continue;
      }
      tooltip.push({ text: `${strings.get(labelTag) ?? ""} ${text}`.trim(), color: "green" });
    }
  }

  const description = sparse.Description_lang;
  if (description) {
    if (classId === ITEM_CLASS_RECIPE) {
      const use = strings.get("ITEM_SPELL_TRIGGER_ONUSE") ?? "Use:";
      tooltip.push({ text: `${use} ${description}`, color: "green" });
    } else {
      tooltip.push({ text: `"${description}"`, color: "yellow" });
    }
  }

  return {
    id: itemId,
    name: sparse.Display_lang,
    quality,
    iconFileId: iconFor(index, item),
    classId,
    subclassId: Number(item.SubclassID),
    inventoryType,
    itemLevel: Number(sparse.ItemLevel),
    requiredLevel,
    bonding,
    tradeable: !UNTRADEABLE_BONDINGS.has(bonding),
    sellPrice: Number(sparse.SellPrice),
    slotName: slot,
    typeName: type,
    armor,
    damage,
    stats,
    requiredSkill,
    tooltip,
    tooltipComplete: complete,
  };
}

/** Rows of `ItemXItemEffect` joined to `ItemEffect`, grouped by item. */
export function itemEffectsByItem(tables: Tables): Map<number, Row[]> {
  const effects = indexBy(requireTable(tables, "ItemEffect"), "ID");
  const links = groupBy(requireTable(tables, "ItemXItemEffect"), "ItemID");
  const result = new Map<number, Row[]>();
  for (const [itemId, rows] of links) {
    const list: Row[] = [];
    for (const link of rows) {
      const effect = effects.get(Number(link.ItemEffectID));
      if (effect) list.push(effect);
    }
    result.set(itemId, list);
  }
  return result;
}
