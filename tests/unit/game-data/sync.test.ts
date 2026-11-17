import { describe, expect, it } from "vitest";
import { buildDataset, type Dataset } from "@/lib/game-data/dataset";
import {
  runSync,
  type GameDataStore,
  type StoreState,
  type SyncBatch,
  type SyncFinish,
} from "@/lib/game-data/sync";
import { loadFixtureTables, readFixture } from "../../helpers/fixtures";

function freshDataset(): Dataset {
  return buildDataset(loadFixtureTables(), "1.60.1.70938", {
    blacksmithing: {
      wowForever: readFixture("unlock/wowforever-blacksmithing.html"),
      wiki: readFixture("unlock/wiki-blacksmithing.wikitext"),
    },
  });
}

/** An in-memory stand-in for the database, behaving like the SQL functions do. */
class MemoryStore implements GameDataStore {
  items = new Map<number, Record<string, unknown>>();
  recipes = new Map<number, Record<string, unknown>>();
  professions = new Set<number>();
  runs: { id: number; trigger: string; finish?: SyncFinish }[] = [];
  applied: SyncBatch[] = [];

  async start(trigger: string) {
    this.runs.push({ id: this.runs.length + 1, trigger });
    return this.runs.length;
  }
  async state(): Promise<StoreState> {
    const hashes = (rows: Map<number, Record<string, unknown>>) =>
      Object.fromEntries(
        [...rows].filter(([, row]) => row.status !== "removed").map(([id, row]) => [id, String(row.content_hash)]),
      );
    return { items: hashes(this.items), recipes: hashes(this.recipes), professions: [...this.professions] };
  }
  async apply(_runId: number, batch: SyncBatch) {
    this.applied.push(batch);
    let newRecipes = 0;
    for (const p of batch.professions ?? []) this.professions.add(p.id);
    for (const row of batch.items ?? []) this.items.set(row.id, row);
    for (const row of batch.recipes ?? []) {
      if (!this.recipes.has(row.id)) newRecipes++;
      this.recipes.set(row.id, row);
    }
    return { items: batch.items?.length ?? 0, recipes: batch.recipes?.length ?? 0, newRecipes };
  }
  async finish(runId: number, finish: SyncFinish) {
    this.runs[runId - 1].finish = finish;
    let removed = 0;
    if (finish.status === "ok" && finish.presentRecipeIds) {
      const present = new Set(finish.presentRecipeIds);
      for (const [id, row] of this.recipes) {
        if (!present.has(id) && row.status !== "removed") {
          row.status = "removed";
          removed++;
        }
      }
    }
    return removed;
  }
}

const load = (dataset: Dataset, warnings: string[] = []) => async () => ({ dataset, warnings });

describe("runSync — first run", () => {
  it("stores every profession, item and recipe", async () => {
    const store = new MemoryStore();
    const dataset = freshDataset();
    const result = await runSync({ store, trigger: "manual", load: load(dataset) });

    expect(result.status).toBe("ok");
    expect(store.items.size).toBe(dataset.items.length);
    expect(store.recipes.size).toBe(dataset.recipes.length);
    expect(store.professions.size).toBe(dataset.professions.length);
    expect(result.stats).toMatchObject({
      build: "1.60.1.70938",
      itemsWritten: dataset.items.length,
      recipesWritten: dataset.recipes.length,
      newRecipes: dataset.recipes.length,
      removedRecipes: 0,
    });
  });

  it("writes rows in the shape the database expects", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });

    expect(store.recipes.get(3333)).toMatchObject({
      id: 3333,
      profession_id: 164,
      name: "Silvered Bronze Gauntlets",
      crafted_item_id: 3483,
      skill_yellow: 140,
      learn_skill: 110,
      learn_skill_status: "confirmed",
      acquisition: "trainer",
      training_cost: 1000,
      category: "Mail Armor",
      status: "ok",
      reagents: [
        [2841, 8],
        [2842, 1],
        [3478, 2],
      ],
    });
    expect(store.items.get(250528)).toMatchObject({
      id: 250528,
      name: "Veteran's Silvered Chain Helm",
      bonding: 1,
      icon_file_id: 133141,
      slot_name: "Head",
      type_name: "Mail",
    });
    expect(store.items.get(3483)!.tooltip).toHaveLength(8);
  });

  it("splits a large write into batches", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()), batchSize: 10 });
    expect(store.applied.length).toBeGreaterThan(3);
    for (const batch of store.applied) {
      expect((batch.items?.length ?? 0) + (batch.recipes?.length ?? 0)).toBeLessThanOrEqual(10);
    }
  });

  it("records the run and who started it", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "cron", load: load(freshDataset(), ["wowforever.be mining: HTTP 404"]) });
    expect(store.runs[0]).toMatchObject({
      trigger: "cron",
      finish: { status: "ok", build: "1.60.1.70938", warnings: ["wowforever.be mining: HTTP 404"] },
    });
  });
});

