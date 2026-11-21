/**
 * Builds the sample documents under e2e/fixtures from the last `pnpm game-data`
 * run: what the public window would get for a guild of two crafters, a
 * Blacksmith at skill 145 and a Tailor at skill 60. Used by the end-to-end
 * tests and for developing the window without a database.
 *
 *   craftables.json   what they can make, and the playable classes
 *   unlearned.json    by profession, the sample recipes neither has learned
 *   gear.json         a little gear from two professions neither of them has
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CraftablesDoc, GearElsewhereDoc, ItemView, RecipeView, UnlearnedDoc } from "../src/lib/craftables/types";
import type { Dataset } from "../src/lib/game-data/dataset";

const ROOT = path.resolve(__dirname, "..");
const dataset = JSON.parse(readFileSync(path.join(ROOT, ".cache/dataset.json"), "utf8")) as Dataset;

const BLACKSMITHING = 164;
const TAILORING = 197;
const DAMIEN = "00000000-0000-4000-8000-000000000001";
const STITCHES = "00000000-0000-4000-8000-000000000002";
const SMITH_SKILL = 145;
const TAILOR_SKILL = 60;

type GameRecipe = Dataset["recipes"][number];
const fromTrainer = (r: GameRecipe) => ["trainer", "starter"].includes(r.unlock.acquisition) && r.unlock.learnSkill !== null;
const bySkill = (a: GameRecipe, b: GameRecipe) =>
  (a.unlock.learnSkill ?? 0) - (b.unlock.learnSkill ?? 0) || a.name.localeCompare(b.name) || a.id - b.id;
const of = (professionId: number) => dataset.recipes.filter((r) => r.professionId === professionId && r.status === "ok");

// Damien: every trainer recipe up to his skill, plus a few plan-taught ones,
// including Bind on Pickup ones, to exercise the soulbound marking.
const EXTRA = new Set(["Veteran's Silvered Chain Helm", "Acolyte's Silvered Chain Helm", "Sterling Silver Shoulders"]);
const smithLearned = of(BLACKSMITHING).filter((r) => (fromTrainer(r) && r.unlock.learnSkill! <= SMITH_SKILL) || EXTRA.has(r.name));
// Not learned by anyone: trainer recipes above his skill, a vendor plan, one whose level the sources
// disagree on, and two from quests only one faction can do (Horde, then Alliance).
const SMITH_PENDING = new Set([
  "Green Iron Hauberk",
  "Golden Scale Bracers",
  "Steel Breastplate",
  "Azure Skyforged Chain",
  "Truesilver Gauntlets",
  "Barbaric Iron Shoulders",
  "Ironforge Breastplate",
]);
const smithUnlearned = of(BLACKSMITHING).filter((r) => SMITH_PENDING.has(r.name) && !smithLearned.includes(r));

// Stitches: the first few tailoring recipes, and two she has yet to reach.
const tailorLearned = of(TAILORING).filter((r) => fromTrainer(r) && r.unlock.learnSkill! <= 40).sort(bySkill).slice(0, 4);
const tailorUnlearned = of(TAILORING).filter((r) => fromTrainer(r) && r.unlock.learnSkill! > TAILOR_SKILL).sort(bySkill).slice(0, 2);

// Gear of professions neither has: a gun and goggles from Engineering, and leather a Paladin might wear.
const ENGINEERING = 202;
const LEATHERWORKING = 165;
const ELSEWHERE: [number, string[]][] = [
  [ENGINEERING, ["Moonsight Rifle", "Flying Tiger Goggles", "Deadly Blunderbuss"]],
  [LEATHERWORKING, ["Toughened Leather Gloves", "Barbaric Bracers", "Defender's Leather Helm"]],
];
const elsewhere = ELSEWHERE.flatMap(([professionId, names]) => of(professionId).filter((r) => names.includes(r.name)));

const itemsById = new Map(dataset.items.map((item) => [item.id, item]));
function itemsOf(recipes: GameRecipe[]): Record<string, ItemView> {
  const items: Record<string, ItemView> = {};
  const include = (id: number | null) => {
    const item = id === null ? undefined : itemsById.get(id);
    if (!item) return;
    // The window does not show an item's own skill requirement.
    const view: ItemView & { requiredSkill?: unknown } = { ...item };
    delete view.requiredSkill;
    // Sent only for items limited to some classes, as the database does.
    if (view.classMask === null) delete view.classMask;
    items[String(item.id)] = view;
  };
  for (const recipe of recipes) {
    include(recipe.craftedItemId);
    for (const reagent of recipe.reagents) include(reagent.itemId);
  }
  return items;
}

const view = (r: GameRecipe, crafterIds: string[], pendingCrafterIds: string[]): RecipeView => ({
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
  crafterIds,
  pendingCrafterIds,
  learnSkill: r.unlock.learnSkill,
  skillYellow: r.skillYellow,
  skillGreen: r.skillGreen,
  skillGrey: r.skillGrey,
  acquisition: r.unlock.acquisition,
  acquisitionText: r.unlock.acquisitionText,
  ...(r.unlock.questFaction ? { questFaction: r.unlock.questFaction } : {}),
});
const inOrder = (a: RecipeView, b: RecipeView) => a.categoryOrder - b.categoryOrder || a.name.localeCompare(b.name) || a.id - b.id;

const profession = (id: number) => {
  const p = dataset.professions.find((entry) => entry.id === id)!;
  return { id: p.id, slug: p.slug, name: p.name, iconFileId: p.iconFileId };
};

const doc: CraftablesDoc = {
  build: dataset.build,
  syncedAt: "2026-11-17T00:00:00.000Z",
  professions: [profession(BLACKSMITHING), profession(TAILORING)],
  crafters: [
    {
      id: DAMIEN,
      slug: "damien",
      characterName: "Damien",
      realm: null,
      faction: "Alliance",
      class: "Paladin",
      level: 24,
      note: "Bring the materials and whisper me in game. Tips welcome, never required.",
      skills: { [String(BLACKSMITHING)]: SMITH_SKILL },
    },
    {
      id: STITCHES,
      slug: "stitches",
      characterName: "Stitches",
      realm: null,
      faction: "Alliance",
      class: "Mage",
      level: 18,
      note: null,
      skills: { [String(TAILORING)]: TAILOR_SKILL },
    },
  ],
  unlearned: [
    { professionId: BLACKSMITHING, count: smithUnlearned.length },
    { professionId: TAILORING, count: tailorUnlearned.length },
  ],
  classes: dataset.classes,
  recipes: [...smithLearned.map((r) => view(r, [DAMIEN], [])), ...tailorLearned.map((r) => view(r, [STITCHES], []))].sort(inOrder),
  items: itemsOf([...smithLearned, ...tailorLearned]),
};

const unlearned: Record<string, UnlearnedDoc> = {
  [String(BLACKSMITHING)]: { recipes: smithUnlearned.map((r) => view(r, [], [DAMIEN])).sort(inOrder), items: itemsOf(smithUnlearned) },
  [String(TAILORING)]: { recipes: tailorUnlearned.map((r) => view(r, [], [STITCHES])).sort(inOrder), items: itemsOf(tailorUnlearned) },
};

writeFileSync(path.join(ROOT, "e2e/fixtures/craftables.json"), JSON.stringify(doc, null, 1) + "\n");
writeFileSync(path.join(ROOT, "e2e/fixtures/unlearned.json"), JSON.stringify(unlearned, null, 1) + "\n");

const gear: GearElsewhereDoc = {
  professions: [profession(ENGINEERING), profession(LEATHERWORKING)].sort((a, b) => a.name.localeCompare(b.name)),
  recipes: elsewhere.map((r) => view(r, [], [])).sort(inOrder),
  items: itemsOf(elsewhere),
};
writeFileSync(path.join(ROOT, "e2e/fixtures/gear.json"), JSON.stringify(gear, null, 1) + "\n");
console.log(
  `Wrote e2e/fixtures: Damien ${smithLearned.length} learned, ${smithUnlearned.length} still to learn; ` +
    `Stitches ${tailorLearned.length} learned (${tailorLearned.map((r) => r.name).join(", ")}), ` +
    `${tailorUnlearned.length} still to learn (${tailorUnlearned.map((r) => `${r.name} ${r.unlock.learnSkill}`).join(", ")}); ` +
    `${elsewhere.length} pieces of gear from other professions (${elsewhere.map((r) => r.name).join(", ")})`,
);
