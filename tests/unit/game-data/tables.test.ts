import { describe, expect, it } from "vitest";
import { indexBy, parseCsv } from "@/lib/game-data/tables";

describe("parseCsv", () => {
  it("returns one object per row keyed by the header", () => {
    expect(parseCsv("ID,Name_lang\n3333,Silvered Bronze Gauntlets\n")).toEqual([
      { ID: "3333", Name_lang: "Silvered Bronze Gauntlets" },
    ]);
  });

  it("keeps commas and line breaks that sit inside quoted fields", () => {
    const rows = parseCsv('ID,Description_lang\n1,"Line one,\nline ""two"""\n');
    expect(rows).toEqual([{ ID: "1", Description_lang: 'Line one,\nline "two"' }]);
  });
});

describe("indexBy", () => {
  it("maps rows by a numeric column", () => {
    const rows = parseCsv("ID,ItemLevel\n9,27\n4,31\n");
    const byLevel = indexBy(rows, "ItemLevel");
    expect(byLevel.get(27)).toEqual({ ID: "9", ItemLevel: "27" });
    expect(byLevel.get(99)).toBeUndefined();
  });
});
