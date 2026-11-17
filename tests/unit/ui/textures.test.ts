import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/**
 * Controls are drawn from three pieces of game art joined side by side: a left
 * end, a stretchable middle and a right end. The pieces must come from the
 * same art set, or the middle shows as a mismatched box between the ends.
 */

interface Image {
  data: Buffer;
  width: number;
  height: number;
}

async function load(name: string): Promise<Image> {
  const { data, info } = await sharp(path.join(process.cwd(), "public/ui", `${name}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** One pixel with colour scaled by its opacity, so invisible pixels compare equal. */
function pixel(image: Image, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  const alpha = image.data[at + 3];
  return [0, 1, 2].map((c) => (image.data[at + c] * alpha) / 255).concat(alpha);
}

/** Average difference per channel between the columns either side of a join. */
function joinDifference(image: Image, x: number): number {
  let total = 0;
  for (let y = 0; y < image.height; y++) {
    const left = pixel(image, x - 1, y);
    const right = pixel(image, x, y);
    for (let c = 0; c < 4; c++) total += Math.abs(left[c] - right[c]);
  }
  return total / (image.height * 4);
}

describe("three-piece control art", () => {
  // name, width of each end piece in the image
  const cases: [string, number][] = [
    ["search", 16],
    ["button", 64],
    ["button-pressed", 64],
    ["button-disabled", 64],
  ];

  it.each(cases)("%s: the middle continues the ends without a visible join", async (name, end) => {
    const image = await load(name);
    expect(joinDifference(image, end)).toBeLessThan(6);
    expect(joinDifference(image, image.width - end)).toBeLessThan(6);
  });
});
