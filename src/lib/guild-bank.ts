import type { BankEntry, BankTab } from "@/lib/guildy";

/** The guild bank as `guild_bank()` returns it to a member. */
export interface GuildBankDoc {
  /** The gold in the bank, in copper. */
  money: number;
  /** What the next tab costs, in copper. Null when it was not read; zero when there is none to buy. */
  nextTabCost: number | null;
  tabs: BankTab[];
  /** Newest first. */
  ledger: BankEntry[];
  /** When it was read in game, by which character, and when it reached the site. */
  readAt: string;
  readBy: string | null;
  importedAt: string;
  /** What the site knows about the items in it, by item id. */
  items: Record<string, { name: string; quality: number; iconFileId: number }>;
}

const MONEY_IN = new Set(["deposit", "depositSummary", "refundRename"]);
const MONEY_OUT = new Set(["withdraw", "repair", "withdrawForTab", "buyRename"]);

/** How a ledger line reads: who, what they did, to what, and anything said after that. */
export interface EntryTold {
  who: string;
  did: string;
  what: "money" | "item" | null;
  /** Follows the money or the item, as in "moved 20 × Silk Cloth to tab 2". */
  after?: string;
}

/** A ledger line in words. Null for a line with nothing to say. */
export function describeEntry(entry: BankEntry): EntryTold | null {
  const who = entry.who ?? "Someone";
  const item = entry.name !== null || entry.id !== null;
  switch (entry.kind) {
    case "gap":
      return { who: "", did: "Older lines may be missing here: the bank keeps only its newest.", what: null };
    case "deposit":
    case "depositSummary":
      return { who, did: "deposited", what: item ? "item" : "money" };
    case "withdraw":
      return { who, did: "withdrew", what: item ? "item" : "money" };
    case "move":
      return { who, did: "moved", what: "item", after: entry.toTab ? `to tab ${entry.toTab}` : undefined };
    case "repair":
      return { who, did: "repaired for", what: "money" };
    case "buyTab":
      return { who, did: "bought a tab for", what: "money" };
    case "withdrawForTab":
      return { who, did: "took for a new tab", what: "money" };
    case "buyRename":
      return { who, did: "paid for a rename", what: "money" };
    case "refundRename":
      return { who, did: "was refunded a rename", what: "money" };
    default:
      return entry.copper !== null || item ? { who, did: entry.kind, what: item ? "item" : "money" } : null;
  }
}

/** Whether a line about money put gold in, took it out, or neither. */
export function moneyDirection(entry: BankEntry): "in" | "out" | null {
  if (entry.copper === null || entry.name !== null || entry.id !== null) return null;
  if (MONEY_IN.has(entry.kind)) return "in";
  if (MONEY_OUT.has(entry.kind)) return "out";
  return null;
}

/** How many slots of a bank are in use, and how many things lie in them. */
export function bankContents(tabs: BankTab[]): { slots: number; items: number } {
  let slots = 0;
  let items = 0;
  for (const tab of tabs) {
    slots += tab.slots.length;
    for (const held of tab.slots) items += held.count;
  }
  return { slots, items };
}
