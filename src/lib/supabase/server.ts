import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * A client that acts as the signed-in visitor, using their session cookies.
 * Everything it reads or writes is subject to row level security.
 */
export async function createServerSupabase() {
  // Reading cookies first marks the caller as per-request, so nothing here runs while the site is built.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** The verified id of the signed-in user, or null. Never trusts the cookie unverified. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}
