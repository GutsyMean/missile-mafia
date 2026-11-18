/**
 * Reads the text the "Guildon: Crafts & Recipes" addon produces with
 * `/gnc export`: one line per character listing its professions and the
 * recipes it has learned. Format (version 1), from the addon's Export.lua:
 *
 *   GNX1;<game F|E>;<name>;<realm>;<faction A|H|N>;<CLASS>;<level>;<stamp>;<profs>;<checksum>
 *   profs: <skill line>:<skill>:<max>:<recipe spell ids in base 36, comma separated>, joined by "/"
 */

export interface GuildonProfession {
  skillLineId: number;
  skill: number;
  maxSkill: number;
  spellIds: number[];
}

export interface GuildonCharacter {
  /** "F" for WoW Forever, "E" for Classic Era. */
  game: string;
  name: string;
  realm: string;
  faction: string;
  className: string;
  level: number;
  exportedAt: number;
  professions: GuildonProfession[];
}

export type GuildonErrorReason = "format" | "checksum" | "version" | "wrong_game";

export interface GuildonError {
  /** 1-based line among the non-empty lines pasted. */
  line: number;
  reason: GuildonErrorReason;
}

/** The addon's checksum: a rolling hash of everything before the last ";". */
export function guildonChecksum(text: string): string {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(text)) {
    hash = (hash * 31 + byte) % 4294967296;
  }
  return hash.toString(16).padStart(8, "0");
}

function parseProfessions(text: string): GuildonProfession[] | null {
  const professions: GuildonProfession[] = [];
  for (const piece of text.split("/")) {
    if (piece === "") continue;
    const match = piece.match(/^(\d+):(\d+):(\d+):([0-9a-zA-Z,]*)$/);
    if (!match) return null;
    professions.push({
      skillLineId: Number(match[1]),
      skill: Number(match[2]),
      maxSkill: Number(match[3]),
      spellIds: match[4]
        .split(",")
        .filter(Boolean)
        .map((code) => Number.parseInt(code, 36)),
    });
  }
  return professions;
}

function parseLine(line: string): GuildonCharacter | GuildonErrorReason {
  const split = line.match(/^(.*);([0-9a-f]{8})$/);
  if (!split) return "format";
  const [, head, checksum] = split;
  if (guildonChecksum(head) !== checksum) return "checksum";

  const fields = head.match(/^GNX(\d+);([FE]);([^;]*);([^;]*);([AHN]);([A-Z]*);(\d+);(\d+);(.*)$/);
  if (!fields) return "format";
  const [, version, game, name, realm, faction, className, level, stamp, profs] = fields;
  if (Number(version) !== 1) return "version";
  if (game !== "F") return "wrong_game";

  const professions = parseProfessions(profs);
  if (!professions) return "format";
  return {
    game,
    name,
    realm,
    faction,
    className,
    level: Number(level),
    exportedAt: Number(stamp),
    professions,
  };
}

export function parseGuildonExport(text: string): { characters: GuildonCharacter[]; errors: GuildonError[] } {
  const characters: GuildonCharacter[] = [];
  const errors: GuildonError[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  lines.forEach((line, index) => {
    const result = parseLine(line);
    if (typeof result === "string") errors.push({ line: index + 1, reason: result });
    else characters.push(result);
  });
  return { characters, errors };
}

export interface GuildonMatch {
  /** Recipes from the export that the site's database knows. */
  recipeIds: number[];
  /** Spell ids in the export that match no recipe on the site. */
  unknownSpellIds: number[];
  skills: { professionId: number; name: string; skill: number; recipes: number }[];
}

/** Lines an export up against the site's professions and recipes. */
export function matchGuildonExport(
  character: GuildonCharacter,
  professions: { id: number; name: string; childSkillLineIds: number[] }[],
  /** Recipe id → profession id, for every recipe the site knows. */
  knownRecipes: Map<number, number>,
): GuildonMatch {
  const recipeIds: number[] = [];
  const unknownSpellIds: number[] = [];
  const skills: GuildonMatch["skills"] = [];

  for (const exported of character.professions) {
    const profession = professions.find(
      (p) => p.id === exported.skillLineId || p.childSkillLineIds.includes(exported.skillLineId),
    );
    if (!profession) continue;
    let recipes = 0;
    for (const spellId of exported.spellIds) {
      if (knownRecipes.has(spellId)) {
        recipeIds.push(spellId);
        recipes++;
      } else {
        unknownSpellIds.push(spellId);
      }
    }
    skills.push({ professionId: profession.id, name: profession.name, skill: exported.skill, recipes });
  }
  return { recipeIds, unknownSpellIds, skills };
}

/** What importing one character's export would do to a crafter's list. */
export interface ImportPlan {
  /** Recipes in the export that are not on the list yet. */
  newRecipeIds: number[];
  /** Professions whose skill in the export differs from the profile. */
  skillChanges: { professionId: number; name: string; from: number | null; to: number }[];
  /**
   * The export names professions but not a single recipe. The addon records a
   * profession's recipes only once its window has been opened in game.
   */
  noRecipesRecorded: boolean;
  /** What there is to do: add recipes (and skills), only update skills, or nothing. */
  action: "recipes" | "skills" | "nothing";
}

export function planImport(
  match: GuildonMatch,
  /** Recipes already on the crafter's list. */
  ticked: ReadonlySet<number>,
  /** The crafter's skills now, by profession id. */
  currentSkills: Record<string, number>,
): ImportPlan {
  const newRecipeIds = match.recipeIds.filter((id) => !ticked.has(id));
  const skillChanges = match.skills
    .filter((entry) => currentSkills[String(entry.professionId)] !== entry.skill)
    .map((entry) => ({
      professionId: entry.professionId,
      name: entry.name,
      from: currentSkills[String(entry.professionId)] ?? null,
      to: entry.skill,
    }));
  return {
    newRecipeIds,
    skillChanges,
    noRecipesRecorded: match.skills.length > 0 && match.recipeIds.length === 0 && match.unknownSpellIds.length === 0,
    action: newRecipeIds.length > 0 ? "recipes" : skillChanges.length > 0 ? "skills" : "nothing",
  };
}

/**
 * Whether an export's character is the one a profile is for. Profiles are
 * typed by hand, so a missing or extra surname still counts as the same.
 */
export function sameCharacter(exportName: string, profileName: string): boolean {
  const tidy = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const first = (name: string) => tidy(name).split(" ")[0];
  return tidy(exportName) === tidy(profileName) || first(exportName) === first(profileName);
}
