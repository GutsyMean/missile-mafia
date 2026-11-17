import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { CraftablesDoc } from "./types";

export const CRAFTABLES_TAG = "craftables";

const EMPTY: CraftablesDoc = {
  build: null,
  syncedAt: null,
  professions: [],
  crafters: [],
  recipes: [],
  items: {},
};

/**
 * Everything the public crafting window shows. Cached and refreshed on demand
 * (after a crafter saves, or after a game-data sync) through its tag.
 */
export async function loadCraftables(): Promise<CraftablesDoc> {
  "use cache";
  cacheLife("hours");
  cacheTag(CRAFTABLES_TAG);

  // Tests and local work without a database read the committed sample document.
  if (process.env.CRAFTABLES_FIXTURE === "1") {
    const fixture = await import("../../../e2e/fixtures/craftables.json");
    return fixture.default as unknown as CraftablesDoc;
  }

  const supabase = createPublicClient();
  if (!supabase) return EMPTY;
  const { data, error } = await supabase.rpc("guild_craftables");
  if (error) throw new Error(`Could not load the crafting list: ${error.message}`);
  return (data as CraftablesDoc | null) ?? EMPTY;
}
