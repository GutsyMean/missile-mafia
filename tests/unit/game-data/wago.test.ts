import { describe, expect, it } from "vitest";
import { fetchAllTables, fetchTable, resolveLatestBuild, TABLE_NAMES } from "@/lib/game-data/wago";

function fakeFetch(routes: Record<string, { status?: number; body: string }>) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body, { status: route.status ?? 200 });
  };
  return { fetchFn, calls };
}

describe("resolveLatestBuild", () => {
  it("asks for the newest WoW Forever build", async () => {
    const { fetchFn } = fakeFetch({
      "https://wago.tools/api/builds/wowf/latest": {
        body: JSON.stringify({ product: "wowf", version: "1.60.1.70938" }),
      },
    });
    expect(await resolveLatestBuild(fetchFn)).toBe("1.60.1.70938");
  });

  it("fails clearly when the service does not answer with a version", async () => {
    const { fetchFn } = fakeFetch({
      "https://wago.tools/api/builds/wowf/latest": { status: 500, body: "oops" },
    });
    await expect(resolveLatestBuild(fetchFn)).rejects.toThrow(/latest build/i);
  });
});

describe("fetchTable", () => {
  it("downloads one table for an exact build, with hotfixes applied", async () => {
    const { fetchFn, calls } = fakeFetch({
      "https://wago.tools/db2/SpellName/csv?version=1.60.1.70938&useHotfixes=1": {
        body: "ID,Name_lang\n3333,Silvered Bronze Gauntlets\n",
      },
    });
    const rows = await fetchTable("SpellName", "1.60.1.70938", fetchFn);
    expect(rows).toEqual([{ ID: "3333", Name_lang: "Silvered Bronze Gauntlets" }]);
    expect(calls).toHaveLength(1);
  });

  it("names the table when a download fails", async () => {
    const { fetchFn } = fakeFetch({});
    await expect(fetchTable("SpellName", "1.60.1.70938", fetchFn)).rejects.toThrow(/SpellName.*404/);
  });
});

describe("fetchAllTables", () => {
  it("downloads every table the game-data builders need", async () => {
    const routes: Record<string, { body: string }> = {};
    for (const table of TABLE_NAMES) {
      routes[`https://wago.tools/db2/${table}/csv?version=9.9.9.1&useHotfixes=1`] = {
        body: `ID\n1\n`,
      };
    }
    const { fetchFn, calls } = fakeFetch(routes);
    const tables = await fetchAllTables("9.9.9.1", fetchFn);
    expect(Object.keys(tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(calls).toHaveLength(TABLE_NAMES.length);
    for (const name of ["ItemSparse", "SkillLineAbility", "SpellReagents", "RandPropPoints", "GlobalStrings"]) {
      expect(TABLE_NAMES).toContain(name);
    }
  });
});
