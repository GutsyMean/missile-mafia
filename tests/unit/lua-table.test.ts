import { describe, expect, it } from "vitest";
import { LuaReadError, isLuaTable, listOf, readLuaAssignments, tableAt, type LuaTable, type LuaValue } from "@/lib/lua-table";

/** Tables as plain objects, so a whole reading can be compared at once. */
function plain(value: LuaValue | undefined): unknown {
  if (!isLuaTable(value)) return value;
  return Object.fromEntries([...value].map(([key, entry]) => [String(key), plain(entry)]));
}

const read = (text: string) => plain(readLuaAssignments(`X = ${text}`).get("X"));

describe("readLuaAssignments", () => {
  it("reads the notation the game writes saved data in", () => {
    const text = `
AddonDB = {
["name"] = "Bram Anvil",
["skills"] = {
[164] = {
["rank"] = 215,
["recipes"] = {
3333,
1252277,
},
},
},
["listed"] = true,
["hidden"] = false,
["gone"] = nil,
}
`;
    expect(plain(readLuaAssignments(text).get("AddonDB"))).toEqual({
      name: "Bram Anvil",
      skills: { "164": { rank: 215, recipes: { "1": 3333, "2": 1252277 } } },
      listed: true,
      hidden: false,
      gone: null,
    });
  });

  it("reads several variables from one file", () => {
    const found = readLuaAssignments('FirstDB = { 1 }\nSecond = "text"\nThird = 3\n');
    expect([...found.keys()]).toEqual(["FirstDB", "Second", "Third"]);
    expect(found.get("Second")).toBe("text");
  });

  it("takes Windows line endings and a byte-order mark", () => {
    expect(plain(readLuaAssignments('﻿DB = {\r\n["a"] = 1,\r\n}\r\n').get("DB"))).toEqual({ a: 1 });
  });

  it("skips the place numbers the game writes after listed entries", () => {
    expect(read('{\n"one", -- [1]\n"two", -- [2]\n}')).toEqual({ "1": "one", "2": "two" });
    expect(read("{ 1, --[[ a note ]] 2 }")).toEqual({ "1": 1, "2": 2 });
  });

  it("reads numbers of every kind", () => {
    expect(read("{ 12, -3, 1.5, -0.25, 1e3, 2.5E-1, 0x1F, .5 }")).toEqual({
      "1": 12, "2": -3, "3": 1.5, "4": -0.25, "5": 1000, "6": 0.25, "7": 31, "8": 0.5,
    });
  });

  it("reads text with quotes, line breaks and character codes inside", () => {
    expect(read('"say \\"hi\\""')).toBe('say "hi"');
    expect(read('"back\\\\slash"')).toBe("back\\slash");
    expect(read('"two\\nlines"')).toBe("two\nlines");
    expect(read('"two\\\nlines"')).toBe("two\nlines");
    expect(read('"tab\\there"')).toBe("tab\there");
    expect(read('"\\65\\066c"')).toBe("ABc");
    expect(read("'single'")).toBe("single");
    expect(read('"Zoë Quill"')).toBe("Zoë Quill");
    expect(read("[[long\ntext]]")).toBe("long\ntext");
    expect(read("[==[with ]] inside]==]")).toBe("with ]] inside");
  });

  it("reads names without brackets, and either separator", () => {
    expect(read("{ rank = 5; max = 75, }")).toEqual({ rank: 5, max: 75 });
  });

  it("counts listed entries apart from named ones", () => {
    const table = readLuaAssignments('X = { "a", ["k"] = 1, "b", [10] = "far" }').get("X") as LuaTable;
    expect(listOf(table)).toEqual(["a", "b"]);
    expect(table.get(10)).toBe("far");
    expect(tableAt(table, "k")).toBeNull();
  });

  it("treats what is not data as nothing", () => {
    expect(read("{ inf, -inf, nan, something }")).toEqual({ "1": null, "2": null, "3": null, "4": null });
  });

  it("does not let a key reach the object every table is built on", () => {
    const table = readLuaAssignments('X = { ["__proto__"] = { ["polluted"] = true }, ["constructor"] = 1 }').get("X") as LuaTable;
    expect(table.get("constructor")).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses text that is not saved data", () => {
    for (const text of ["hello there", "X = {", 'X = { ["a"] 1 }', 'X = "open', "X = { 1 2 }", "print('hi')", "X = "]) {
      expect(() => readLuaAssignments(text), text).toThrow(LuaReadError);
    }
  });

  it("refuses tables nested without end rather than following them", () => {
    expect(() => readLuaAssignments(`X = ${"{".repeat(5000)}`)).toThrow(LuaReadError);
  });

  it("reads an empty file as no variables", () => {
    expect(readLuaAssignments("  \n-- nothing here\n").size).toBe(0);
  });
});
