import { requireTable, type Tables } from "./tables";
import type { GameClass } from "./types";

/** `SkillLine.CategoryID` of the skills that say what a class can wield and wear. */
const WEAPON_SKILLS = 6;
const ARMOR_SKILLS = 8;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The bit a class has in the game's class masks. */
export function classBit(classId: number): number {
  return 2 ** (classId - 1);
}

/** True when a class mask from the game tables includes the class. -1 means every class. */
function includesClass(mask: number, classId: number): boolean {
  return mask === -1 || Math.floor(mask / classBit(classId)) % 2 === 1;
}

/**
 * The playable classes: their talent trees, and which armour and weapons each
 * can use from which level (plate at 40 for a Paladin, say). All of it comes
 * from the game tables; nothing here is written by hand.
 */
export function buildClasses(tables: Tables): GameClass[] {
  const skillLines = new Map(requireTable(tables, "SkillLine").map((row) => [Number(row.ID), row]));
  const talentTabs = [...requireTable(tables, "TalentTab")].sort(
    (a, b) => Number(a.OrderIndex) - Number(b.OrderIndex) || Number(a.ID) - Number(b.ID),
  );
  const skillInfo = requireTable(tables, "SkillRaceClassInfo");

  const classes: GameClass[] = [];
  for (const row of requireTable(tables, "ChrClasses")) {
    const id = Number(row.ID);
    if (!Number.isInteger(id) || id <= 0 || !row.Name_lang) continue;

    const specs = talentTabs
      .filter((tab) => Number(tab.ClassMask) > 0 && includesClass(Number(tab.ClassMask), id) && tab.Name_lang)
      .map((tab) => ({ id: Number(tab.ID), slug: slugify(tab.Name_lang), name: tab.Name_lang }));
    // A class nobody can put talent points in is not one a player can be.
    if (specs.length === 0) continue;

    // The same skill can be listed once per race; the earliest level is when the class can have it.
    const opensAt = new Map<number, number>();
    for (const info of skillInfo) {
      const skillLineId = Number(info.SkillID);
      const category = Number(skillLines.get(skillLineId)?.CategoryID);
      if (category !== WEAPON_SKILLS && category !== ARMOR_SKILLS) continue;
      if (!includesClass(Number(info.ClassMask), id)) continue;
      const minLevel = Math.max(1, Number(info.MinLevel) || 0);
      opensAt.set(skillLineId, Math.min(opensAt.get(skillLineId) ?? Infinity, minLevel));
    }

    classes.push({
      id,
      slug: slugify(row.Name_lang),
      name: row.Name_lang,
      specs,
      proficiencies: [...opensAt]
        .map(([skillLineId, minLevel]) => ({
          skillLineId,
          name: skillLines.get(skillLineId)?.DisplayName_lang ?? "",
          minLevel,
        }))
        .sort((a, b) => a.skillLineId - b.skillLineId),
    });
  }
  return classes.sort((a, b) => a.name.localeCompare(b.name));
}
