import "server-only";
import { createSecretClient } from "@/lib/supabase/admin";
import type { MembershipStore } from "./membership";

/**
 * Reads the approval rule and records verifications with the server's secret
 * key: signed-in users have no right to write either. Null when the key is
 * not configured, in which case approval stays manual.
 */
export function membershipStore(): MembershipStore | null {
  const admin = createSecretClient();
  if (!admin) return null;
  return {
    async rule() {
      const { data, error } = await admin
        .from("site_settings")
        .select("auto_approve, discord_guild_id, discord_role_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.auto_approve || !data.discord_guild_id) return null;
      return { guildId: data.discord_guild_id as string, roleId: (data.discord_role_id as string | null) ?? null };
    },
    async confirm(userId, discordName) {
      const { error } = await admin
        .from("verified_members")
        .upsert({ user_id: userId, discord_name: discordName, verified_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async revoke(userId) {
      const { error } = await admin.from("verified_members").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}
