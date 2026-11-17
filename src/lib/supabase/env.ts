/** Public Supabase settings. Both values are safe to expose to the browser. */
export function supabaseEnv(): { url: string; publishableKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && publishableKey ? { url, publishableKey } : null;
}

/** The secret key the game-data sync writes with. Server only; never sent to the browser. */
export function supabaseSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}
