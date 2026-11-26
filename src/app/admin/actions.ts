"use server";

import { CRAFTABLES_TAG } from "@/lib/craftables/load";
import type { AdminCatalog, AdminDirectory, AdminSettings, QuestFactionChoice } from "@/lib/admin/types";
import { EVENTS_TAG, type GuildEvent } from "@/lib/events";
import { runSiteSync } from "@/lib/game-data/run";
import { matchGuildonExport, parseGuildonExport } from "@/lib/guildon";
import { LEDGER_LINES, type GuildImportMember, type GuildImportPlayer, type GuildImportTally, type GuildyBank } from "@/lib/guildy";
import { publish, settle } from "@/lib/publish";
import { createServerSupabase } from "@/lib/supabase/server";

/** What every action returns: either it worked, or a message the page can show. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

async function signedIn() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  return userId ? { supabase, userId } : null;
}

const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length <= 5000 && value.every((id) => Number.isInteger(id) && id > 0);

/**
 * Ticks and unticks recipes. Row level security only lets the crafter's owner do this.
 *
 * The site is not refreshed here: a run of ticks is many saves, and the page
 * asks for one refresh when the clicking pauses (`publishRecipes`). Should it
 * never get to ask, the site still catches up by itself a few seconds on.
 */
export async function saveRecipes(
  crafterId: string,
  add: number[],
  remove: number[],
  source: "manual" | "bulk" = "manual",
): Promise<ActionResult<{ added: number; removed: number }>> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to save.");
  if (!isIdList(add) || !isIdList(remove)) return fail("That list of recipes is not valid.");

  const { data, error } = await session.supabase.rpc("set_crafter_recipes", {
    p_crafter_id: crafterId,
    p_add: add,
    p_remove: remove,
    p_source: source,
  });
  if (error) return fail(error.message);
  settle(CRAFTABLES_TAG);
  return { ok: true, data: data as { added: number; removed: number } };
}

/** Puts the ticks saved so far on the site, once the clicking has paused. */
export async function publishRecipes(crafterId: string): Promise<ActionResult> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to save.");
  // Only someone with a crafter of their own has anything to put there.
  const { data, error } = await session.supabase.rpc("my_crafters");
  if (error) return fail(error.message);
  if (!((data ?? []) as { id: string }[]).some((crafter) => crafter.id === crafterId)) {
    return fail("You can only change your own crafter");
  }
  publish(CRAFTABLES_TAG);
  return { ok: true, data: undefined };
}

export interface ProfileInput {
  characterName: string;
  realm: string;
  faction: string;
  className: string;
  level: string;
  note: string;
  /** Profession id → skill, as typed. */
  skills: Record<string, string>;
}

type Session = NonNullable<Awaited<ReturnType<typeof signedIn>>>;

interface ParsedProfile {
  row: {
    character_name: string;
    realm: string | null;
    faction: string | null;
    class: string | null;
    level: number | null;
    note: string | null;
  };
  skills: { professionId: number; skill: number }[];
}

/** Checks what was typed before anything is written. */
function parseProfile(input: ProfileInput): ActionResult<ParsedProfile> {
  const characterName = typeof input?.characterName === "string" ? input.characterName.trim() : "";
  if (characterName.length < 1 || characterName.length > 40) return fail("Enter your character's name (up to 40 characters).");
  const note = String(input.note ?? "");
  if (note.length > 500) return fail("Keep the note under 500 characters.");
  const levelText = String(input.level ?? "").trim();
  const level = levelText === "" ? null : Number(levelText);
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 80)) return fail("Level must be a whole number.");
  const faction = input.faction === "Alliance" || input.faction === "Horde" ? input.faction : null;

  const skills: ParsedProfile["skills"] = [];
  for (const [professionId, text] of Object.entries(input.skills ?? {})) {
    if (String(text).trim() === "") continue;
    const skill = Number(text);
    if (!Number.isInteger(skill) || skill < 0 || skill > 450) return fail("Skill must be a whole number between 0 and 450.");
    skills.push({ professionId: Number(professionId), skill });
  }

  return {
    ok: true,
    data: {
      row: {
        character_name: characterName,
        realm: String(input.realm ?? "").trim().slice(0, 40) || null,
        faction,
        class: String(input.className ?? "").trim().slice(0, 20) || null,
        level,
        note: note.trim() || null,
      },
      skills,
    },
  };
}

