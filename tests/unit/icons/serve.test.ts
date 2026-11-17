import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getIcon, parseIconId, type IconSources } from "@/lib/icons/serve";

const gauntlets = readFileSync(path.resolve(__dirname, "../../fixtures/blp/132939.blp"));

function sources(over: Partial<IconSources> = {}) {
  const log: string[] = [];
  const stored = new Map<number, Uint8Array>();
  const base: IconSources = {
    async readStored(id) {
      log.push(`read ${id}`);
      return stored.get(id) ?? null;
    },
    async store(id, webp) {
      log.push(`store ${id}`);
      stored.set(id, webp);
    },
    async fetchGameFile(id) {
      log.push(`fetch ${id}`);
      return id === 132939 ? gauntlets : null;
    },
    ...over,
  };
  return { sources: base, log, stored };
}

describe("parseIconId", () => {
  it("accepts a file id with or without the .webp extension", () => {
    expect(parseIconId("132939.webp")).toBe(132939);
    expect(parseIconId("132939")).toBe(132939);
  });

  it("rejects anything that is not a positive file id", () => {
    for (const bad of ["0", "-5", "abc", "12.5", "../etc/passwd", "132939.png", ""]) {
      expect(parseIconId(bad)).toBeNull();
    }
  });
});

describe("getIcon", () => {
  it("converts a game icon the first time it is asked for, and keeps it", async () => {
    const { sources: s, log, stored } = sources();
    const icon = await getIcon(132939, s);
    expect((await sharp(Buffer.from(icon!)).metadata()).format).toBe("webp");
    expect(log).toEqual(["read 132939", "fetch 132939", "store 132939"]);
    expect(stored.has(132939)).toBe(true);
  });

  it("serves a kept icon without going back to the game files", async () => {
    const { sources: s, log } = sources();
    await getIcon(132939, s);
    log.length = 0;
    const again = await getIcon(132939, s);
    expect(again).not.toBeNull();
    expect(log).toEqual(["read 132939"]);
  });

  it("returns nothing for a file the game does not have", async () => {
    const { sources: s, stored } = sources();
    expect(await getIcon(555, s)).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("still serves the icon when it cannot be kept", async () => {
    const { sources: s } = sources({
      async store() {
        throw new Error("storage is down");
      },
    });
    expect(await getIcon(132939, s)).not.toBeNull();
  });

  it("returns nothing for a file that is not an image", async () => {
    const { sources: s } = sources({
      async fetchGameFile() {
        return Buffer.from("this is not a texture");
      },
    });
    expect(await getIcon(132939, s)).toBeNull();
  });
});
