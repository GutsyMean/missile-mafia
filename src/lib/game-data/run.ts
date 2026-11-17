import "server-only";
import { createSecretClient } from "@/lib/supabase/admin";
import { loadLiveDataset } from "./live";
import { rpcStore } from "./stores";
import { runSync, type SyncResult, type SyncTrigger } from "./sync";

/**
 * Runs a game-data sync from the site itself: download the current game data,
 * compare it with the database and write what changed. Callers decide who may
 * start one (the schedule's secret, or a signed-in site admin).
 */
export async function runSiteSync(trigger: SyncTrigger): Promise<SyncResult> {
  const client = createSecretClient();
  if (!client) {
    throw new Error("The sync cannot write yet: SUPABASE_SECRET_KEY is not set on the server.");
  }
  return runSync({ store: rpcStore(client), trigger, load: () => loadLiveDataset() });
}
