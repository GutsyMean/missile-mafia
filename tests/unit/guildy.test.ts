import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchGuildyMember,
  playersToRecord,
  readGuildyFile,
  samePlayer,
  suggestCrafters,
  toImportMember,
  type GuildImportMember,
  type GuildyGuild,
} from "@/lib/guildy";

const FILE = readFileSync(path.resolve(__dirname, "../fixtures/guildy/Guildy.lua"), "utf8");

function guilds(text = FILE): GuildyGuild[] {
  const file = readGuildyFile(text);
  if (!file.ok) throw new Error(file.problem);
  return file.guilds;
}

const PROFESSIONS = [
  { id: 164, name: "Blacksmithing", childSkillLineIds: [2938] },
  { id: 185, name: "Cooking", childSkillLineIds: [2939] },
  { id: 186, name: "Mining", childSkillLineIds: [2946] },
  { id: 197, name: "Tailoring", childSkillLineIds: [2948] },
];
/** Recipe id → profession id. */
const RECIPES = new Map([
  [2385, 197],
  [2386, 197],
  [3915, 197],
  [2538, 185],
  [8604, 185],
  [3333, 164],
  [1252277, 164],
]);

describe("readGuildyFile", () => {
  it("lists each guild's members, the largest guild first", () => {
    const [guild, old] = guilds();
    expect(guild).toMatchObject({ key: "Test Guild@PvE", name: "Test Guild", realm: "PvE" });
    expect(guild.members.map((m) => m.name)).toEqual(["Bram Anvil", "Nobody Here", "Tessa Thimble", "Zoë Quill"]);
    expect(old).toMatchObject({ name: "Old Guild", members: [{ name: "Tessa Thimble", professions: [] }] });
  });

  it("reads a member's professions with skill and recipes", () => {
    const tessa = guilds()[0].members.find((m) => m.name === "Tessa Thimble");
    expect(tessa?.professions).toEqual([
      { skillLineId: 185, skill: 165, spellIds: [2538, 8604], readAt: 1795360488 },
      { skillLineId: 197, skill: 170, spellIds: [2385, 2386, 3915, 1257013], readAt: 1795377583 },
      { skillLineId: 356, skill: 1, spellIds: null, readAt: 1795312860 },
    ]);
  });

  it("keeps a skill whose recipe book was never read, and drops a guess from a guild note", () => {
    const bram = guilds()[0].members.find((m) => m.name === "Bram Anvil");
    expect(bram?.professions).toEqual([
      { skillLineId: 164, skill: 215, spellIds: [3333, 1252277], readAt: 1795305257 },
      { skillLineId: 186, skill: 165, spellIds: null, readAt: 1795391880 },
    ]);
  });

  it("keeps members without professions, so they can be counted", () => {
    expect(guilds()[0].members.find((m) => m.name === "Nobody Here")?.professions).toEqual([]);
  });

  it("reads the file as the game writes it on Windows", () => {
    expect(guilds(FILE.replace(/\n/g, "\r\n"))).toEqual(guilds());
  });

  it("joins up the characters the addon knows to be one player's", () => {
    // Each character's own entry lists the others; one of them was added later and is on one list only.
    expect(guilds()[0].players).toEqual([["Tessa Thimble", "Wren Hollow", "Zoë Quill"]]);
    expect(guilds()[1].players).toEqual([]);
  });

  it("says what is wrong with other files", () => {
    expect(readGuildyFile("just some text")).toEqual({ ok: false, problem: "not_saved_data" });
    expect(readGuildyFile('GuildonCraftsDB = { ["sets"] = {} }')).toEqual({ ok: false, problem: "not_guildy" });
    expect(readGuildyFile('GuildyDB = { ["version"] = 1 }')).toEqual({ ok: false, problem: "no_guild" });
    expect(readGuildyFile("")).toEqual({ ok: false, problem: "not_guildy" });
  });
});

describe("matchGuildyMember", () => {
  const member = (name: string) => guilds()[0].members.find((m) => m.name === name)!;

  it("lines a member up against the site's professions and recipes", () => {
    expect(matchGuildyMember(member("Tessa Thimble"), PROFESSIONS, RECIPES)).toEqual({
      name: "Tessa Thimble",
      professions: [
        { professionId: 185, name: "Cooking", skill: 165, recipes: 2, readAt: 1795360488 },
        { professionId: 197, name: "Tailoring", skill: 170, recipes: 3, readAt: 1795377583 },
      ],
      recipeIds: [2385, 2386, 2538, 3915, 8604],
      unknownSpellIds: [1257013],
      readAt: 1795377583,
    });
  });

  it("marks a profession whose recipe book was not read", () => {
    const match = matchGuildyMember(member("Bram Anvil"), PROFESSIONS, RECIPES);
    expect(match.professions).toEqual([
      { professionId: 164, name: "Blacksmithing", skill: 215, recipes: 2, readAt: 1795305257 },
      { professionId: 186, name: "Mining", skill: 165, recipes: null, readAt: 1795391880 },
    ]);
  });

  it("leaves out professions the site does not list", () => {
    expect(matchGuildyMember(member("Zoë Quill"), PROFESSIONS, RECIPES)).toMatchObject({ professions: [], recipeIds: [] });
  });

  it("takes a profession filed under this game version's own skill line", () => {
    const filed = { name: "Someone", professions: [{ skillLineId: 2938, skill: 90, spellIds: [3333], readAt: 5 }] };
    expect(matchGuildyMember(filed, PROFESSIONS, RECIPES).professions).toEqual([
      { professionId: 164, name: "Blacksmithing", skill: 90, recipes: 1, readAt: 5 },
    ]);
  });

  it("turns into what the import is sent", () => {
    const match = matchGuildyMember(member("Bram Anvil"), PROFESSIONS, RECIPES);
    expect(toImportMember(match, null)).toEqual({
      name: "Bram Anvil",
      crafterId: null,
      professions: [
        { id: 164, skill: 215 },
        { id: 186, skill: 165 },
      ],
      recipeIds: [3333, 1252277],
    });
  });
});

