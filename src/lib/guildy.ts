/**
 * Reads the file the "Guildy" guild window addon saves: what it has learned
 * about each guild member's professions, skill and recipes, from the members
 * themselves and from the recipe books of members who were online.
 *
 * The game writes it to WTF/Account/<account>/SavedVariables/Guildy.lua when a
 * character logs out or the interface reloads. Layout (the addon's Core/Store.lua):
 *
 *   GuildyDB.guilds["<guild>@<realm>"].members["<name in lower case>"] = {
 *     name = "First Last",
 *     profs = { [<skill line>] = { rank, max, recipes = { <spell id>, ... }, ts, src } },
 *   }
 *
 * `recipes` is missing while only the skill is known. `src` says where a
 * reading came from; "note" is a guess from a guild note and is left out.
 *
 * The guild's `families` say which characters are one player's, as the players'
 * own copies of the addon reported it: families["<name>"].chars = { "First Last", ... }.
 */
import { LuaReadError, isLuaTable, listOf, readLuaAssignments, tableAt, type LuaTable } from "./lua-table";

export interface GuildyProfession {
  skillLineId: number;
  skill: number;
  /** Null when the member's recipe book has not been read: only the skill is known. */
  spellIds: number[] | null;
  /** When the addon last read it, in seconds since 1970. Zero when the file does not say. */
  readAt: number;
}

export interface GuildyMember {
  name: string;
  professions: GuildyProfession[];
}

export interface GuildyGuild {
  /** As the file names it: "Guild@Realm". */
  key: string;
  name: string;
  realm: string | null;
  members: GuildyMember[];
  /** Characters the addon knows to be one player's, by name. Only players with more than one. */
  players: string[][];
}

export type GuildyFileProblem = "not_saved_data" | "not_guildy" | "no_guild";

export type GuildyFile = { ok: true; guilds: GuildyGuild[] } | { ok: false; problem: GuildyFileProblem };

const wholeNumber = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

function professionsOf(profs: LuaTable | null): GuildyProfession[] {
  const professions: GuildyProfession[] = [];
  for (const [key, record] of profs ?? []) {
    const skillLineId = wholeNumber(key, 1, 1_000_000);
    if (skillLineId === null || !isLuaTable(record) || record.get("src") === "note") continue;
    const skill = wholeNumber(record.get("rank"), 1, 450);
    if (skill === null) continue;
    const recipes = tableAt(record, "recipes");
    const spellIds = recipes
      ? [...new Set(listOf(recipes).filter((id): id is number => wholeNumber(id, 1, 2_000_000_000) !== null))]
      : null;
    professions.push({ skillLineId, skill, spellIds, readAt: wholeNumber(record.get("ts"), 0, 99_999_999_999) ?? 0 });
  }
  return professions.sort((a, b) => a.skillLineId - b.skillLineId);
}

