import {
  ITEM_TRIGGER_LEARN,
  PROFESSION_CATEGORIES,
  SPELL_EFFECT_CREATE_ITEM,
  SPELL_EFFECT_ENCHANT_HELD_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY,
} from "./constants";
import { indexGameData, itemIconFileId, type GameDataIndex } from "./items";
import { groupBy, indexBy, requireTable, type Row, type Tables } from "./tables";
import type { GameProfession, GameRecipe, RecipeReagent } from "./types";

const ENCHANT_EFFECTS = new Set([
  SPELL_EFFECT_ENCHANT_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY,
  SPELL_EFFECT_ENCHANT_HELD_ITEM,
]);

/** Resolves a skill line to the profession it belongs to, or null if it is not one. */
function professionOf(skillLines: Map<number, Row>, skillLineId: number): number | null {
  const line = skillLines.get(skillLineId);
  if (!line || !PROFESSION_CATEGORIES.has(Number(line.CategoryID))) return null;
  const parentId = Number(line.ParentSkillLineID);
  const profession = parentId > 0 ? skillLines.get(parentId) : line;
  // "[DNT]" (do not translate) marks the developers' internal test data.
  if (!profession || profession.DisplayName_lang.includes("[DNT]")) return null;
  return Number(profession.ID);
}

function reagentsOf(row: Row | undefined): RecipeReagent[] {
  if (!row) return [];
  const reagents: RecipeReagent[] = [];
  for (let i = 0; i < 8; i++) {
    const itemId = Number(row[`Reagent_${i}`]);
    const quantity = Number(row[`ReagentCount_${i}`]);
    if (itemId > 0 && quantity > 0) reagents.push({ itemId, quantity });
  }
  return reagents;
}

/** Recipe spell id → the item that teaches it (plans, pattern, schematic...). */
function teachingItems(tables: Tables, index: GameDataIndex): Map<number, number> {
  const effects = indexBy(requireTable(tables, "ItemEffect"), "ID");
  const bySpell = new Map<number, number>();
  for (const link of requireTable(tables, "ItemXItemEffect")) {
    const effect = effects.get(Number(link.ItemEffectID));
    if (!effect || Number(effect.TriggerType) !== ITEM_TRIGGER_LEARN) continue;
    const itemId = Number(link.ItemID);
    // Leftover duplicates from other game versions have no item description.
    if (!index.itemSparse.has(itemId)) continue;
    const spellId = Number(effect.SpellID);
    const current = bySpell.get(spellId);
    if (current === undefined || itemId < current) bySpell.set(spellId, itemId);
  }
  return bySpell;
}

export function buildRecipes(tables: Tables, index: GameDataIndex = indexGameData(tables)): GameRecipe[] {
  const names = indexBy(requireTable(tables, "SpellName"), "ID");
  const effectsBySpell = groupBy(requireTable(tables, "SpellEffect"), "SpellID");
  const reagentsBySpell = indexBy(requireTable(tables, "SpellReagents"), "SpellID");
  const enchantments = indexBy(requireTable(tables, "SpellItemEnchantment"), "ID");
  const spellIcons = indexBy(requireTable(tables, "SpellMisc"), "SpellID");
  const teachers = teachingItems(tables, index);

  const recipes = new Map<number, GameRecipe>();
  for (const ability of requireTable(tables, "SkillLineAbility")) {
    const spellId = Number(ability.Spell);
    const professionId = professionOf(index.skillLine, Number(ability.SkillLine));
    if (professionId === null || recipes.has(spellId)) continue;

    const effects = [...(effectsBySpell.get(spellId) ?? [])].sort(
      (a, b) => Number(a.EffectIndex) - Number(b.EffectIndex),
    );
    const create = effects.find((e) => Number(e.Effect) === SPELL_EFFECT_CREATE_ITEM);
    const enchant = effects.find((e) => ENCHANT_EFFECTS.has(Number(e.Effect)));
    const reagents = reagentsOf(reagentsBySpell.get(spellId));
    // Rank and specialisation spells sit in the same table but craft nothing.
    if (!create && !enchant && reagents.length === 0) continue;

    const craftedItemId = create ? Number(create.EffectItemType) || null : null;
    const effectText =
      !craftedItemId && enchant
        ? enchantments.get(Number(enchant.EffectMiscValue_0))?.Name_lang || null
        : null;

    const yellow = Number(ability.TrivialSkillLineRankLow);
    const grey = Number(ability.TrivialSkillLineRankHigh);

    const recipeItemId = teachers.get(spellId) ?? null;
    const recipeItem = recipeItemId ? index.itemSparse.get(recipeItemId) : undefined;
    const recipeItemSkill =
      recipeItem && Number(recipeItem.RequiredSkill) > 0 ? Number(recipeItem.RequiredSkillRank) : null;

    const itemIcon = craftedItemId ? itemIconFileId(index, craftedItemId) : 0;

    recipes.set(spellId, {
      id: spellId,
      professionId,
      name: names.get(spellId)?.Name_lang ?? `Spell ${spellId}`,
      craftedItemId,
      craftedCount: create ? Math.max(1, Math.round(Number(create.EffectBasePointsF))) : 1,
      effectText,
      skillYellow: yellow,
      skillGreen: Math.floor((yellow + grey) / 2),
      skillGrey: grey,
      recipeItemId,
      recipeItemSkill,
      reagents,
      iconFileId: itemIcon || Number(spellIcons.get(spellId)?.SpellIconFileDataID ?? 0),
      status: craftedItemId && !index.itemSparse.has(craftedItemId) ? "no_item_data" : "ok",
    });
  }
  return [...recipes.values()];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildProfessions(tables: Tables, recipes: GameRecipe[]): GameProfession[] {
  const used = new Set(recipes.map((r) => r.professionId));
  const lines = requireTable(tables, "SkillLine");
  return lines
    .filter((line) => used.has(Number(line.ID)))
    .map((line) => {
      const id = Number(line.ID);
      return {
        id,
        slug: slugify(line.DisplayName_lang),
        name: line.DisplayName_lang,
        iconFileId: Number(line.SpellIconFileID),
        childSkillLineIds: lines
          .filter((child) => Number(child.ParentSkillLineID) === id)
          .map((child) => Number(child.ID)),
      };
    });
}
