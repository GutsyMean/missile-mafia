import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameDataStore, StoreState, SyncBatch, SyncFinish, SyncTrigger } from "./sync";
import type { FetchLike } from "./wago";

type ApplyResult = { items: number; recipes: number; newRecipes: number };

/**
 * The game-data store behind the site: the sync functions in the database,
 * called with the server's secret key. Used by the daily schedule and the
 * "Check for game updates" button.
 */
export function rpcStore(client: SupabaseClient): GameDataStore {
  async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data as T;
  }
  return {
    start: (trigger: SyncTrigger) => call<number>("sync_start", { p_trigger: trigger }),
    state: () => call<StoreState>("sync_state"),
    apply: (runId: number, batch: SyncBatch) =>
      call<ApplyResult>("sync_apply", { p_run_id: runId, p_batch: batch }),
    finish: (runId: number, finish: SyncFinish) =>
      call<number>("sync_finish", {
        p_run_id: runId,
        p_status: finish.status,
        p_build: finish.build,
        p_stats: finish.stats,
        p_warnings: finish.warnings,
        p_error: finish.error,
        p_present_recipe_ids: finish.presentRecipeIds,
      }),
  };
}

/** A JSON value as a SQL literal, quoted with a tag the data cannot contain. */
export function sqlJson(value: unknown): string {
  const json = JSON.stringify(value);
  let tag = "j";
  while (json.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${json}$${tag}$::jsonb`;
}

function sqlText(value: string | null): string {
  return value === null ? "null" : `'${value.replace(/'/g, "''")}'`;
}

/**
 * The same store through Supabase's Management API, which runs SQL as the
 * project owner. For the command line during setup, where the access token is
 * supplied by the environment rather than held by this code.
 */
export function managementApiStore(
  projectRef: string,
  fetchFn: FetchLike = fetch,
  accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "supplied-by-the-network-proxy",
): GameDataStore {
  async function query<T>(expression: string): Promise<T> {
    const response = await fetchFn(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `select ${expression} as result` }),
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = (body as { message?: string } | null)?.message ?? `HTTP ${response.status}`;
      throw new Error(`Database query failed: ${message}`);
    }
    return (body as { result: T }[])[0].result;
  }

  return {
    start: (trigger) => query<number>(`public.sync_start(${sqlText(trigger)})`),
    state: () => query<StoreState>("public.sync_state()"),
    apply: (runId, batch) => query<ApplyResult>(`public.sync_apply(${runId}, ${sqlJson(batch)})`),
    finish: (runId, finish) => {
      const present = finish.presentRecipeIds
        ? `array[${finish.presentRecipeIds.join(",")}]::integer[]`
        : "null::integer[]";
      return query<number>(
        `public.sync_finish(${runId}, ${sqlText(finish.status)}, ${sqlText(finish.build)}, ` +
          `${sqlJson(finish.stats)}, ${sqlJson(finish.warnings)}, ${sqlText(finish.error)}, ${present})`,
      );
    },
  };
}
