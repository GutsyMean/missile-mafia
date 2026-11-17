import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * A cookie-less client for public, cacheable reads. It always acts as an
 * anonymous visitor, so anything it can read is public by row level security.
 */
export function createPublicClient() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
