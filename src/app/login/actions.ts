"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/** Starts Discord sign-in and sends the browser to Discord's consent page. */
export async function signInWithDiscord() {
  const supabase = await createServerSupabase();
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  // The extra permission lets the site ask Discord about one thing: membership of the guild's server.
  const { data: settings } = await supabase.from("site_settings").select("auto_approve").maybeSingle();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback`,
      ...(settings?.auto_approve ? { scopes: "guilds.members.read" } : {}),
    },
  });
  if (error || !data.url) redirect("/login?error=discord");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
