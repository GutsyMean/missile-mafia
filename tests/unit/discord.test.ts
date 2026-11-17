import { describe, expect, it } from "vitest";
import { checkMembership } from "@/lib/discord";

const GUILD = "123456789012345678";
const ROLE = "222222222222222222";
const DISCORD_USER = "999999999999999999";

/** A stand-in for Discord's API that records what it was asked. */
function discord(status: number, body: unknown = {}) {
  const calls: { url: string; authorization: string | null }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const member = (over: Record<string, unknown> = {}) => ({
  nick: "Thrallfan",
  roles: ["111111111111111111", ROLE],
  user: { id: DISCORD_USER, username: "thrall", global_name: "Thrall" },
  ...over,
});

describe("checkMembership", () => {
  it("asks Discord about the signed-in account's membership of that one server", async () => {
    const { fetchFn, calls } = discord(200, member());
    await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn });
    expect(calls).toEqual([
      { url: `https://discord.com/api/v10/users/@me/guilds/${GUILD}/member`, authorization: "Bearer tok" },
    ]);
  });

  it("confirms a member of the server and returns the name they use there", async () => {
    const { fetchFn } = discord(200, member());
    expect(await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).toEqual({
      status: "member",
      name: "Thrallfan",
    });
  });

  it("falls back to the account's display name when there is no server nickname", async () => {
    const { fetchFn } = discord(200, member({ nick: null }));
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).name).toBe("Thrall");
  });

  it("refuses an account that is not in the server", async () => {
    const { fetchFn } = discord(404, { message: "Unknown Guild", code: 10004 });
    expect(await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).toEqual({
      status: "not_member",
      name: null,
    });
  });

  it("requires the role when one is set", async () => {
    const without = discord(200, member({ roles: ["111111111111111111"] }));
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: ROLE, discordUserId: DISCORD_USER, fetchFn: without.fetchFn })).status).toBe("not_member");
    const withRole = discord(200, member());
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: ROLE, discordUserId: DISCORD_USER, fetchFn: withRole.fetchFn })).status).toBe("member");
  });

  it("does not decide either way when Discord cannot be asked", async () => {
    for (const status of [401, 403, 429, 500]) {
      const { fetchFn } = discord(status, { message: "nope" });
      expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).status).toBe("unknown");
    }
    const failing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn: failing })).status).toBe("unknown");
  });

  it("does not trust an answer about a different Discord account", async () => {
    const { fetchFn } = discord(200, member({ user: { id: "888888888888888888", username: "someone-else" } }));
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).status).toBe("unknown");
  });

  it("does not trust an answer it cannot read", async () => {
    const { fetchFn } = discord(200, { nick: "x" });
    expect((await checkMembership({ token: "tok", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).status).toBe("unknown");
  });

  it("never sends a request for a server id that is not a Discord id", async () => {
    const { fetchFn, calls } = discord(200, member());
    expect((await checkMembership({ token: "tok", guildId: "../../users/@me", roleId: null, discordUserId: DISCORD_USER, fetchFn })).status).toBe("unknown");
    expect(calls).toEqual([]);
  });

  it("does not ask without a token", async () => {
    const { fetchFn, calls } = discord(200, member());
    expect((await checkMembership({ token: "", guildId: GUILD, roleId: null, discordUserId: DISCORD_USER, fetchFn })).status).toBe("unknown");
    expect(calls).toEqual([]);
  });
});
