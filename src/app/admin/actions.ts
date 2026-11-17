"use server";

import { updateTag } from "next/cache";
import { CRAFTABLES_TAG } from "@/lib/craftables/load";
import type { AdminCatalog, AdminDirectory, AdminSettings } from "@/lib/admin/types";
import { runSiteSync } from "@/lib/game-data/run";
import { matchGuildonExport, parseGuildonExport } from "@/lib/guildon";
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

/** Ticks and unticks recipes. Row level security only lets the crafter's owner do this. */
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
  updateTag(CRAFTABLES_TAG);
  return { ok: true, data: data as { added: number; removed: number } };
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

  updateTag(CRAFTABLES_TAG);
  return { ok: true, data: undefined };
}

export async function saveProfile(crafterId: string, input: ProfileInput): Promise<ActionResult> {
  const session = await signedIn();
  if (!session) return fail("Sign in again to save.");
  const profile = parseProfile(input);
  if (!profile.ok) return profile;
  return writeProfile(session, crafterId, profile.data);
}

/**
 * Sign-up: a member Discord confirmed creates their own crafter profile.
 * The database refuses anyone it has no verification for.
 */
export async function signUpCrafter(input: ProfileInput): Promise<ActionResult> {
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
  return writeProfile(session, data as string, profile.data);
}

/**
 * Adds the recipes a pasted addon export says one character has learned.
 * The text is parsed again here; nothing the browser worked out is trusted.
 */
export async function importGuildon(
  crafterId: string,
  text: string,
  characterName: string,
): Promise<ActionResult<{ added: number; unknown: number }>> {
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

  // Only ever adds: recipes ticked by hand (for example ones not trained yet) are kept.
  const { data, error } = await session.supabase.rpc("set_crafter_recipes", {
    p_crafter_id: crafterId,
    p_add: match.recipeIds,
    p_remove: [],
    p_source: "import",
  });
  if (error) return fail(error.message);
  updateTag(CRAFTABLES_TAG);
  return { ok: true, data: { added: (data as { added: number }).added, unknown: match.unknownSpellIds.length } };
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
  return { ok: true, data: undefined };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ADMIN = "Only a site admin can manage crafters.";

type AdminSession = Session;

/** The list as it stands after a change, so the page can show it without a reload. */
async function directoryAfterChange(session: AdminSession): Promise<ActionResult<AdminDirectory>> {
  const { data, error } = await session.supabase.rpc("admin_directory");
  if (error) return fail(error.message);
  updateTag(CRAFTABLES_TAG);
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

/** Shows a crafter on the public crafting list, or takes them off it. */
export async function setCrafterListed(crafterId: string, listed: boolean): Promise<ActionResult<AdminDirectory>> {
  const session = await signedInAdmin();
  if (!session) return fail(NOT_ADMIN);
  if (!UUID.test(String(crafterId))) return fail("That crafter is not known.");

  const { error } = await session.supabase.rpc("admin_set_crafter_listed", { p_crafter_id: crafterId, p_listed: listed === true });
  if (error) return fail(error.message);
  return directoryAfterChange(session);
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
    if (result.status === "ok") updateTag(CRAFTABLES_TAG);
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