/** The characters each family entry names, joined up into players. */
function playersOf(families: LuaTable | null): string[][] {
  /** Each name's player, as the name it is filed under; names are compared in lower case. */
  const leader = new Map<string, string>();
  const shown = new Map<string, string>();
  const find = (name: string): string => {
    let at = name;
    while (leader.get(at) !== at) at = leader.get(at) ?? at;
    return at;
  };
  for (const [key, family] of families ?? []) {
    if (!isLuaTable(family)) continue;
    const chars = tableAt(family, "chars");
    const names = (chars ? listOf(chars) : []).filter((name): name is string => typeof name === "string" && name.trim() !== "");
    const keys = [String(key), ...names].map((name) => name.trim().toLowerCase());
    names.forEach((name) => shown.set(name.trim().toLowerCase(), name.trim()));
    for (const name of keys) if (!leader.has(name)) leader.set(name, name);
    for (const name of keys) leader.set(find(name), find(keys[0]));
  }
  const players = new Map<string, string[]>();
  for (const name of leader.keys()) {
    const display = shown.get(name);
    if (!display) continue; // named only as a key: the file does not say how it is written
    const group = players.get(find(name)) ?? [];
    group.push(display);
    players.set(find(name), group);
  }
  return [...players.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** What a Guildy saved-data file holds, per guild. */
export function readGuildyFile(text: string): GuildyFile {
  let variables;
  try {
    variables = readLuaAssignments(text);
  } catch (error) {
    if (error instanceof LuaReadError) return { ok: false, problem: "not_saved_data" };
    throw error;
  }
  const db = variables.get("GuildyDB");
  if (!isLuaTable(db)) return { ok: false, problem: "not_guildy" };

  const guilds: GuildyGuild[] = [];
  for (const [key, guild] of tableAt(db, "guilds") ?? []) {
    if (typeof key !== "string" || !isLuaTable(guild)) continue;
    const members: GuildyMember[] = [];
    for (const [memberKey, member] of tableAt(guild, "members") ?? []) {
      if (!isLuaTable(member)) continue;
      const stored = member.get("name");
      const name = (typeof stored === "string" && stored.trim() !== "" ? stored : String(memberKey)).trim();
      if (name === "") continue;
      members.push({ name, professions: professionsOf(tableAt(member, "profs")) });
    }
    members.sort((a, b) => a.name.localeCompare(b.name));
    const split = key.lastIndexOf("@");
    guilds.push({
      key,
      name: split > 0 ? key.slice(0, split) : key,
      realm: split > 0 ? key.slice(split + 1) || null : null,
      members,
      players: playersOf(tableAt(guild, "families")),
    });
  }
  if (guilds.length === 0) return { ok: false, problem: "no_guild" };
  // The guild with the most members first: that is the one worth importing.
  guilds.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  return { ok: true, guilds };
}

export interface GuildyProfessionMatch {
  professionId: number;
  name: string;
  skill: number;
  /** Recipes of this profession the site knows. Null when the recipe book was not read. */
  recipes: number | null;
  readAt: number;
}

export interface GuildyMemberMatch {
  name: string;
  professions: GuildyProfessionMatch[];
  /** Recipes from the file that the site's database knows. */
  recipeIds: number[];
  /** Entries in the member's recipe books that match no recipe on the site. */
  unknownSpellIds: number[];
  /** When the newest of the readings was made, in seconds since 1970. */
  readAt: number;
}

/** Lines one member up against the site's professions and recipes. */
export function matchGuildyMember(
  member: GuildyMember,
  professions: { id: number; name: string; childSkillLineIds: number[] }[],
  /** Recipe id → profession id, for every recipe the site knows. */
  knownRecipes: ReadonlyMap<number, number>,
): GuildyMemberMatch {
  const matched = new Map<number, GuildyProfessionMatch>();
  const recipeIds = new Set<number>();
  const unknownSpellIds = new Set<number>();

  for (const read of member.professions) {
    const profession = professions.find((p) => p.id === read.skillLineId || p.childSkillLineIds.includes(read.skillLineId));
    if (!profession) continue;
    let recipes: number | null = read.spellIds ? 0 : null;
    for (const spellId of read.spellIds ?? []) {
      if (!knownRecipes.has(spellId)) unknownSpellIds.add(spellId);
      else if (!recipeIds.has(spellId)) {
        recipeIds.add(spellId);
        recipes = (recipes ?? 0) + 1;
      }
    }
    // A profession and its skill line for this version of the game can both be in the file: keep the better reading.
    const before = matched.get(profession.id);
    matched.set(profession.id, {
      professionId: profession.id,
      name: profession.name,
      skill: Math.max(read.skill, before?.skill ?? 0),
      recipes: before?.recipes == null ? recipes : before.recipes + (recipes ?? 0),
      readAt: Math.max(read.readAt, before?.readAt ?? 0),
    });
  }

  const list = [...matched.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    name: member.name,
    professions: list,
    recipeIds: [...recipeIds].sort((a, b) => a - b),
    unknownSpellIds: [...unknownSpellIds].sort((a, b) => a - b),
    readAt: Math.max(0, ...list.map((p) => p.readAt)),
  };
}

/** A name as it is compared: case, accents and spacing put aside. */
function tidy(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** How many single-letter changes turn one word into the other. */
function lettersApart(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Whether two names are probably one character although they are not written
 * the same: the profile was typed by hand, so its surname may be left out or
 * misspelt. A shared first name alone is not enough; one player's characters
 * often share theirs.
 */
function probablySame(fileName: string, profileName: string): boolean {
  const [first, ...rest] = tidy(fileName).split(" ");
  const [profileFirst, ...profileRest] = tidy(profileName).split(" ");
  if (first !== profileFirst) return false;
  if (profileRest.length === 0 || rest.length === 0) return true;
  return lettersApart(rest.join(" "), profileRest.join(" ")) <= 2;
}

export interface CrafterSuggestion {
  /** The crafter a member's data should go to, or null for a new crafter. */
  crafterId: string | null;
  /** "exact": the same name. "close": probably the same character, worth a look. */
  how: "exact" | "close" | "new";
}

/**
 * Pairs the members of a file with the crafters the site already has, so that
 * importing does not make a second crafter for the same character. Each
 * crafter is offered to one member at most.
 */
export function suggestCrafters(
  memberNames: string[],
  crafters: { id: string; characterName: string }[],
): Map<string, CrafterSuggestion> {
  const suggestions = new Map<string, CrafterSuggestion>();
  const taken = new Set<string>();

  for (const name of memberNames) {
    const exact = crafters.find((crafter) => !taken.has(crafter.id) && tidy(crafter.characterName) === tidy(name));
    if (exact) {
      taken.add(exact.id);
      suggestions.set(name, { crafterId: exact.id, how: "exact" });
    }
  }
  const unpaired = [...new Set(memberNames)].filter((name) => !suggestions.has(name));
  const spare = crafters.filter((crafter) => !taken.has(crafter.id));
  for (const name of unpaired) {
    const close = spare.filter((crafter) => probablySame(name, crafter.characterName));
    // Only when it is the one candidate, and no other member of the file fits it as well.
    const alone = close.length === 1 && unpaired.filter((other) => probablySame(other, close[0].characterName)).length === 1;
    suggestions.set(name, alone ? { crafterId: close[0].id, how: "close" } : { crafterId: null, how: "new" });
  }
  return suggestions;
}

/** One member as the import is asked to take them. */
export interface GuildImportMember {
  name: string;
  /** The crafter to add to, or null to create one. */
  crafterId: string | null;
  professions: { id: number; skill: number }[];
  recipeIds: number[];
}

/** What the import did, or would do, for one member. */
export interface GuildImportTally {
  name: string;
  crafterId: string | null;
  created: boolean;
  /** Recipes that joined the list: those from the file, and trainer recipes a higher skill brings. */
  recipesAdded: number;
  /** How many of those the file itself names. */
  recipesFromFile: number;
  /** Recipes from the file left out because the crafter took them off their own list. */
  recipesSkipped: number;
  skills: { professionId: number; from: number | null; to: number }[];
}

/**
 * One player's characters, as the import can point at them: members being
 * imported, by their place in the list sent, and crafters the site already has.
 */
export interface GuildImportPlayer {
  members: number[];
  crafterIds: string[];
}

/** The other characters of a member's player, by name. Empty when the file knows of none. */
export function samePlayer(name: string, players: string[][]): string[] {
  const group = players.find((names) => names.some((other) => tidy(other) === tidy(name)));
  return group ? group.filter((other) => tidy(other) !== tidy(name)) : [];
}

/**
 * Which of the file's players the site can record: those with at least two
 * characters it will have once the members sent are imported. A character not
 * being imported counts when a crafter of exactly that name is already there.
 */
export function playersToRecord(
  players: string[][],
  sent: GuildImportMember[],
  crafters: { id: string; characterName: string }[],
): GuildImportPlayer[] {
  const aimedAt = new Set(sent.flatMap((member) => member.crafterId ?? []));
  const recorded: GuildImportPlayer[] = [];
  for (const names of players) {
    const members: number[] = [];
    const crafterIds: string[] = [];
    for (const name of names) {
      const place = sent.findIndex((member) => tidy(member.name) === tidy(name));
      if (place >= 0) {
        members.push(place);
        continue;
      }
      const existing = crafters.filter((crafter) => tidy(crafter.characterName) === tidy(name) && !aimedAt.has(crafter.id));
      // Two crafters of one name: there is no telling which is meant, so neither is filed.
      if (existing.length === 1) crafterIds.push(existing[0].id);
    }
    if (members.length + crafterIds.length > 1) recorded.push({ members, crafterIds });
  }
  return recorded;
}

export function toImportMember(match: GuildyMemberMatch, crafterId: string | null): GuildImportMember {
  return {
    name: match.name,
    crafterId,
    professions: match.professions.map((p) => ({ id: p.professionId, skill: p.skill })),
    recipeIds: match.recipeIds,
  };
}
