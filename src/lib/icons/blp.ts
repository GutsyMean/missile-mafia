import { Blp, BLP_IMAGE_FORMAT } from "@wowserhq/format";
import sharp from "sharp";

export interface DecodedTexture {
  width: number;
  height: number;
  /** Pixels as R, G, B, A bytes, top row first. */
  rgba: Uint8Array;
}

/** Decodes a game texture file (BLP) to raw pixels. */
export function decodeBlp(data: Uint8Array): DecodedTexture {
  if (Buffer.from(data.subarray(0, 4)).toString("latin1") !== "BLP2") {
    throw new Error("Not a game texture file (expected a BLP2 header)");
  }
  // The decoder reads from an ArrayBuffer of exactly the file's bytes.
  const bytes = new Uint8Array(data);
  const blp = new Blp().load(bytes.buffer);
  // "ABGR8888" names the 32-bit value; in memory the bytes run R, G, B, A.
  const image = blp.getImage(0, BLP_IMAGE_FORMAT.IMAGE_ABGR8888);
  return { width: image.width, height: image.height, rgba: image.data };
}

function toSharp(texture: DecodedTexture) {
  return sharp(Buffer.from(texture.rgba), {
    raw: { width: texture.width, height: texture.height, channels: 4 },
  });
}

/** Converts a game texture to a square WebP of the given size. */
export async function blpToWebp(data: Uint8Array, size: number): Promise<Buffer> {
  return toSharp(decodeBlp(data)).resize(size, size, { kernel: "lanczos3" }).webp({ quality: 90 }).toBuffer();
}

/** Converts a game texture, or a rectangle of it, to PNG (lossless, keeps transparency). */
export async function blpToPng(
  data: Uint8Array,
  region?: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  const image = toSharp(decodeBlp(data));
  return (region ? image.extract(region) : image).png().toBuffer();
}
