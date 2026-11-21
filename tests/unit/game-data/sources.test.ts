import { describe, expect, it } from "vitest";
import { fetchQuestFactions, fetchUnlockPages, wikiQuestsUrl } from "@/lib/game-data/sources";

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

  it("skips professions wowforever.be has no recipe page for", async () => {
    const { fetchFn, calls } = fakeFetch({});
    const poisons = { id: 40, slug: "poisons", name: "Poisons", iconFileId: 1, childSkillLineIds: [] };
    const { pages, warnings } = await fetchUnlockPages([poisons], fetchFn);
    expect(calls).toEqual([]);
    expect(pages.poisons).toEqual({});
    expect(warnings).toEqual([]);
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

  it("asks the wiki which faction each quest on the recipe pages belongs to", async () => {
    const questRow = (item: number, name: string, quests: string[]) =>
      `<tr data-learn="100" data-src="quest"><td><a class="wf-ts__item" href="https://www.wowhead.com/forever/item=${item}"><span>${name}</span></a></td>` +
      `<td class="wf-ts__source">Quest${quests.map((quest) => `<span class="wf-ts__where">${quest}</span>`).join("")}</td></tr>`;
    const titles = ["Gearing Redridge (quest)", "Gearing Redridge", "Trampled Under Foot (quest)", "Trampled Under Foot"];
    const { fetchFn, calls } = fakeFetch({
      [WOWFOREVER_BS]:
        questRow(7916, "Barbaric Iron Boots", ["Trampled Under Foot"]) + questRow(6731, "Ironforge Breastplate", ["Gearing Redridge"]),
      [wikiQuestsUrl(titles)]: JSON.stringify({
        query: {
          pages: [
            { title: "Trampled Under Foot", revisions: [{ slots: { main: { content: "{{Questbox\n| faction = Horde\n}}" } } }] },
            { title: "Gearing Redridge", revisions: [{ slots: { main: { content: "{{Questbox\n| faction = Alliance\n}}" } } }] },
            { title: "Trampled Under Foot (quest)", missing: true },
            { title: "Gearing Redridge (quest)", missing: true },
          ],
        },
      }),
    });
    const { questFactions, warnings } = await fetchUnlockPages(professions, fetchFn);
    expect(questFactions).toEqual({ "Trampled Under Foot": "horde", "Gearing Redridge": "alliance" });
    expect(calls.filter((url) => url.includes("action=query"))).toHaveLength(1);
    expect(warnings.filter((warning) => warning.includes("quests"))).toEqual([]);
  });

  it("carries on without the quest factions when the wiki cannot be reached, and reports it", async () => {
    const { fetchFn } = fakeFetch({
      [WOWFOREVER_BS]:
        '<tr data-learn="100" data-src="quest"><td><a class="wf-ts__item" href="https://www.wowhead.com/forever/item=7916"><span>Barbaric Iron Boots</span></a></td>' +
        '<td class="wf-ts__source">Quest<span class="wf-ts__where">Trampled Under Foot</span></td></tr>',
    });
    const { questFactions, warnings } = await fetchUnlockPages(professions, fetchFn);
    expect(questFactions).toEqual({});
    expect(warnings.some((warning) => /Warcraft Wiki quests 1-1: HTTP 404/.test(warning))).toBe(true);
  });

  it("asks about many quests a batch at a time", async () => {
    const names = Array.from({ length: 60 }, (_, index) => `Quest ${String(index).padStart(2, "0")}`);
    const calls: string[] = [];
    const factions = await fetchQuestFactions(names, async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
    });
    expect(calls).toHaveLength(3);
    expect(factions).toEqual({});
  });

  it("carries on without a page that fails to download, and reports it", async () => {
    const { fetchFn } = fakeFetch({ [WOWFOREVER_MINING]: "x" });
    const { pages, warnings } = await fetchUnlockPages(professions, fetchFn);
    expect(pages.blacksmithing).toEqual({});
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/blacksmithing.*404/i);
  });
});
