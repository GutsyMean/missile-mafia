import type { AdminDirectory, DirectoryAccount, DirectoryCrafter } from "./types";

/** Accounts that have signed in but manage no crafter yet, in the order given. */
export function waitingAccounts(directory: AdminDirectory): DirectoryAccount[] {
  const linked = new Set(directory.crafters.map((crafter) => crafter.userId));
  return directory.accounts.filter((account) => !linked.has(account.id));
}

/** Crafters nobody manages yet. */
export function unlinkedCrafters(directory: AdminDirectory): DirectoryCrafter[] {
  return directory.crafters.filter((crafter) => crafter.userId === null);
}
