import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Keeps a crafter's session fresh on the pages that need one, and sends
 * signed-out visitors to the sign-in page. The public window is untouched, so
 * it stays fully cached.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the token (and refreshes it when needed); never trust the cookie unverified.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && request.nextUrl.pathname.startsWith("/admin")) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/login";
    signIn.search = "";
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/auth/:path*"],
};
