/**
 * Builds e2e/fixtures/craftables.json from the last `pnpm game-data` run: the
 * document the public window would get for one Blacksmith at skill 145. Used
 * by the end-to-end tests and for developing the window without a database.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CraftablesDoc, ItemView } from "../src/lib/craftables/types";
import type { Dataset } from "../src/lib/game-data/dataset";

const ROOT = path.resolve(__dirname, "..");
const dataset = JSON.parse(readFileSync(path.join(ROOT, ".cache/dataset.json"), "utf8")) as Dataset;

const SKILL = 145;
const BLACKSMITHING = 164;
// A few plan-taught recipes, including Bind on Pickup ones, to exercise the soulbound marking.
const EXTRA = new Set(["Veteran's Silvered Chain Helm", "Acolyte's Silvered Chain Helm", "Sterling Silver Shoulders"]);

// Recipes Damien has not learned, shown greyed out: trainer recipes above his skill,
// a vendor plan, and one whose unlock level the sources disagree on.
const PENDING = new Set(["Green Iron Hauberk", "Golden Scale Bracers", "Steel Breastplate", "Azure Skyforged Chain", "Truesilver Gauntlets"]);

const learned = dataset.recipes.filter(
  (r) =>
    r.professionId === BLACKSMITHING &&
    r.status === "ok" &&
    ((["trainer", "starter"].includes(r.unlock.acquisition) &&
      r.unlock.learnSkill !== null &&
      r.unlock.learnSkill <= SKILL) ||
      EXTRA.has(r.name)),
);
const learnedIds = new Set(learned.map((r) => r.id));
const pending = dataset.recipes.filter(
  (r) => r.professionId === BLACKSMITHING && r.status === "ok" && PENDING.has(r.name) && !learnedIds.has(r.id),
);
const recipes = [...learned, ...pending];

const itemsById = new Map(dataset.items.map((item) => [item.id, item]));
const items: Record<string, ItemView> = {};
const include = (id: number | null) => {
  const item = id === null ? undefined : itemsById.get(id);
  if (!item) return;
  // The window does not show an item's own skill requirement.
  const view: ItemView & { requiredSkill?: unknown } = { ...item };
  delete view.requiredSkill;
  items[String(item.id)] = view;
};
for (const recipe of recipes) {
  include(recipe.craftedItemId);
  for (const reagent of recipe.reagents) include(reagent.itemId);
}

const CRAFTER = "00000000-0000-4000-8000-000000000001";
const profession = dataset.professions.find((p) => p.id === BLACKSMITHING)!;
const doc: CraftablesDoc = {
  build: dataset.build,
  syncedAt: "2026-11-17T00:00:00.000Z",
  professions: [{ id: profession.id, slug: profession.slug, name: profession.name, iconFileId: profession.iconFileId }],
  crafters: [
    {
      id: CRAFTER,
      slug: "damien",
      characterName: "Damien",
      realm: null,
      faction: "Alliance",
      class: "Paladin",
      level: 24,
      note: "Bring the materials and whisper me in game. Tips welcome, never required.",
      skills: { [String(BLACKSMITHING)]: SKILL },
    },
  ],
  recipes: recipes
    .map((r) => ({
      id: r.id,
      professionId: r.professionId,
      name: r.name,
      iconFileId: r.iconFileId,
      craftedItemId: r.craftedItemId,
      craftedCount: r.craftedCount,
      effectText: r.effectText,
      category: r.category,
      categoryOrder: r.categoryOrder,
      reagents: r.reagents.map((g) => [g.itemId, g.quantity] as [number, number]),
      crafterIds: learnedIds.has(r.id) ? [CRAFTER] : [],
      pendingCrafterIds: learnedIds.has(r.id) ? [] : [CRAFTER],
      learnSkill: r.unlock.learnSkill,
      skillYellow: r.skillYellow,
      skillGreen: r.skillGreen,
      skillGrey: r.skillGrey,
      acquisition: r.unlock.acquisition,
      acquisitionText: r.unlock.acquisitionText,
    }))
    .sort((a, b) => a.categoryOrder - b.categoryOrder || a.name.localeCompare(b.name) || a.id - b.id),
  items,
};

const out = path.join(ROOT, "e2e/fixtures/craftables.json");
writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(`Wrote ${out}: ${learned.length} learned and ${pending.length} not yet learned recipes, ${Object.keys(items).length} items`);
