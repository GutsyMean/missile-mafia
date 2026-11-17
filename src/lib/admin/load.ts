import "server-only";
import { supabaseSecretKey } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AdminCatalog, AdminDirectory } from "./types";

export interface AdminCrafter {
  id: string;
  slug: string;
  characterName: string;
  realm: string | null;
  faction: string | null;
  className: string | null;
  level: number | null;
  note: string | null;
  /** Profession id → skill. */
  skills: Record<string, number>;
  recipeIds: number[];
}

export interface SyncRunView {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  status: string;
  build: string | null;
  stats: { newRecipes?: number; recipesWritten?: number; itemsWritten?: number; removedRecipes?: number };
  warnings: string[];
  error: string | null;
}

export interface AdminData {
  /** The signed-in account. */
  userId: string;
  /** How the signed-in account is shown, e.g. a Discord name. */
  accountName: string | null;
  isAdmin: boolean;
  /** The crafters this account manages. Empty for an admin who does not craft. */
  crafters: AdminCrafter[];
  /** Who has signed in and every crafter. Null unless the account is a site admin. */
  directory: AdminDirectory | null;
  catalog: AdminCatalog;
  runs: SyncRunView[];
  /** False until the server has the secret key the sync writes with. */
  syncConfigured: boolean;
}

const PAGE = 1000;

/** Everything the crafter's page needs, read as the signed-in user. Null when signed out. */
export async function loadAdminData(): Promise<AdminData | null> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;

  const [crafterRows, adminRow, catalog, runRows] = await Promise.all([
    supabase.from("crafters").select("*").eq("user_id", claims.sub).order("character_name"),
    supabase.from("app_admins").select("user_id").maybeSingle(),
    supabase.rpc("admin_catalog"),
    supabase.from("sync_runs").select("*").order("id", { ascending: false }).limit(8),
  ]);
  if (crafterRows.error) throw new Error(crafterRows.error.message);
  if (catalog.error) throw new Error(catalog.error.message);

  let directory: AdminDirectory | null = null;
  if (adminRow.data) {
    const result = await supabase.rpc("admin_directory");
    if (result.error) throw new Error(result.error.message);
    directory = result.data as AdminDirectory;
  }

  const crafters: AdminCrafter[] = [];
  for (const row of crafterRows.data ?? []) {
    const { data: skillRows } = await supabase
      .from("crafter_professions")
      .select("profession_id, skill")
      .eq("crafter_id", row.id);

    // The API returns at most a page of rows per request, so read until a short page.
    const recipeIds: number[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from("crafter_recipes")
        .select("recipe_id")
        .eq("crafter_id", row.id)
        .order("recipe_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      recipeIds.push(...(page ?? []).map((r) => r.recipe_id as number));
      if (!page || page.length < PAGE) break;
    }

    crafters.push({
      id: row.id,
      slug: row.slug,
      characterName: row.character_name,
      realm: row.realm,
      faction: row.faction,
      className: row.class,
      level: row.level,
      note: row.note,
      skills: Object.fromEntries((skillRows ?? []).map((s) => [String(s.profession_id), s.skill as number])),
      recipeIds,
    });
  }

  // Display only; authorisation never reads user-editable metadata.
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const accountName =
    (metadata.full_name as string | undefined) ?? (metadata.name as string | undefined) ?? (claims.email as string | undefined) ?? null;

  return {
    userId: claims.sub,
    accountName,
    isAdmin: Boolean(adminRow.data),
    crafters,
    directory,
    catalog: catalog.data as AdminCatalog,
    runs: (runRows.data ?? []).map((run) => ({
      id: run.id,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      trigger: run.trigger,
      status: run.status,
      build: run.build,
      stats: run.stats ?? {},
      warnings: run.warnings ?? [],
      error: run.error,
    })),
    syncConfigured: supabaseSecretKey() !== null,
  };
}
