import { describe, expect, it } from "vitest";
import { unlinkedCrafters, waitingAccounts } from "@/lib/admin/directory";
import type { AdminDirectory } from "@/lib/admin/types";

const account = (id: string, name: string) => ({ id, name, createdAt: "2026-11-17T04:56:51Z", lastSignInAt: null, isAdmin: false });
const crafter = (id: string, characterName: string, userId: string | null) => ({
  id,
  slug: characterName.toLowerCase(),
  characterName,
  userId,
  isListed: true,
  recipeCount: 0,
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
