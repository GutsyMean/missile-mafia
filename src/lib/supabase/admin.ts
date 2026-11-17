import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv, supabaseSecretKey } from "./env";

/**
 * A client with the server's secret key, which bypasses row level security.
 * Only the game-data sync uses it, and only after checking who is asking.
 */
export function createSecretClient() {
  const env = supabaseEnv();
  const secret = supabaseSecretKey();
  if (!env || !secret) return null;
  return createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
