/**
 * Reads the text World of Warcraft writes for an addon's saved data:
 *
 *   SomeAddonDB = { ["key"] = "text", [12] = { 1, 2, 3 }, flag = true }
 *
 * It is the notation of the Lua language, but only its data: tables, text,
 * numbers, true, false and nil. The text is read, never run.
 */

export type LuaValue = string | number | boolean | null | LuaTable;

/** A table: named entries by their key, listed entries by their place, counting from 1. */
export type LuaTable = Map<string | number, LuaValue>;

export class LuaReadError extends Error {
  constructor(
    message: string,
    /** Where in the text the reader gave up. */
    readonly position: number,
  ) {
    super(message);
    this.name = "LuaReadError";
  }
}

/** Tables inside tables deeper than this are refused rather than followed. */
const MAX_DEPTH = 60;

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", a: "\x07", b: "\b", f: "\f", v: "\v" };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isWordStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isWord = (c: string) => isWordStart(c) || isDigit(c);

class Reader {
  private at = 0;

  constructor(private readonly text: string) {
    if (text.charCodeAt(0) === 0xfeff) this.at = 1; // a byte-order mark
  }

  private fail(message: string): never {
    throw new LuaReadError(message, this.at);
  }

  /** The number of "=" in a long bracket opening at `from` ("[[" is 0, "[==[" is 2), or -1 when it is not one. */
  private longBracket(from: number): number {
    if (this.text[from] !== "[") return -1;
    let level = 0;
    while (this.text[from + 1 + level] === "=") level++;
    return this.text[from + 1 + level] === "[" ? level : -1;
  }

  /** Reads "[[ ... ]]" starting at its opening bracket, and returns what is inside. */
  private longText(level: number): string {
    const close = `]${"=".repeat(level)}]`;
    let start = this.at + level + 2;
    const end = this.text.indexOf(close, start);
    if (end < 0) this.fail("A long text is never closed.");
    // A line break straight after the opening bracket is not part of the text.
    if (this.text[start] === "\r" && this.text[start + 1] === "\n") start += 2;
    else if (this.text[start] === "\n" || this.text[start] === "\r") start += 1;
    this.at = end + close.length;
    return this.text.slice(start, end);
  }

