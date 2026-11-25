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

/** The other characters of a crafter's player. Empty when no player is known for it. */
export function samePlayer(crafter: DirectoryCrafter, directory: AdminDirectory): DirectoryCrafter[] {
  if (crafter.playerId === null) return [];
  return directory.crafters.filter((other) => other.id !== crafter.id && other.playerId === crafter.playerId);
}

/** A crafter and the other characters of its player, as far as nobody manages them yet. */
export function unlinkedOfPlayer(crafter: DirectoryCrafter, directory: AdminDirectory): DirectoryCrafter[] {
  return [crafter, ...samePlayer(crafter, directory)].filter((one) => one.userId === null);
}

/**
 * The account an unmanaged crafter most likely belongs to: the one that asked
 * for it when signing up, else the one that manages another of the player's
 * characters. Null when nothing points at anyone.
 */
export function likelyOwner(crafter: DirectoryCrafter, directory: AdminDirectory): string | null {
  const known = new Set(directory.accounts.map((account) => account.id));
  const asked = crafter.claimedBy.find((id) => known.has(id));
  if (asked) return asked;
  const siblings = samePlayer(crafter, directory);
  const manager = siblings.find((one) => one.userId !== null && known.has(one.userId))?.userId;
  if (manager) return manager;
  return siblings.flatMap((one) => one.claimedBy).find((id) => known.has(id)) ?? null;
}

/** The unmanaged crafters an account asked for when signing up. */
export function askedFor(accountId: string, directory: AdminDirectory): DirectoryCrafter[] {
  return directory.crafters.filter((crafter) => crafter.userId === null && crafter.claimedBy.includes(accountId));
}

/** The crafters in list order, with each player's characters next to one another. */
export function byPlayer(directory: AdminDirectory): DirectoryCrafter[] {
  const placed = new Set<string>();
  const ordered: DirectoryCrafter[] = [];
  for (const crafter of directory.crafters) {
    if (placed.has(crafter.id)) continue;
    for (const one of [crafter, ...samePlayer(crafter, directory)]) {
      placed.add(one.id);
      ordered.push(one);
    }
  }
  return ordered;
}

/** Names as a phrase: "A", "A and B", "A, B and C". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