async function writeProfile(session: Session, crafterId: string, profile: ParsedProfile): Promise<ActionResult> {
  const { error, count } = await session.supabase
    .from("crafters")
    .update(profile.row, { count: "exact" })
    .eq("id", crafterId);
  if (error) return fail(error.message);
  if (count === 0) return fail("That crafter is not yours to edit.");

  for (const { professionId, skill } of profile.skills) {
    const { error: skillError } = await session.supabase
      .from("crafter_professions")
      .upsert({ crafter_id: crafterId, profession_id: professionId, skill });
    if (skillError) return fail(skillError.message);
  }

  publish(CRAFTABLES_TAG);
  return { ok: true, data: undefined };
}

/** A crafter's whole recipe list. The API returns a page at a time, so read until a short page. */
async function recipeIdsOf(session: Session, crafterId: string): Promise<number[]> {
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await session.supabase
      .from("crafter_recipes")
      .select("recipe_id")
      .eq("crafter_id", crafterId)
      .order("recipe_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    ids.push(...(data ?? []).map((row) => row.recipe_id as number));
    if (!data || data.length < 1000) return ids;
  }
}

/**
 * Saves a profile. Raising a profession's skill makes the database add the
 * trainer recipes for the new level, so the list as it now stands is returned.
 */
export async function saveProfile(crafterId: string, input: ProfileInput): Promise<ActionResult<{ recipeIds: number[] }>> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to save.");
  const profile = parseProfile(input);
  if (!profile.ok) return profile;
  const written = await writeProfile(session, crafterId, profile.data);
  if (!written.ok) return written;
  return { ok: true, data: { recipeIds: await recipeIdsOf(session, crafterId) } };
}

/** What signing up led to: a new crafter, or a character already on the list that an admin will hand over. */
export type SignUpResult = { crafterId: string } | { held: string };

/**
 * Sign-up, and adding another character later: a member Discord confirmed (or
 * a site admin) creates a crafter profile of their own. The database refuses
 * anyone else. A character of that name that is already listed and managed by
 * nobody is not made a second time: the request waits for an admin.
 */
export async function signUpCrafter(input: ProfileInput): Promise<ActionResult<SignUpResult>> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to continue.");
  const profile = parseProfile(input);
  if (!profile.ok) return profile;

  const { data, error } = await session.supabase.rpc("signup_crafter", { p_character_name: profile.data.row.character_name });
  if (error) {
    return fail(
      error.code === "42501"
        ? "Discord has not confirmed this account as a guild member. Sign out, then sign in again once you have joined the server."
        : error.message,
    );
  }
  if (data === null) return { ok: true, data: { held: profile.data.row.character_name } };
  const written = await writeProfile(session, data as string, profile.data);
  return written.ok ? { ok: true, data: { crafterId: data as string } } : written;
}

/**
 * Adds the recipes a pasted addon export says one character has learned.
 * The text is parsed again here; nothing the browser worked out is trusted.
 */