describe("runSync — later runs", () => {
  it("writes nothing when nothing changed", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    store.applied = [];

    const second = await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    expect(store.applied).toEqual([]);
    expect(second.stats).toMatchObject({ itemsWritten: 0, recipesWritten: 0, newRecipes: 0, removedRecipes: 0 });
  });

  it("writes only the rows that changed", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    store.applied = [];

    const changed = freshDataset();
    changed.items.find((i) => i.id === 3483)!.armor = 120;
    changed.recipes.find((r) => r.id === 3333)!.unlock.learnSkill = 115;
    const result = await runSync({ store, trigger: "manual", load: load(changed) });

    expect(store.applied.flatMap((b) => b.items ?? []).map((row) => row.id)).toEqual([3483]);
    expect(store.applied.flatMap((b) => b.recipes ?? []).map((row) => row.id)).toEqual([3333]);
    expect(result.stats).toMatchObject({ itemsWritten: 1, recipesWritten: 1, newRecipes: 0 });
  });

  it("reports a recipe the game added as new", async () => {
    const store = new MemoryStore();
    const before = freshDataset();
    before.recipes = before.recipes.filter((r) => r.id !== 1252277);
    await runSync({ store, trigger: "manual", load: load(before) });

    const result = await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    expect(result.stats.newRecipes).toBe(1);
    expect(store.recipes.get(1252277)).toMatchObject({ name: "Veteran's Silvered Chain Helm" });
  });

  it("retires a recipe the game no longer lists, without deleting it", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });

    const after = freshDataset();
    after.recipes = after.recipes.filter((r) => r.id !== 8768);
    const result = await runSync({ store, trigger: "manual", load: load(after) });

    expect(result.stats.removedRecipes).toBe(1);
    expect(store.recipes.get(8768)).toMatchObject({ status: "removed" });
  });
});

describe("runSync — when something goes wrong", () => {
  it("leaves the data untouched and records the error when the download fails", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    const itemsBefore = new Map(store.items);
    store.applied = [];

    const result = await runSync({
      store,
      trigger: "cron",
      load: async () => {
        throw new Error("Could not download table ItemSparse for build 1.60.1.70938 (HTTP 503)");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/ItemSparse.*503/);
    expect(store.applied).toEqual([]);
    expect(store.items).toEqual(itemsBefore);
    expect(store.runs[1].finish).toMatchObject({ status: "failed", presentRecipeIds: null });
    expect([...store.recipes.values()].some((row) => row.status === "removed")).toBe(false);
  });

  it("refuses a download that has lost most of the recipes, rather than retiring them all", async () => {
    const store = new MemoryStore();
    await runSync({ store, trigger: "manual", load: load(freshDataset()) });
    store.applied = [];

    const broken = freshDataset();
    broken.recipes = broken.recipes.slice(0, 2);
    const result = await runSync({ store, trigger: "cron", load: load(broken) });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/recipes dropped/i);
    expect(store.applied).toEqual([]);
    expect([...store.recipes.values()].some((row) => row.status === "removed")).toBe(false);
  });
});