  private skipBlank(): void {
    const { text } = this;
    for (;;) {
      const c = text[this.at];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        this.at++;
      } else if (c === "-" && text[this.at + 1] === "-") {
        const level = this.longBracket(this.at + 2);
        if (level >= 0) {
          this.at += 2;
          this.longText(level);
        } else {
          const end = text.indexOf("\n", this.at);
          this.at = end < 0 ? text.length : end + 1;
        }
      } else {
        return;
      }
    }
  }

  private quoted(): string {
    const { text } = this;
    const quote = text[this.at++];
    let out = "";
    let from = this.at;
    for (;;) {
      const c = text[this.at];
      if (c === undefined || c === "\n") this.fail("A text is never closed.");
      if (c === quote) {
        out += text.slice(from, this.at);
        this.at++;
        return out;
      }
      if (c !== "\\") {
        this.at++;
        continue;
      }
      out += text.slice(from, this.at);
      const next = text[this.at + 1];
      this.at += 2;
      if (next === undefined) this.fail("A text is never closed.");
      if (isDigit(next)) {
        // Up to three digits: the number of one character.
        let digits = next;
        while (digits.length < 3 && isDigit(text[this.at] ?? "")) digits += text[this.at++];
        out += String.fromCharCode(Number(digits) & 0xff);
      } else if (next === "x") {
        const hex = text.slice(this.at, this.at + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("A text holds a broken character code.");
        out += String.fromCharCode(Number.parseInt(hex, 16));
        this.at += 2;
      } else if (next === "z") {
        while (/\s/.test(text[this.at] ?? "")) this.at++;
      } else if (next === "\r") {
        if (text[this.at] === "\n") this.at++;
        out += "\n";
      } else {
        out += ESCAPES[next] ?? next; // \n, \t and so on; a quote, a backslash or a line break stand for themselves
      }
      from = this.at;
    }
  }

  private number(): number {
    const match = /^-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(this.text.slice(this.at, this.at + 80));
    if (!match) this.fail("A number is expected here.");
    this.at += match[0].length;
    return Number(match[0]);
  }

  private word(): string {
    const from = this.at;
    while (isWord(this.text[this.at] ?? "")) this.at++;
    return this.text.slice(from, this.at);
  }

  private table(depth: number): LuaTable {
    if (depth > MAX_DEPTH) this.fail("The tables are nested too deeply.");
    const table: LuaTable = new Map();
    let place = 1;
    this.at++; // {
    for (;;) {
      this.skipBlank();
      const c = this.text[this.at];
      if (c === undefined) this.fail("A table is never closed.");
      if (c === "}") {
        this.at++;
        return table;
      }
      if (c === "[" && this.longBracket(this.at) < 0) {
        this.at++;
        const key = this.value(depth + 1);
        this.skipBlank();
        if (this.text[this.at++] !== "]") this.fail("A key is never closed.");
        this.skipBlank();
        if (this.text[this.at++] !== "=") this.fail("A key has no value.");
        const value = this.value(depth + 1);
        if (typeof key === "string" || typeof key === "number") table.set(key, value);
      } else {
        const start = this.at;
        let named = false;
        if (isWordStart(c)) {
          const name = this.word();
          this.skipBlank();
          if (this.text[this.at] === "=" && this.text[this.at + 1] !== "=") {
            this.at++;
            table.set(name, this.value(depth + 1));
            named = true;
          } else {
            this.at = start;
          }
        }
        if (!named) table.set(place++, this.value(depth + 1));
      }
      this.skipBlank();
      const after = this.text[this.at];
      if (after === "," || after === ";") this.at++;
      else if (after !== "}") this.fail("A table entry is not followed by a comma.");
    }
  }

  value(depth = 0): LuaValue {
    this.skipBlank();
    const c = this.text[this.at];
    if (c === undefined) this.fail("The text ends where a value is expected.");
    if (c === "{") return this.table(depth);
    if (c === '"' || c === "'") return this.quoted();
    const level = this.longBracket(this.at);
    if (level >= 0) return this.longText(level);
    if (isDigit(c) || c === "." || (c === "-" && (isDigit(this.text[this.at + 1] ?? "") || this.text[this.at + 1] === "."))) {
      return this.number();
    }
    if (c === "-" && isWordStart(this.text[this.at + 1] ?? "")) this.at++; // "-inf" and the like
    if (isWordStart(c) || isWordStart(this.text[this.at] ?? "")) {
      const word = this.word();
      if (word === "true") return true;
      if (word === "false") return false;
      return null; // nil, and anything else that is not data (the game writes "inf" and "nan" bare)
    }
    return this.fail("This is not saved addon data.");
  }

  /** Every `Name = value` in the text. */
  assignments(): Map<string, LuaValue> {
    const found = new Map<string, LuaValue>();
    for (;;) {
      this.skipBlank();
      if (this.at >= this.text.length) return found;
      if (!isWordStart(this.text[this.at])) this.fail("This is not saved addon data.");
      const name = this.word();
      this.skipBlank();
      if (this.text[this.at++] !== "=") this.fail("This is not saved addon data.");
      found.set(name, this.value());
      this.skipBlank();
      if (this.text[this.at] === ";") this.at++;
    }
  }
}

/** Every variable a saved-data file sets, by name. Throws a LuaReadError when the text is something else. */
export function readLuaAssignments(text: string): Map<string, LuaValue> {
  return new Reader(text).assignments();
}

export const isLuaTable = (value: LuaValue | undefined): value is LuaTable => value instanceof Map;

/** The table under a key, or null when there is none. */
export function tableAt(table: LuaTable, key: string | number): LuaTable | null {
  const value = table.get(key);
  return isLuaTable(value) ? value : null;
}

/** The listed entries of a table, in order: those at 1, 2, 3 and so on. */
export function listOf(table: LuaTable): LuaValue[] {
  const list: LuaValue[] = [];
  for (let place = 1; table.has(place); place++) list.push(table.get(place) ?? null);
  return list;
}