export async function importGuildon(
  crafterId: string,
  text: string,
  characterName: string,
): Promise<ActionResult<{ added: number; unknown: number; recipeIds: number[] }>> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to import.");
  if (text.length > 200_000) return fail("That export is too large.");

  const { characters } = parseGuildonExport(text);
  const character = characters.find((c) => c.name === characterName);
  if (!character) return fail("That character is not in the pasted export.");

  const { data: catalog, error: catalogError } = await session.supabase.rpc("admin_catalog");
  if (catalogError) return fail(catalogError.message);
  const { professions, recipes } = catalog as AdminCatalog;
  const match = matchGuildonExport(character, professions, new Map(recipes.map((r) => [r.id, r.professionId])));

  for (const { professionId, skill } of match.skills) {
    const { error } = await session.supabase
      .from("crafter_professions")
      .upsert({ crafter_id: crafterId, profession_id: professionId, skill });
    if (error) return fail(error.message);
  }

  // The skills just saved bring their trainer recipes with them (the database adds those).
  // Only ever adds: recipes ticked by hand (for example ones not trained yet) are kept.
  const { data, error } = await session.supabase.rpc("set_crafter_recipes", {
    p_crafter_id: crafterId,
    p_add: match.recipeIds,
    p_remove: [],
    p_source: "import",
  });
  if (error) return fail(error.message);
  publish(CRAFTABLES_TAG);
  return {
    ok: true,
    data: {
      added: (data as { added: number }).added,
      unknown: match.unknownSpellIds.length,
      recipeIds: await recipeIdsOf(session, crafterId),
    },
  };
}

async function signedInAdmin() {
  const session = await signedIn();
  if (!session) return null;
  // Row level security shows a user only their own row here, so a row means "admin".
  const { data } = await session.supabase.from("app_admins").select("user_id").maybeSingle();
  return data ? session : null;
}

/** Records the unlock level an admin read off the trainer. Passing null clears the correction. */
export async function correctUnlockLevel(recipeId: number, level: number | null): Promise<ActionResult> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can correct unlock levels.");
  if (!Number.isInteger(recipeId) || recipeId <= 0) return fail("Unknown recipe.");
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 450)) {
    return fail("Enter a skill level between 1 and 450.");
  }

  const { error, count } = await session.supabase
    .from("recipes")
    .update({ learn_skill_owner: level }, { count: "exact" })
    .eq("id", recipeId);
  if (error) return fail(error.message);
  if (count === 0) return fail("That recipe could not be updated.");
  // The level shows on the public list, and a settled trainer level adds the recipe for crafters past it.
  publish(CRAFTABLES_TAG);
  return { ok: true, data: undefined };
}

/**
 * Records which faction can do the quest a recipe comes from, as an admin saw
 * it in the game: "none" for both. Passing null goes back to what the wiki says.
 */
export async function correctQuestFaction(
  recipeId: number,
  faction: QuestFactionChoice | null,
): Promise<ActionResult> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can say which faction a quest is for.");
  if (!Number.isInteger(recipeId) || recipeId <= 0) return fail("Unknown recipe.");
  if (faction !== null && !["horde", "alliance", "none"].includes(faction)) return fail("Unknown faction.");

  const { error, count } = await session.supabase
    .from("recipes")
    .update({ quest_faction_owner: faction }, { count: "exact" })
    .eq("id", recipeId);
  if (error) return fail(error.message);
  if (count === 0) return fail("That recipe could not be updated.");
  publish(CRAFTABLES_TAG);
  return { ok: true, data: undefined };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ADMIN = "Only a site admin can manage crafters.";

type AdminSession = Session;

/** The list as it stands after a change, so the page can show it without a reload. */
async function directoryAfterChange(session: AdminSession): Promise<ActionResult<AdminDirectory>> {
  const { data, error } = await session.supabase.rpc("admin_directory");
  if (error) return fail(error.message);
  publish(CRAFTABLES_TAG);
  return { ok: true, data: data as AdminDirectory };
}

/**
 * Adds a crafter. With an account, that member can manage the crafter's list
 * the next time they open the page. The database checks the caller is an admin.
 */
