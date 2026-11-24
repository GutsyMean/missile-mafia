import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { CraftablesDoc, GearElsewhereDoc, GearSourcesDoc, UnlearnedDoc } from "./types";

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

const NOTHING: UnlearnedDoc = { recipes: [], items: {} };

/**
 * The recipes of one profession nobody has learned yet. Kept out of the main
 * document so that it stays small; cached and refreshed the same way.
 */
export async function loadUnlearned(professionId: number): Promise<UnlearnedDoc> {
  "use cache";
  cacheLife("hours");
  cacheTag(CRAFTABLES_TAG);

  if (process.env.CRAFTABLES_FIXTURE === "1") {
    const fixture = await import("../../../e2e/fixtures/unlearned.json");
    return (fixture.default as unknown as Record<string, UnlearnedDoc>)[String(professionId)] ?? NOTHING;
  }

  const supabase = createPublicClient();
  if (!supabase) return NOTHING;
  const { data, error } = await supabase.rpc("guild_unlearned", { p_profession_id: professionId });
  if (error) throw new Error(`Could not load the recipes still to learn: ${error.message}`);
  return (data as UnlearnedDoc | null) ?? NOTHING;
}

const NO_GEAR_ELSEWHERE: GearElsewhereDoc = { professions: [], recipes: [], items: {} };

/**
 * Things to wear and wield from professions nobody in the guild has. Only the
 * gear finder asks for these, so that "the best craftable piece" looks at
 * everything the game has; cached and refreshed like the rest.
 */
export async function loadGearElsewhere(): Promise<GearElsewhereDoc> {
  "use cache";
  cacheLife("hours");
  cacheTag(CRAFTABLES_TAG);

  if (process.env.CRAFTABLES_FIXTURE === "1") {
    const fixture = await import("../../../e2e/fixtures/gear.json");
    return fixture.default as unknown as GearElsewhereDoc;
  }

  const supabase = createPublicClient();
  if (!supabase) return NO_GEAR_ELSEWHERE;
  const { data, error } = await supabase.rpc("guild_gear_elsewhere");
  if (error) throw new Error(`Could not load the gear of other professions: ${error.message}`);
  return (data as GearElsewhereDoc | null) ?? NO_GEAR_ELSEWHERE;
}

const NO_SOURCED_GEAR: GearSourcesDoc = { items: {}, sources: {} };

/**
 * Gear that is not crafted: dungeon drops, quest rewards and pieces named on a
 * best-in-slot list, each with where it comes from. Only the gear finder asks
 * for it, and only when a visitor wants gear from every source compared.
 */
export async function loadGearFromSources(): Promise<GearSourcesDoc> {
  "use cache";
  cacheLife("hours");
  cacheTag(CRAFTABLES_TAG);

  if (process.env.CRAFTABLES_FIXTURE === "1") {
    const fixture = await import("../../../e2e/fixtures/gear-sources.json");
    return fixture.default as unknown as GearSourcesDoc;
  }

  const supabase = createPublicClient();
  if (!supabase) return NO_SOURCED_GEAR;
  const { data, error } = await supabase.rpc("gear_from_sources");
  if (error) throw new Error(`Could not load gear from drops and quests: ${error.message}`);
  return (data as GearSourcesDoc | null) ?? NO_SOURCED_GEAR;
}
