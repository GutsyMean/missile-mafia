import { blpToWebp } from "./blp";

/** Item icons are stored and served at the game's native 64 pixels. */
export const ICON_SIZE = 64;

export interface IconSources {
  /** An icon already converted and kept, if any. */
  readStored(fileId: number): Promise<Uint8Array | null>;
  store(fileId: number, webp: Uint8Array): Promise<void>;
  /** The raw game texture for a file id, or null when the game has no such file. */
  fetchGameFile(fileId: number): Promise<Uint8Array | null>;
}

/** Reads the file id out of a path segment such as "132939.webp". */
export function parseIconId(segment: string): number | null {
  const match = segment.match(/^([1-9]\d{0,9})(?:\.webp)?$/);
  return match ? Number(match[1]) : null;
}

/**
 * Returns an icon as WebP. The first request for an icon converts it from the
 * game's own file and keeps the result, so later requests never touch the
 * game files again.
 */
export async function getIcon(fileId: number, sources: IconSources): Promise<Uint8Array | null> {
  const stored = await sources.readStored(fileId);
  if (stored) return stored;

  const gameFile = await sources.fetchGameFile(fileId);
  if (!gameFile) return null;

  let webp: Uint8Array;
  try {
    webp = await blpToWebp(gameFile, ICON_SIZE);
  } catch {
    return null; // not a texture: a wrong id, or an error page from the file service
  }

  try {
    await sources.store(fileId, webp);
  } catch {
    // Keeping the icon is an optimisation; serving it matters more.
  }
  return webp;
}
