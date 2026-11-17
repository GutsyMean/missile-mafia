/**
 * Asks Discord whether the account that just signed in belongs to the guild's
 * server. Runs on the site's server with the token Discord issued for that
 * sign-in, so the answer cannot be supplied or altered by the visitor.
 */

export type Membership = "member" | "not_member" | "unknown";

export interface MembershipCheck {
  /** The access token Discord issued at sign-in (scope guilds.members.read). */
  token: string;
  guildId: string;
  /** When set, the member must also hold this role. */
  roleId: string | null;
  /** The Discord account the site's sign-in is for; the answer must be about the same one. */
  discordUserId: string | null;
  fetchFn?: typeof fetch;
}

export interface MembershipResult {
  status: Membership;
  /** The name the member uses in that server. */
  name: string | null;
}

const SNOWFLAKE = /^[0-9]{15,22}$/;
const UNKNOWN: MembershipResult = { status: "unknown", name: null };
const NOT_MEMBER: MembershipResult = { status: "not_member", name: null };

/**
 * "member" and "not_member" are Discord's own answers. Anything else (Discord
 * unreachable, permission not granted, an answer that does not add up) is
 * "unknown", and the caller then changes nothing.
 */
export async function checkMembership({
  token,
  guildId,
  roleId,
  discordUserId,
  fetchFn = fetch,
}: MembershipCheck): Promise<MembershipResult> {
  if (!token || !SNOWFLAKE.test(guildId)) return UNKNOWN;

  let response: Response;
  try {
    response = await fetchFn(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return UNKNOWN;
  }
  // Discord answers 404 when the account is not in the server.
  if (response.status === 404) return NOT_MEMBER;
  if (!response.ok) return UNKNOWN;

  const member = (await response.json().catch(() => null)) as {
    nick?: string | null;
    roles?: unknown;
    user?: { id?: string; username?: string; global_name?: string | null };
  } | null;
  if (!member || !Array.isArray(member.roles)) return UNKNOWN;
  if (discordUserId && member.user?.id && member.user.id !== discordUserId) return UNKNOWN;
  if (roleId && !member.roles.includes(roleId)) return NOT_MEMBER;

  const name = member.nick || member.user?.global_name || member.user?.username || null;
  return { status: "member", name: name ? name.slice(0, 80) : null };
}
