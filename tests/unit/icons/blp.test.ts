import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { blpToWebp, decodeBlp } from "@/lib/icons/blp";

// The game's icon for Silvered Bronze Gauntlets, exactly as the game ships it.
const gauntlets = readFileSync(path.resolve(__dirname, "../../fixtures/blp/132939.blp"));

describe("decodeBlp", () => {
  it("decodes a game icon to RGBA pixels", () => {
    const image = decodeBlp(gauntlets);
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(image.rgba).toHaveLength(64 * 64 * 4);
  });

  it("produces a real picture, not a blank one", () => {
    const { rgba } = decodeBlp(gauntlets);
    const centre = (32 * 64 + 32) * 4;
    expect(rgba[centre + 3]).toBe(255); // opaque
    const colours = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) colours.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    expect(colours.size).toBeGreaterThan(100);
  });

  it("rejects data that is not a game texture", () => {
    expect(() => decodeBlp(Buffer.from("not a texture"))).toThrow(/texture/i);
  });
});

describe("blpToWebp", () => {
  it("converts an icon to WebP at the requested size", async () => {
    const webp = await blpToWebp(gauntlets, 56);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(56);
    expect(meta.height).toBe(56);
  });
});
