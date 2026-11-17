import { describe, expect, it } from "vitest";
import { fetchUnlockPages } from "@/lib/game-data/sources";

const professions = [
  { id: 164, slug: "blacksmithing", name: "Blacksmithing", iconFileId: 1, childSkillLineIds: [] },
  { id: 186, slug: "mining", name: "Mining", iconFileId: 1, childSkillLineIds: [] },
];

const WOWFOREVER_BS = "https://wowforever.be/tradeskills/forever/blacksmithing/recipes/";
const WOWFOREVER_MINING = "https://wowforever.be/tradeskills/forever/mining/recipes/";
const WIKI_BS =
  "https://warcraft.wiki.gg/api.php?action=parse&page=Forever_blacksmithing_plans&prop=wikitext&format=json&formatversion=2";

function fakeFetch(routes: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    fetchFn: async (url: string) => {
      calls.push(url);
      return url in routes
        ? new Response(routes[url], { status: 200 })
        : new Response("missing", { status: 404 });
    },
  };
}

describe("fetchUnlockPages", () => {
  it("downloads both sources for a profession and unwraps the wiki text", async () => {
    const { fetchFn } = fakeFetch({
      [WOWFOREVER_BS]: "<table>bs</table>",
      [WOWFOREVER_MINING]: "<table>mining</table>",
      [WIKI_BS]: JSON.stringify({ parse: { wikitext: "| [[Iron Buckle]] || 125 ||  || Old || Trainer" } }),
    });
    const { pages } = await fetchUnlockPages(professions, fetchFn);
    expect(pages.blacksmithing).toEqual({
      wowForever: "<table>bs</table>",
      wiki: "| [[Iron Buckle]] || 125 ||  || Old || Trainer",
    });
  });

  it("only asks the wiki for professions it has a page for", async () => {
    const { fetchFn, calls } = fakeFetch({
      [WOWFOREVER_BS]: "x",
      [WOWFOREVER_MINING]: "x",
      [WIKI_BS]: JSON.stringify({ parse: { wikitext: "w" } }),
    });
    const { pages } = await fetchUnlockPages(professions, fetchFn);
    expect(pages.mining).toEqual({ wowForever: "x" });
    expect(calls.filter((url) => url.includes("warcraft.wiki.gg"))).toEqual([WIKI_BS]);
  });

  it("carries on without a page that fails to download, and reports it", async () => {
    const { fetchFn } = fakeFetch({ [WOWFOREVER_MINING]: "x" });
    const { pages, warnings } = await fetchUnlockPages(professions, fetchFn);
    expect(pages.blacksmithing).toEqual({});
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/blacksmithing.*404/i);
  });
});
