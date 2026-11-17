import { describe, expect, it } from "vitest";
import { recordMembershipAtSignIn, type MembershipStore, type SignInSession } from "@/lib/membership";

const GUILD = "123456789012345678";
const DISCORD_USER = "999999999999999999";

function store(rule: { guildId: string; roleId: string | null } | null) {
  const log: string[] = [];
  const value: MembershipStore = {
    rule: async () => rule,
    confirm: async (userId, name) => void log.push(`confirm ${userId} ${name}`),
    revoke: async (userId) => void log.push(`revoke ${userId}`),
  };
  return { value, log };
}

const discord = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const session: SignInSession = {
  provider_token: "tok",
  user: { id: "user-1", identities: [{ provider: "discord", identity_data: { provider_id: DISCORD_USER } }] },
};
const member = { nick: "Thrallfan", roles: [], user: { id: DISCORD_USER } };

describe("recordMembershipAtSignIn", () => {
  it("records a guild member, so they may sign up", async () => {
    const { value, log } = store({ guildId: GUILD, roleId: null });
    expect(await recordMembershipAtSignIn(session, value, discord(200, member))).toBe("member");
    expect(log).toEqual(["confirm user-1 Thrallfan"]);
  });

  it("withdraws the verification of someone who is no longer in the server", async () => {
    const { value, log } = store({ guildId: GUILD, roleId: null });
    expect(await recordMembershipAtSignIn(session, value, discord(404, {}))).toBe("not_member");
    expect(log).toEqual(["revoke user-1"]);
  });

  it("changes nothing when Discord gives no clear answer", async () => {
    const { value, log } = store({ guildId: GUILD, roleId: null });
    expect(await recordMembershipAtSignIn(session, value, discord(500, {}))).toBe("unknown");
    expect(await recordMembershipAtSignIn({ ...session, provider_token: null }, value, discord(200, member))).toBe("unknown");
    expect(log).toEqual([]);
  });

  it("does nothing while automatic approval is off", async () => {
    const off = store(null);
    let asked = false;
    const fetchFn = (async () => {
      asked = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await recordMembershipAtSignIn(session, off.value, fetchFn)).toBe("off");
    expect(await recordMembershipAtSignIn(session, null, fetchFn)).toBe("off");
    expect(asked).toBe(false);
    expect(off.log).toEqual([]);
  });

  it("rejects Discord's answer when it is about another account", async () => {
    const { value, log } = store({ guildId: GUILD, roleId: null });
    const other = { ...member, user: { id: "888888888888888888" } };
    expect(await recordMembershipAtSignIn(session, value, discord(200, other))).toBe("unknown");
    expect(log).toEqual([]);
  });

  it("never fails the sign-in, even if recording the answer does", async () => {
    const broken: MembershipStore = {
      rule: async () => ({ guildId: GUILD, roleId: null }),
      confirm: async () => {
        throw new Error("database down");
      },
      revoke: async () => {},
    };
    expect(await recordMembershipAtSignIn(session, broken, discord(200, member))).toBe("unknown");
  });
});
