import { checkMembership, type Membership } from "./discord";

/** Where the approval rule lives and where Discord's answer is recorded. */
export interface MembershipStore {
  /** The server (and role) members must belong to, or null while automatic approval is off. */
  rule(): Promise<{ guildId: string; roleId: string | null } | null>;
  confirm(userId: string, discordName: string | null): Promise<void>;
  revoke(userId: string): Promise<void>;
}

/** The parts of a fresh sign-in this needs. */
export interface SignInSession {
  /** Discord's access token for this sign-in. */
  provider_token?: string | null;
  user: {
    id: string;
    identities?: { provider: string; identity_data?: Record<string, unknown> | null }[] | null;
  };
}

/**
 * Run right after a Discord sign-in: asks Discord whether the account is a
 * guild member and records the answer. A member may then create their own
 * crafter; someone who has left loses that. When Discord gives no clear
 * answer nothing changes. Never throws, so a failed check cannot block sign-in.
 */
export async function recordMembershipAtSignIn(
  session: SignInSession,
  store: MembershipStore | null,
  fetchFn: typeof fetch = fetch,
): Promise<Membership | "off"> {
  if (!store) return "off";
  try {
    const rule = await store.rule();
    if (!rule) return "off";

    // Taken from the sign-in itself, not from details the account holder can edit.
    const identity = session.user.identities?.find((entry) => entry.provider === "discord");
    const discordId = identity?.identity_data?.provider_id ?? identity?.identity_data?.sub;
    const result = await checkMembership({
      token: session.provider_token ?? "",
      guildId: rule.guildId,
      roleId: rule.roleId,
      discordUserId: typeof discordId === "string" ? discordId : null,
      fetchFn,
    });
    if (result.status === "member") await store.confirm(session.user.id, result.name);
    if (result.status === "not_member") await store.revoke(session.user.id);
    return result.status;
  } catch {
    return "unknown";
  }
}
