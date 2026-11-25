import { describe, expect, it } from "vitest";
import { bankContents, describeEntry, moneyDirection } from "@/lib/guild-bank";
import type { BankEntry } from "@/lib/guildy";

const entry = (over: Partial<BankEntry>): BankEntry => ({
  kind: "deposit",
  who: "Bram Anvil",
  id: null,
  name: null,
  count: null,
  tab: null,
  toTab: null,
  copper: null,
  at: 1795390000,
  ...over,
});

describe("describeEntry", () => {
  it("tells money from items by what the line carries", () => {
    expect(describeEntry(entry({ copper: 50000 }))).toEqual({ who: "Bram Anvil", did: "deposited", what: "money" });
    expect(describeEntry(entry({ kind: "withdraw", id: 2841, name: "Bronze Bar", count: 4, tab: 1 }))).toEqual({
      who: "Bram Anvil",
      did: "withdrew",
      what: "item",
    });
  });

  it("says where an item was moved to", () => {
    expect(describeEntry(entry({ kind: "move", id: 2841, name: "Bronze Bar", tab: 1, toTab: 2 }))).toEqual({
      who: "Bram Anvil",
      did: "moved",
      what: "item",
      after: "to tab 2",
    });
  });

  it("puts the game's own words for the things only the bank does", () => {
    expect(describeEntry(entry({ kind: "repair", copper: 12300 }))?.did).toBe("repaired for");
    expect(describeEntry(entry({ kind: "buyTab", copper: 1000000 }))?.did).toBe("bought a tab for");
  });

  it("owns up to a gap in the log", () => {
    expect(describeEntry(entry({ kind: "gap", who: null }))).toMatchObject({ who: "", what: null });
  });

  it("names nobody it does not know", () => {
    expect(describeEntry(entry({ who: null, copper: 1 }))?.who).toBe("Someone");
  });

  it("shows a kind it has not met as the game names it, and drops a line with nothing in it", () => {
    expect(describeEntry(entry({ kind: "auctionSale", copper: 5 }))).toEqual({ who: "Bram Anvil", did: "auctionSale", what: "money" });
    expect(describeEntry(entry({ kind: "auctionSale" }))).toBeNull();
  });
});

describe("moneyDirection", () => {
  it("knows which lines put gold in and which took it out", () => {
    expect(moneyDirection(entry({ copper: 5 }))).toBe("in");
    expect(moneyDirection(entry({ kind: "withdraw", copper: 5 }))).toBe("out");
    expect(moneyDirection(entry({ kind: "repair", copper: 5 }))).toBe("out");
  });

  it("leaves a tab bought by its buyer, and every line about an item, out of it", () => {
    expect(moneyDirection(entry({ kind: "buyTab", copper: 5 }))).toBeNull();
    expect(moneyDirection(entry({ kind: "withdraw", id: 2841, name: "Bronze Bar" }))).toBeNull();
  });
});

describe("bankContents", () => {
  it("counts the slots in use and the things in them", () => {
    const tabs = [
      { n: 1, name: "Ore", slots: [{ slot: 1, id: 2842, name: "Silver Bar", count: 5 }, { slot: 3, id: 2841, name: "Bronze Bar", count: 20 }] },
      { n: 2, name: "Empty", slots: [] },
    ];
    expect(bankContents(tabs)).toEqual({ slots: 2, items: 25 });
  });
});