export async function createCrafter(characterName: string, userId: string | null): Promise<ActionResult<AdminDirectory>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  const name = typeof characterName === "string" ? characterName.trim() : "";
  if (name.length < 1 || name.length > 40) return fail("Enter a character name (up to 40 characters).");
  if (userId !== null && !UUID.test(String(userId))) return fail("That account is not known.");

  const { error } = await session.supabase.rpc("admin_create_crafter", { p_character_name: name, p_user_id: userId });
  if (error) return fail(error.message);
  return directoryAfterChange(session);
}

/** Links a crafter to a signed-in account, or unlinks it when the account is null. */
export async function linkCrafter(crafterId: string, userId: string | null): Promise<ActionResult<AdminDirectory>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  if (!UUID.test(String(crafterId))) return fail("That crafter is not known.");
  if (userId !== null && !UUID.test(String(userId))) return fail("That account is not known.");

  const { error } = await session.supabase.rpc("admin_link_crafter", { p_crafter_id: crafterId, p_user_id: userId });
  if (error) return fail(error.message);
  return directoryAfterChange(session);
}

/** Hands a crafter to an account together with the same player's other characters nobody manages yet. */
export async function linkPlayer(crafterId: string, userId: string): Promise<ActionResult<AdminDirectory>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  if (!UUID.test(String(crafterId))) return fail("That crafter is not known.");
  if (!UUID.test(String(userId))) return fail("That account is not known.");

  const { error } = await session.supabase.rpc("admin_link_player", { p_crafter_id: crafterId, p_user_id: userId });
  if (error) return fail(error.message);
  return directoryAfterChange(session);
}

/** Shows a crafter on the public crafting list, or takes them off it. */
export async function setCrafterListed(crafterId: string, listed: boolean): Promise<ActionResult<AdminDirectory>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  if (!UUID.test(String(crafterId))) return fail("That crafter is not known.");

  const { error } = await session.supabase.rpc("admin_set_crafter_listed", { p_crafter_id: crafterId, p_listed: listed === true });
  if (error) return fail(error.message);
  return directoryAfterChange(session);
}

/** The members of a guild file as the page sends them, checked before the database sees them. */
function checkGuildMembers(members: unknown): GuildImportMember[] | string {
  if (!Array.isArray(members) || members.length === 0) return "Choose at least one member to import.";
  if (members.length > 500) return "That is more than 500 members. Import them in smaller groups.";
  const targets = new Set<string>();
  const checked: GuildImportMember[] = [];
  for (const member of members as Partial<GuildImportMember>[]) {
    const name = typeof member?.name === "string" ? member.name.trim() : "";
    if (name.length < 1 || name.length > 40) return "A member in that file has no name, or one longer than 40 characters.";
    const crafterId = member.crafterId ?? null;
    if (crafterId !== null) {
      if (typeof crafterId !== "string" || !UUID.test(crafterId)) return `The crafter chosen for ${name} is not known.`;
      if (targets.has(crafterId.toLowerCase())) return "Two members point at the same crafter. Give each their own.";
      targets.add(crafterId.toLowerCase());
    }
    const professions = member.professions;
    if (
      !Array.isArray(professions) ||
      professions.length > 30 ||
      !professions.every(
        (p) => Number.isInteger(p?.id) && p.id > 0 && Number.isInteger(p?.skill) && p.skill >= 1 && p.skill <= 450,
      )
    ) {
      return `The professions of ${name} are not valid.`;
    }
    if (!isIdList(member.recipeIds)) return `The recipes of ${name} are not valid.`;
    checked.push({
      name,
      crafterId,
      professions: professions.map((p) => ({ id: p.id, skill: p.skill })),
      recipeIds: member.recipeIds,
    });
  }
  return checked;
}

