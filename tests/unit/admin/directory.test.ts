import { describe, expect, it } from "vitest";
import {
  askedFor,
  byPlayer,
  likelyOwner,
  listNames,
  samePlayer,
  unlinkedCrafters,
  unlinkedOfPlayer,
  waitingAccounts,
} from "@/lib/admin/directory";
import type { AdminDirectory } from "@/lib/admin/types";

const account = (id: string, name: string) => ({ id, name, createdAt: "2026-11-17T04:56:51Z", lastSignInAt: null, isAdmin: false });
const crafter = (
  id: string,
  characterName: string,
  userId: string | null,
  more: { playerId?: string; claimedBy?: string[] } = {},
) => ({
  id,
  slug: characterName.toLowerCase(),
  characterName,
  userId,
  isListed: true,
  recipeCount: 0,
  playerId: more.playerId ?? null,
  claimedBy: more.claimedBy ?? [],
});

const directory: AdminDirectory = {
  accounts: [account("u3", "Newest"), account("u2", "Linked twice"), account("u1", "Owner")],
  crafters: [crafter("c1", "Damien", "u1"), crafter("c2", "Alt", "u2"), crafter("c3", "Main", "u2"), crafter("c4", "Spare", null)],
};

describe("waitingAccounts", () => {
  it("lists the accounts that have signed in but manage no crafter", () => {
    expect(waitingAccounts(directory).map((a) => a.name)).toEqual(["Newest"]);
  });

  it("keeps the order given, newest first", () => {
    const nobodyLinked = { ...directory, crafters: [] };
    expect(waitingAccounts(nobodyLinked).map((a) => a.id)).toEqual(["u3", "u2", "u1"]);
  });

  it("is empty when everyone is linked", () => {
    expect(waitingAccounts({ accounts: [account("u1", "Owner")], crafters: [crafter("c1", "Damien", "u1")] })).toEqual([]);
  });
});

describe("unlinkedCrafters", () => {
  it("lists the crafters nobody manages yet", () => {
    expect(unlinkedCrafters(directory).map((c) => c.characterName)).toEqual(["Spare"]);
  });
});

describe("one player's characters", () => {
  const guild: AdminDirectory = {
    accounts: [account("u3", "Newest"), account("u2", "Max"), account("u1", "Owner")],
    crafters: [
      crafter("a", "Ada Flint", null),
      crafter("m1", "Max Chill", null, { playerId: "p1" }),
      crafter("b", "Bram Anvil", "u1"),
      crafter("m2", "Max Gaming", null, { playerId: "p1", claimedBy: ["gone", "u3"] }),
      crafter("m3", "Max Hammer", "u2", { playerId: "p1" }),
      crafter("r1", "Rook", null, { playerId: "p2" }),
      crafter("r2", "Rook Castle", null, { playerId: "p2" }),
    ],
  };
  const named = (id: string) => guild.crafters.find((c) => c.id === id)!;

  it("names the other characters of a crafter's player", () => {
    expect(samePlayer(named("m1"), guild).map((c) => c.characterName)).toEqual(["Max Gaming", "Max Hammer"]);
    expect(samePlayer(named("a"), guild)).toEqual([]);
  });

  it("lists what of a player is still to be handed over", () => {
    expect(unlinkedOfPlayer(named("m1"), guild).map((c) => c.id)).toEqual(["m1", "m2"]);
    expect(unlinkedOfPlayer(named("a"), guild).map((c) => c.id)).toEqual(["a"]);
  });

  it("points at the account that asked for a character", () => {
    expect(likelyOwner(named("m2"), guild)).toBe("u3");
  });

  it("else at the account that manages another character of the player", () => {
    expect(likelyOwner(named("m1"), guild)).toBe("u2");
  });

  it("points at nobody when nothing is known", () => {
    expect(likelyOwner(named("a"), guild)).toBeNull();
    expect(likelyOwner(named("r1"), guild)).toBeNull();
  });

  it("lists the characters an account asked for", () => {
    expect(askedFor("u3", guild).map((c) => c.characterName)).toEqual(["Max Gaming"]);
    expect(askedFor("u1", guild)).toEqual([]);
  });

  it("puts a player's characters next to one another, otherwise keeping the order", () => {
    expect(byPlayer(guild).map((c) => c.id)).toEqual(["a", "m1", "m2", "m3", "b", "r1", "r2"]);
  });

  it("writes names as a phrase", () => {
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C"])).toBe("A, B and C");
  });
});