describe("suggestCrafters", () => {
  const crafters = [
    { id: "a", characterName: "Bram Anvil" },
    { id: "b", characterName: "Tessa Thimbel" },
    { id: "c", characterName: "Rook" },
    { id: "d", characterName: "Zoe Quill" },
  ];

  it("pairs a member with the crafter of the same name", () => {
    const pairs = suggestCrafters(["bram  anvil", "Zoë Quill"], crafters);
    expect(pairs.get("bram  anvil")).toEqual({ crafterId: "a", how: "exact" });
    expect(pairs.get("Zoë Quill")).toEqual({ crafterId: "d", how: "exact" });
  });

  it("offers a crafter whose surname is misspelt or left out, as worth a look", () => {
    const pairs = suggestCrafters(["Tessa Thimble", "Rook Castle"], crafters);
    expect(pairs.get("Tessa Thimble")).toEqual({ crafterId: "b", how: "close" });
    expect(pairs.get("Rook Castle")).toEqual({ crafterId: "c", how: "close" });
  });

  it("makes a new crafter for a name the site does not have", () => {
    expect(suggestCrafters(["Nobody Here"], crafters).get("Nobody Here")).toEqual({ crafterId: null, how: "new" });
  });

  it("does not pair on a shared first name alone", () => {
    const site = [{ id: "m", characterName: "Max Hammer" }];
    const pairs = suggestCrafters(["Max Chill", "Max Gaming", "Max Hammer"], site);
    expect(pairs.get("Max Hammer")).toEqual({ crafterId: "m", how: "exact" });
    expect(pairs.get("Max Chill")).toEqual({ crafterId: null, how: "new" });
    expect(pairs.get("Max Gaming")).toEqual({ crafterId: null, how: "new" });
  });

  it("leaves a first name several members share to be settled by hand", () => {
    const pairs = suggestCrafters(["Max Chill", "Max Gaming"], [{ id: "m", characterName: "Max" }]);
    expect([...pairs.values()].map((p) => p.how)).toEqual(["new", "new"]);
  });

  it("offers each crafter to one member only", () => {
    const pairs = suggestCrafters(["Ada Flint", "Ada Flint"], [{ id: "r", characterName: "Ada Flint" }]);
    expect(pairs.get("Ada Flint")).toEqual({ crafterId: "r", how: "exact" });
    expect(pairs.size).toBe(1);
  });
});

describe("samePlayer", () => {
  const players = [["Tessa Thimble", "Wren Hollow", "Zoë Quill"]];

  it("names a member's other characters", () => {
    expect(samePlayer("zoe  quill", players)).toEqual(["Tessa Thimble", "Wren Hollow"]);
  });

  it("names nobody for a member the file knows as one character", () => {
    expect(samePlayer("Bram Anvil", players)).toEqual([]);
  });
});

describe("playersToRecord", () => {
  const players = [
    ["Tessa Thimble", "Wren Hollow", "Zoë Quill"],
    ["Ada Flint", "Max Hammer"],
  ];
  const member = (name: string, crafterId: string | null = null): GuildImportMember => ({ name, crafterId, professions: [], recipeIds: [] });

  it("points at the members being imported by their place in the list", () => {
    const sent = [member("Bram Anvil"), member("Zoë Quill"), member("Tessa Thimble", "t")];
    expect(playersToRecord(players, sent, [])).toEqual([{ members: [2, 1], crafterIds: [] }]);
  });

  it("brings in a character the site already has under exactly that name", () => {
    const crafters = [
      { id: "w", characterName: "wren hollow" },
      { id: "x", characterName: "Wren" },
    ];
    expect(playersToRecord(players, [member("Tessa Thimble")], crafters)).toEqual([{ members: [0], crafterIds: ["w"] }]);
  });

  it("leaves out a player with fewer than two characters on the site", () => {
    expect(playersToRecord(players, [member("Tessa Thimble"), member("Ada Flint")], [])).toEqual([]);
  });

  it("does not count a crafter twice when a member is being imported into it", () => {
    const crafters = [{ id: "z", characterName: "Zoë Quill" }];
    // The admin aimed Tessa at the crafter called Zoë Quill: it is Tessa's now, not a second character.
    expect(playersToRecord(players, [member("Tessa Thimble", "z")], crafters)).toEqual([]);
  });

  it("does not guess between two crafters of one name", () => {
    const crafters = [
      { id: "w1", characterName: "Wren Hollow" },
      { id: "w2", characterName: "Wren Hollow" },
    ];
    expect(playersToRecord(players, [member("Tessa Thimble")], crafters)).toEqual([]);
  });
});