/** Which of the members sent, and which crafters already there, are one player's characters. */
function checkGuildPlayers(players: unknown, memberCount: number): GuildImportPlayer[] | string {
  if (players === undefined || players === null) return [];
  if (!Array.isArray(players) || players.length > 500) return "The list of players in that file is not valid.";
  const checked: GuildImportPlayer[] = [];
  for (const player of players as Partial<GuildImportPlayer>[]) {
    const members = player?.members;
    const crafterIds = player?.crafterIds;
    if (
      !Array.isArray(members) ||
      !Array.isArray(crafterIds) ||
      members.length + crafterIds.length > 40 ||
      !members.every((place) => Number.isInteger(place) && place >= 0 && place < memberCount) ||
      !crafterIds.every((id) => typeof id === "string" && UUID.test(id))
    ) {
      return "The list of players in that file is not valid.";
    }
    checked.push({ members, crafterIds });
  }
  return checked;
}

async function importGuild(
  session: AdminSession,
  members: GuildImportMember[],
  listNew: boolean,
  apply: boolean,
): Promise<ActionResult<GuildImportTally[]>> {
  const { data, error } = await session.supabase.rpc("admin_import_guild", {
    p_members: members,
    p_list_new: listNew === true,
    p_apply: apply,
  });
  if (error) return fail(error.code === "42501" ? NOT_ADMIN : error.message);
  return { ok: true, data: data as GuildImportTally[] };
}

/**
 * What importing these members of a guild addon's file would do: who would
 * become a crafter, and the recipes and skills each would gain. Changes nothing.
 */
export async function previewGuildImport(
  members: GuildImportMember[],
  listNew: boolean,
): Promise<ActionResult<GuildImportTally[]>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  const checked = checkGuildMembers(members);
  if (typeof checked === "string") return fail(checked);
  return importGuild(session, checked, listNew, false);
}

export interface GuildImportResult {
  tallies: GuildImportTally[];
  directory: AdminDirectory;
  /** The admin's own crafters the import touched, with their recipe lists as they now stand. */
  ownRecipes: Record<string, number[]>;
  /** Something that went wrong after the members were imported, to be told rather than hidden. */
  warning: string | null;
}

/**
 * Imports members from a guild addon's file: creates the crafters that are
 * new, and adds recipes and raises skills for the rest. Then records which of
 * them the file knows to be one player's characters, so they can be handed to
 * that player's account together. Site admins only; the database checks that again.
 */
export async function applyGuildImport(
  members: GuildImportMember[],
  listNew: boolean,
  players: GuildImportPlayer[] = [],
): Promise<ActionResult<GuildImportResult>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  const checked = checkGuildMembers(members);
  if (typeof checked === "string") return fail(checked);
  const checkedPlayers = checkGuildPlayers(players, checked.length);
  if (typeof checkedPlayers === "string") return fail(checkedPlayers);

  const imported = await importGuild(session, checked, listNew, true);
  if (!imported.ok) return imported;

  // The members are in. Who shares a player is worth having, but not worth losing the import over.
  let warning: string | null = null;
  const groups = checkedPlayers
    .map((player) => [...player.members.flatMap((place) => imported.data[place]?.crafterId ?? []), ...player.crafterIds])
    .filter((group) => group.length > 1);
  if (groups.length > 0) {
    const { error } = await session.supabase.rpc("admin_group_crafters", { p_groups: groups });
    if (error) warning = `The members were imported, but which characters share a player could not be recorded: ${error.message}`;
  }

  const directory = await directoryAfterChange(session);
  if (!directory.ok) return directory;

  const touched = new Set(imported.data.map((tally) => tally.crafterId));
  const ownRecipes: Record<string, number[]> = {};
  for (const crafter of directory.data.crafters) {
    if (crafter.userId === session.userId && touched.has(crafter.id)) {
      ownRecipes[crafter.id] = await recipeIdsOf(session, crafter.id);
    }
  }
  return { ok: true, data: { tallies: imported.data, directory: directory.data, ownRecipes, warning } };
}

const isCount = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
const isOptionalCount = (value: unknown, max: number) => value === null || isCount(value, max);
const isOptionalText = (value: unknown, max: number) => value === null || (typeof value === "string" && value.length <= max);

