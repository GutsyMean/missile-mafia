import { describe, expect, it } from "vitest";
import { guildonChecksum, matchGuildonExport, parseGuildonExport } from "@/lib/guildon";

/** Builds an export line the way the addon does, so tests do not hard-code checksums. */
function exportLine(head: string): string {
  return `${head};${guildonChecksum(head)}`;
}

const b36 = (n: number) => n.toString(36);
const DAMIEN = exportLine(
  `GNX1;F;Damien;Forever;A;PALADIN;24;1794800000;164:145:225:${[2675, 3333, 9987, 1252277].map(b36).join(",")}/186:120:150:`,
);

describe("guildonChecksum", () => {
  it("matches the addon's rolling hash", () => {
    // h = 2166136261; for each byte: h = (h * 31 + byte) mod 2^32; printed as 8 hex digits.
    expect(guildonChecksum("")).toBe("811c9dc5");
    expect(guildonChecksum("a")).toBe("a2771b3c"); // (2166136261 * 31 + 97) mod 2^32
  });
});

describe("parseGuildonExport", () => {
  it("reads a character with its professions and learned recipes", () => {
    const { characters, errors } = parseGuildonExport(DAMIEN);
    expect(errors).toEqual([]);
    expect(characters).toEqual([
      {
        game: "F",
        name: "Damien",
        realm: "Forever",
        faction: "A",
        className: "PALADIN",
        level: 24,
        exportedAt: 1794800000,
        professions: [
          { skillLineId: 164, skill: 145, maxSkill: 225, spellIds: [2675, 3333, 9987, 1252277] },
          { skillLineId: 186, skill: 120, maxSkill: 150, spellIds: [] },
        ],
      },
    ]);
  });

  it("reads several characters, one per line, ignoring blank lines and stray spaces", () => {
    const alt = exportLine("GNX1;F;Altname;Forever;A;MAGE;12;1794800000;197:40:75:" + b36(2387));
    const { characters, errors } = parseGuildonExport(`\n  ${DAMIEN}  \r\n\n${alt}\n`);
    expect(errors).toEqual([]);
    expect(characters.map((c) => c.name)).toEqual(["Damien", "Altname"]);
  });

  it("rejects a line that was cut off or edited", () => {
    const { characters, errors } = parseGuildonExport(DAMIEN.replace("Damien", "Damiem"));
    expect(characters).toEqual([]);
    expect(errors).toEqual([{ line: 1, reason: "checksum" }]);
  });

  it("rejects text that is not an export at all", () => {
    const { characters, errors } = parseGuildonExport("hello there");
    expect(characters).toEqual([]);
    expect(errors).toEqual([{ line: 1, reason: "format" }]);
  });

  it("rejects an export from the wrong game version", () => {
    const era = exportLine("GNX1;E;Oldie;Era;H;WARRIOR;60;1794800000;164:300:300:" + b36(3333));
    expect(parseGuildonExport(era).errors).toEqual([{ line: 1, reason: "wrong_game" }]);
  });

  it("rejects a newer export format it does not understand", () => {
    const future = exportLine("GNX2;F;Damien;Forever;A;PALADIN;24;1794800000;164:145:225:");
    expect(parseGuildonExport(future).errors).toEqual([{ line: 1, reason: "version" }]);
  });
});

describe("matchGuildonExport", () => {
  const professions = [
    { id: 164, name: "Blacksmithing", childSkillLineIds: [2938] },
    { id: 186, name: "Mining", childSkillLineIds: [2946] },
  ];
  const knownRecipes = new Map([
    [2675, 164],
    [3333, 164],
    [9987, 164],
  ]);
  const [character] = parseGuildonExport(DAMIEN).characters;

  it("keeps the recipes the site knows and reports the ones it does not", () => {
    const match = matchGuildonExport(character, professions, knownRecipes);
    expect(match.recipeIds).toEqual([2675, 3333, 9987]);
    expect(match.unknownSpellIds).toEqual([1252277]);
  });

  it("reports each profession's skill", () => {
    const match = matchGuildonExport(character, professions, knownRecipes);
    expect(match.skills).toEqual([
      { professionId: 164, name: "Blacksmithing", skill: 145, recipes: 3 },
      { professionId: 186, name: "Mining", skill: 120, recipes: 0 },
    ]);
  });

  it("maps a child skill line to its profession", () => {
    const viaChild = parseGuildonExport(
      exportLine("GNX1;F;Damien;Forever;A;PALADIN;24;1794800000;2938:145:225:" + b36(3333)),
    ).characters[0];
    const match = matchGuildonExport(viaChild, professions, knownRecipes);
    expect(match.skills).toEqual([{ professionId: 164, name: "Blacksmithing", skill: 145, recipes: 1 }]);
    expect(match.recipeIds).toEqual([3333]);
  });

  it("ignores skill lines that are not professions on the site", () => {
    const odd = parseGuildonExport(
      exportLine("GNX1;F;Damien;Forever;A;PALADIN;24;1794800000;9999:10:75:" + b36(3333)),
    ).characters[0];
    const match = matchGuildonExport(odd, professions, knownRecipes);
    expect(match.skills).toEqual([]);
    expect(match.recipeIds).toEqual([]);
  });
});
