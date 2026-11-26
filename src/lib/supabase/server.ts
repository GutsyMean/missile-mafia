import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Part of the name of every cookie a sign-in leaves, whole or in pieces. lib/account-marker looks for the same. */
const SESSION_COOKIE = "-auth-token";

/**
 * A client that acts as the signed-in visitor, using their session cookies.
 * Everything it reads or writes is subject to row level security.
 */
export async function createServerSupabase() {
  // Reading cookies first keeps all of this out of the build.
  const cookieStore = await cookies();
  // It does not wait for a visitor's own request, though: Next also reads the cookies while it prepares what a
  // link fetches ahead of a visit. A client that finds a session checks its token against the clock the moment
  // it exists, and Next reports a clock read there as an error on every page. So with a session to check, wait
  // for the request itself. Without one there is nothing to check, and "signed out" can be prepared ahead.
  if (cookieStore.getAll().some(({ name }) => name.includes(SESSION_COOKIE))) await io();
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
