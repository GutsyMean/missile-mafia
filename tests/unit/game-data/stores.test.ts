import { describe, expect, it } from "vitest";
import { managementApiStore, sqlJson } from "@/lib/game-data/stores";
import type { SyncStats } from "@/lib/game-data/sync";

const stats = (over: Partial<SyncStats> = {}): SyncStats => ({
  build: null,
  itemsTotal: 0,
  recipesTotal: 0,
  itemsWritten: 0,
  recipesWritten: 0,
  newRecipes: 0,
  removedRecipes: 0,
  ...over,
});

describe("sqlJson", () => {
  it("wraps JSON in a dollar-quoted literal cast to jsonb", () => {
    const sql = sqlJson({ name: "Veteran's Silvered Chain Helm" });
    expect(sql).toBe(`$j${'$'}{"name":"Veteran's Silvered Chain Helm"}$j$::jsonb`);
  });

  it("picks a quoting tag the data cannot close early", () => {
    const hostile = { text: "$j$ and then more SQL" };
    const sql = sqlJson(hostile);
    const tag = sql.match(/^(\$\w+\$)/)![1];
    expect(tag).not.toBe("$j$");
    // The tag appears exactly twice: once to open and once to close the literal.
    expect(sql.split(tag)).toHaveLength(3);
  });
});

describe("managementApiStore", () => {
  function fakeApi(results: unknown[]) {
    const calls: { url: string; query: string }[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, query: JSON.parse(String(init?.body)).query });
      return new Response(JSON.stringify([{ result: results.shift() }]), { status: 201 });
    };
    return { calls, fetchFn };
  }

  it("runs each sync step as a call to the matching database function", async () => {
    const { calls, fetchFn } = fakeApi([
      7,
      { items: {}, recipes: {}, professions: [] },
      { items: 1, recipes: 0, newRecipes: 0 },
      0,
    ]);
    const store = managementApiStore("abcdefgh", fetchFn);

    expect(await store.start("cli")).toBe(7);
    expect(await store.state()).toEqual({ items: {}, recipes: {}, professions: [] });
    expect(await store.apply(7, { items: [{ id: 1 }] })).toEqual({ items: 1, recipes: 0, newRecipes: 0 });
    expect(
      await store.finish(7, {
        status: "ok",
        build: "1.60.1.70938",
        stats: stats({ build: "1.60.1.70938", itemsTotal: 1, itemsWritten: 1 }),
        warnings: [],
        error: null,
        presentRecipeIds: [3333, 2675],
      }),
    ).toBe(0);

    expect(calls.every((c) => c.url === "https://api.supabase.com/v1/projects/abcdefgh/database/query")).toBe(true);
    expect(calls[0].query).toContain("public.sync_start('cli')");
    expect(calls[1].query).toContain("public.sync_state()");
    expect(calls[2].query).toContain(`public.sync_apply(7, $j${'$'}{"items":[{"id":1}]}$j$::jsonb)`);
    expect(calls[3].query).toContain("public.sync_finish(7, 'ok', '1.60.1.70938'");
    expect(calls[3].query).toContain("array[3333,2675]::integer[]");
  });

  it("passes null for the recipe list when the run failed", async () => {
    const { calls, fetchFn } = fakeApi([0]);
    await managementApiStore("abcdefgh", fetchFn).finish(3, {
      status: "failed",
      build: null,
      stats: stats(),
      warnings: [],
      error: "it's broken",
      presentRecipeIds: null,
    });
    expect(calls[0].query).toContain("'failed', null,");
    expect(calls[0].query).toContain("'it''s broken'");
    expect(calls[0].query).toContain("null::integer[])");
  });

  it("reports a database error with its message", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ message: "permission denied" }), { status: 400 });
    await expect(managementApiStore("abcdefgh", fetchFn).start("cli")).rejects.toThrow(/permission denied/);
  });
});