/** A reading of the guild bank as the page sends it, checked before the database sees it. */
function checkGuildBank(bank: unknown): GuildyBank | string {
  const wrong = "That file's reading of the guild bank is not valid.";
  const reading = bank as Partial<GuildyBank> | null;
  if (
    !reading ||
    !isCount(reading.at, 99_999_999_999) ||
    !isCount(reading.money, Number.MAX_SAFE_INTEGER) ||
    !isOptionalText(reading.by ?? null, 40) ||
    !isOptionalCount(reading.nextTabCost ?? null, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(reading.tabs) ||
    reading.tabs.length > 20 ||
    !Array.isArray(reading.ledger) ||
    reading.ledger.length > LEDGER_LINES
  ) {
    return wrong;
  }
  for (const tab of reading.tabs) {
    if (!isCount(tab?.n, 99) || typeof tab.name !== "string" || tab.name.length > 40 || !Array.isArray(tab.slots) || tab.slots.length > 400) {
      return wrong;
    }
    for (const held of tab.slots) {
      if (
        !isCount(held?.slot, 999) ||
        !isOptionalCount(held.id, 2_000_000_000) ||
        typeof held.name !== "string" ||
        held.name.length > 80 ||
        !isCount(held.count, 1_000_000)
      ) {
        return wrong;
      }
    }
  }
  for (const entry of reading.ledger) {
    if (
      typeof entry?.kind !== "string" ||
      entry.kind.length > 24 ||
      !isOptionalText(entry.who, 40) ||
      !isOptionalCount(entry.id, 2_000_000_000) ||
      !isOptionalText(entry.name, 80) ||
      !isOptionalCount(entry.count, 1_000_000) ||
      !isOptionalCount(entry.tab, 99) ||
      !isOptionalCount(entry.toTab, 99) ||
      !isOptionalCount(entry.copper, Number.MAX_SAFE_INTEGER) ||
      !isCount(entry.at, 99_999_999_999)
    ) {
      return wrong;
    }
  }
  return {
    at: reading.at,
    by: reading.by ?? null,
    money: reading.money,
    nextTabCost: reading.nextTabCost ?? null,
    tabs: reading.tabs.map((tab) => ({
      n: tab.n,
      name: tab.name,
      slots: tab.slots.map((held) => ({ slot: held.slot, id: held.id, name: held.name, count: held.count })),
    })),
    ledger: reading.ledger.map((entry) => ({
      kind: entry.kind,
      who: entry.who,
      id: entry.id,
      name: entry.name,
      count: entry.count,
      tab: entry.tab,
      toTab: entry.toTab,
      copper: entry.copper,
      at: entry.at,
    })),
  };
}

/**
 * Brings in a guild addon's reading of the guild bank, replacing the one the
 * site has. Site admins only; the database checks that again, and refuses a
 * reading older than the one it holds.
 */
export async function importGuildBank(bank: GuildyBank): Promise<ActionResult> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  const checked = checkGuildBank(bank);
  if (typeof checked === "string") return fail(checked);

  const { error } = await session.supabase.rpc("admin_set_guild_bank", { p_bank: checked });
  if (error) return fail(error.code === "42501" ? NOT_ADMIN : error.message);
  return { ok: true, data: undefined };
}

export interface EventInput {
  /** The event to change, or null for a new one. */
  id: string | null;
  title: string;
  /** When it starts, as an instant the browser worked out from the date and time typed. */
  startsAt: string;
  details: string;
}

/** The calendar as it stands, newest first, for the admin's own list. */
async function eventsAfterChange(session: AdminSession): Promise<ActionResult<GuildEvent[]>> {
  const { data, error } = await session.supabase
    .from("guild_events")
    .select("id, title, starts_at, details")
    .order("starts_at", { ascending: false })
    .limit(300);
  if (error) return fail(error.message);
  publish(EVENTS_TAG);
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      startsAt: new Date(row.starts_at as string).toISOString(),
      details: (row.details as string | null) ?? null,
    })),
  };
}

