import "server-only";
import { supabaseEnv } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GuildBankDoc } from "./guild-bank";

/** What the visitor may be shown of the bank. */
export type GuildBankView =
  | { state: "signed-out" }
  | { state: "not-member" }
  | { state: "no-reading" }
  | { state: "ok"; bank: GuildBankDoc };

/** The guild bank, read as the signed-in visitor: the database decides whether they are a member. */
export async function loadGuildBank(): Promise<GuildBankView> {
  if (!supabaseEnv()) return { state: "signed-out" };
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return { state: "signed-out" };

  const { data, error } = await supabase.rpc("guild_bank");
  if (error) {
    if (error.code === "42501") return { state: "not-member" };
    throw new Error(error.message);
  }
  return data ? { state: "ok", bank: data as GuildBankDoc } : { state: "no-reading" };
}
