import { GEAR_STATS, type GearStat } from "./stats";

/**
 * A visitor's own order of stats for a talent tree, kept in their browser. The
 * page reads it as an external store, so it is the same in every tab and
 * survives a reload; where the browser has no storage it lasts for the visit.
 */
export type CustomOrders = Record<string, GearStat[]>;

const KEY = "gear-orders";
const NONE: CustomOrders = {};
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: CustomOrders } = { raw: null, value: NONE };

function parse(raw: string | null): CustomOrders {
  if (!raw) return NONE;
  try {
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return NONE;
    const orders: CustomOrders = {};
    for (const [tree, order] of Object.entries(stored)) {
      if (!Array.isArray(order)) continue;
      const stats = [...new Set(order.filter((stat): stat is GearStat => typeof stat === "string" && stat in GEAR_STATS))];
      if (stats.length > 0) orders[tree] = stats;
    }
    return orders;
  } catch {
    return NONE;
  }
}

function stored(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return cache.raw;
  }
}

export function readCustomOrders(): CustomOrders {
  const raw = stored();
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

export function readCustomOrdersOnServer(): CustomOrders {
  return NONE;
}

export function subscribeToCustomOrders(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Sets a visitor's order for a talent tree; null goes back to the default. */
export function saveCustomOrder(tree: string, order: GearStat[] | null): void {
  const next = { ...readCustomOrders() };
  if (order === null || order.length === 0) delete next[tree];
  else next[tree] = order;
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, raw);
    cache = { raw, value: next };
  } catch {
    // No storage here (a private window, say): keep it for this visit.
    cache = { raw: cache.raw, value: next };
  }
  for (const listener of listeners) listener();
}