/** Adds an event to the guild's calendar, or changes one. Site admins only; the database checks that again. */
export async function saveEvent(input: EventInput): Promise<ActionResult<GuildEvent[]>> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can change the calendar.");
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (title.length < 1 || title.length > 80) return fail("Give the event a name of up to 80 characters.");
  const details = String(input.details ?? "").trim();
  if (details.length > 1000) return fail("Keep the details under 1000 characters.");
  const startsAt = new Date(String(input.startsAt ?? ""));
  if (Number.isNaN(startsAt.getTime()) || startsAt.getFullYear() < 2020 || startsAt.getFullYear() > 2100) {
    return fail("Choose the day and the time the event starts.");
  }
  if (input.id !== null && !UUID.test(String(input.id))) return fail("That event is not known.");

  const { error } = await session.supabase.rpc("admin_save_event", {
    p_id: input.id,
    p_title: title,
    p_starts_at: startsAt.toISOString(),
    p_details: details,
  });
  if (error) return fail(error.code === "42501" ? "Only a site admin can change the calendar." : error.message);
  return eventsAfterChange(session);
}

/** Takes an event off the guild's calendar. Site admins only. */
export async function deleteEvent(id: string): Promise<ActionResult<GuildEvent[]>> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can change the calendar.");
  if (!UUID.test(String(id))) return fail("That event is not known.");

  const { error } = await session.supabase.rpc("admin_delete_event", { p_id: id });
  if (error) return fail(error.code === "42501" ? "Only a site admin can change the calendar." : error.message);
  return eventsAfterChange(session);
}

/** Sets who is approved automatically: members of a Discord server, optionally with a role. */
export async function saveApprovalSettings(
  autoApprove: boolean,
  guildId: string,
  roleId: string,
): Promise<ActionResult<AdminSettings>> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can change this.");

  const { error } = await session.supabase.rpc("admin_save_settings", {
    p_auto_approve: autoApprove === true,
    p_guild_id: String(guildId ?? ""),
    p_role_id: String(roleId ?? ""),
  });
  if (error) return fail(error.message);
  const { data, error: readError } = await session.supabase.rpc("admin_settings");
  if (readError) return fail(readError.message);
  return { ok: true, data: data as AdminSettings };
}

export interface SyncSummary {
  status: "ok" | "failed";
  build: string | null;
  newRecipes: number;
  changedRecipes: number;
  changedItems: number;
  removedRecipes: number;
  warnings: string[];
  error: string | null;
}

/** "Check for game updates": runs the sync now. Site admins only. */
export async function checkForGameUpdates(): Promise<ActionResult<SyncSummary>> {
  const session = await signedInAdmin();
  if (!session) return fail("Only a site admin can update the game data.");

  // One sync at a time, and not more often than is polite to the data source.
  const { data: latest } = await session.supabase
    .from("sync_runs")
    .select("started_at, status")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    const ageSeconds = (Date.now() - new Date(latest.started_at).getTime()) / 1000;
    if (latest.status === "running" && ageSeconds < 600) return fail("An update is already running. Check back in a minute.");
    if (ageSeconds < 120) return fail("The game data was checked a moment ago. Try again in a couple of minutes.");
  }

  try {
    const result = await runSiteSync("manual");
    if (result.status === "ok") publish(CRAFTABLES_TAG);
    return {
      ok: true,
      data: {
        status: result.status,
        build: result.stats.build,
        newRecipes: result.stats.newRecipes,
        changedRecipes: Math.max(0, result.stats.recipesWritten - result.stats.newRecipes),
        changedItems: result.stats.itemsWritten,
        removedRecipes: result.stats.removedRecipes,
        warnings: result.warnings,
        error: result.error,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
