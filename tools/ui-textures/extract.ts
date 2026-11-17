/**
 * Extracts the window art the site uses from the game's own files and writes
 * it to public/ui/. Run once, or again after a game update changes the art:
 *
 *   pnpm ui-textures
 *
 * WoW Forever's interface uses the "c60" atlas set (bronze frames). Texture
 * names and slices come from Blizzard's interface source (trainer frame,
 * nine-slice layouts, tooltip).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { decodeBlp, type DecodedTexture } from "../../src/lib/icons/blp";
import { parseCsv, type Row } from "../../src/lib/game-data/tables";
import { resolveLatestBuild, tableUrl, USER_AGENT } from "../../src/lib/game-data/wago";

const ROOT = path.resolve(__dirname, "../..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "public/ui");
const HEADERS = { "User-Agent": USER_AGENT };

interface Rect { left: number; top: number; width: number; height: number }
interface Piece { texture: DecodedTexture; rect: Rect }

let version = "";
let atlasById = new Map<string, Row>();
let members: Row[] = [];
const textures = new Map<string, DecodedTexture>();

async function cached(file: string, url: string): Promise<Buffer> {
  const target = path.join(CACHE, file);
  if (!existsSync(target)) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(target);
}

async function texture(fileId: string): Promise<DecodedTexture> {
  let decoded = textures.get(fileId);
  if (!decoded) {
    decoded = decodeBlp(await cached(`blp/${fileId}.blp`, `https://wago.tools/api/casc/${fileId}?version=${version}`));
    textures.set(fileId, decoded);
  }
  return decoded;
}

/** A named region of a texture atlas. */
async function atlas(name: string): Promise<Piece> {
  const member = members.find((row) => row.CommittedName.toLowerCase() === name.toLowerCase());
  if (!member) throw new Error(`Atlas "${name}" not found`);
  const left = Number(member.CommittedLeft);
  const top = Number(member.CommittedTop);
  return {
    texture: await texture(atlasById.get(member.UiTextureAtlasID)!.FileDataID),
    rect: { left, top, width: Number(member.CommittedRight) - left, height: Number(member.CommittedBottom) - top },
  };
}

/** A texture file by game path, optionally cropped by texture coordinates (left, right, top, bottom). */
async function file(gamePath: string, coords?: [number, number, number, number]): Promise<Piece> {
  const query = gamePath.replace(/\\/g, "/").toLowerCase();
  const found = JSON.parse(
    (await cached(`files/${encodeURIComponent(query)}.json`, `https://wago.tools/api/files?product=wowf&format=json&search=${encodeURIComponent(query)}`)).toString("utf8"),
  ) as Record<string, string>;
  const id = Object.entries(found).find(([, p]) => p === `${query}.blp`)?.[0];
  if (!id) throw new Error(`Texture file "${gamePath}" not found`);
  const tex = await texture(id);
  if (!coords) return { texture: tex, rect: { left: 0, top: 0, width: tex.width, height: tex.height } };
  const [l, r, t, b] = coords;
  const left = Math.round(l * tex.width);
  const top = Math.round(t * tex.height);
  return { texture: tex, rect: { left, top, width: Math.round(r * tex.width) - left, height: Math.round(b * tex.height) - top } };
}

function png(piece: Piece): Promise<Buffer> {
  const { texture: t, rect } = piece;
  return sharp(Buffer.from(t.rgba), { raw: { width: t.width, height: t.height, channels: 4 } })
    .extract(rect)
    .png()
    .toBuffer();
}

const manifest: Record<string, { width: number; height: number; note?: string }> = {};

async function write(name: string, buffer: Buffer, note?: string) {
  const meta = await sharp(buffer).metadata();
  writeFileSync(path.join(OUT, `${name}.png`), buffer);
  manifest[name] = { width: meta.width!, height: meta.height!, ...(note ? { note } : {}) };
}

async function single(name: string, piece: Promise<Piece>) {
  await write(name, await png(await piece));
}

/** Lays pieces out on a transparent canvas. */
async function compose(name: string, width: number, height: number, parts: { piece: Piece; left: number; top: number }[], note?: string) {
  const layers = await Promise.all(parts.map(async (p) => ({ input: await png(p.piece), left: p.left, top: p.top })));
  const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
  await write(name, buffer, note);
}

/** Corners and edges into one image for CSS border-image. */
async function nineSlice(name: string, n: { tl: string; tr: string; bl: string; br: string; t: string; b: string; l: string; r: string }) {
  const [tl, tr, bl, br, t, b, l, r] = await Promise.all([n.tl, n.tr, n.bl, n.br, n.t, n.b, n.l, n.r].map(atlas));
  const width = tl.rect.width + t.rect.width + tr.rect.width;
  const height = tl.rect.height + l.rect.height + bl.rect.height;
  await compose(name, width, height, [
    { piece: tl, left: 0, top: 0 },
    { piece: t, left: tl.rect.width, top: 0 },
    { piece: tr, left: tl.rect.width + t.rect.width, top: 0 },
    { piece: l, left: 0, top: tl.rect.height },
    { piece: r, left: width - r.rect.width, top: tr.rect.height },
    { piece: bl, left: 0, top: height - bl.rect.height },
    { piece: b, left: bl.rect.width, top: height - b.rect.height },
    { piece: br, left: width - br.rect.width, top: height - br.rect.height },
  ], `slice ${tl.rect.height} ${tr.rect.width} ${bl.rect.height} ${tl.rect.width}`);
}

/** Left, repeating centre and right into one image for CSS border-image. */
async function threeSlice(name: string, left: string, center: string, right: string) {
  const [l, c, r] = await Promise.all([left, center, right].map(atlas));
  await compose(name, l.rect.width + c.rect.width + r.rect.width, l.rect.height, [
    { piece: l, left: 0, top: 0 },
    { piece: c, left: l.rect.width, top: 0 },
    { piece: r, left: l.rect.width + c.rect.width, top: 0 },
  ], `slice 0 ${r.rect.width} 0 ${l.rect.width}`);
}

async function main() {
  version = process.argv[2] ?? (await resolveLatestBuild());
  mkdirSync(OUT, { recursive: true });
  const table = async (name: string) =>
    parseCsv((await cached(`wago/${version}/${name}.csv`, tableUrl(name, version))).toString("utf8"));
  atlasById = new Map((await table("UiTextureAtlas")).map((row) => [row.ID, row]));
  members = await table("UiTextureAtlasMember");

  // Window frame (ButtonFrameTemplate), with and without the portrait ring.
  const frame = {
    tr: "ui-frame-metal-cornertopright-c60-2x",
    bl: "ui-frame-metal-cornerbottomleft-c60-2x",
    br: "ui-frame-metal-cornerbottomright-c60-2x",
    t: "_ui-frame-metal-edgetop-c60-2x",
    b: "_ui-frame-metal-edgebottom-c60-2x",
    l: "!ui-frame-metal-edgeleft-c60-2x",
    r: "!ui-frame-metal-edgeright-c60-2x",
  };
  await nineSlice("frame", { tl: "ui-frame-metal-cornertopleft-c60-2x", ...frame });
  await nineSlice("frame-portrait", { tl: "ui-frame-portraitmetal-cornertopleft-c60-2x", ...frame });
  await single("frame-bg", file("Interface/FrameGeneral/UI-Background-Rock"));
  await single("inset-bg", file("Interface/FrameGeneral/UI-Background-Marble"));
  await nineSlice("inset", {
    tl: "UI-Frame-InnerTopLeft", tr: "UI-Frame-InnerTopRight", bl: "UI-Frame-InnerBotLeftCorner", br: "UI-Frame-InnerBotRight",
    t: "_UI-Frame-InnerTopTile", b: "_UI-Frame-InnerBotTile", l: "!UI-Frame-InnerLeftTile", r: "!UI-Frame-InnerRightTile",
  });
  for (const state of ["", "-pressed", "-disabled"]) {
    await single(`close${state}`, atlas(`redbutton-exit${state}-c60-2x`));
  }
  await single("close-highlight", atlas("redbutton-highlight-c60-2x"));

  // Trainer list (Interface\ClassTrainerFrame\TrainerTextures; coordinates from Blizzard_TrainerUI.xml).
  const trainer = "Interface/ClassTrainerFrame/TrainerTextures";
  await single("list-bg", file(trainer, [0.00195313, 0.5859375, 0.00195313, 0.65429688]));
  await single("row", file(trainer, [0.00195313, 0.57421875, 0.65820313, 0.75]));
  await single("row-highlight", file(trainer, [0.00195313, 0.57421875, 0.75390625, 0.84570313]));
  await single("row-selected", file(trainer, [0.00195313, 0.57421875, 0.84960938, 0.94140625]));
  await threeSlice("header", "professions-recipe-header-left", "professions-recipe-header-middle", "professions-recipe-header-right");
  await single("skill-bar", file("Interface/PaperDollInfoFrame/UI-Character-Skills-Bar"));
  await single("skill-bar-border", file("Interface/PaperDollInfoFrame/UI-Character-Skills-BarBorder"));

  // Tooltip (TooltipDefaultLayout).
  await nineSlice("tooltip", {
    tl: "tooltip-nineslice-cornertopleft-c60", tr: "tooltip-nineslice-cornertopright-c60",
    bl: "tooltip-nineslice-cornerbottomleft-c60", br: "tooltip-nineslice-cornerbottomright-c60",
    t: "_tooltip-nineslice-edgetop-c60", b: "_tooltip-nineslice-edgebottom-c60",
    l: "!tooltip-nineslice-edgeleft-c60", r: "!tooltip-nineslice-edgeright-c60",
  });
  await single("tooltip-bg", atlas("tooltip-nineslice-center-c60"));

  // Controls.
  for (const state of ["", "-pressed", "-disabled"]) {
    await threeSlice(`button${state}`, `128-redbutton-left${state}-c60`, `_128-redbutton-center${state}-c60`, `128-redbutton-right${state}-c60`);
  }
  await single("button-highlight", atlas("128-redbutton-highlight"));
  await threeSlice("search", "common-search-border-left-c60", "common-search-border-middle-c60", "common-search-border-right-c60");
  await single("search-icon", atlas("common-search-magnifyingglass"));
  await single("search-clear", atlas("common-search-clearbutton"));
  for (const [out, name] of [["dropdown", "common-dropdown-c-button-c60-2x"], ["dropdown-hover", "common-dropdown-c-button-hover-1-c60-2x"], ["dropdown-open", "common-dropdown-c-button-open-c60-2x"], ["dropdown-menu", "common-dropdown-c-bg-c60-2x"]]) {
    await single(out, atlas(name));
  }
  await single("checkbox", atlas("checkbox-minimal-c60"));
  await single("checkmark", atlas("checkmark-minimal"));
  for (const part of ["thumb-top", "thumb-middle", "thumb-bottom", "track-top", "track-bottom", "arrow-top", "arrow-bottom"]) {
    await single(`scroll-${part}`, atlas(`minimal-scrollbar-${part}-c60`));
  }
  await single("scroll-track-middle", atlas("!minimal-scrollbar-track-middle-c60"));

  // Item icon frames by quality, and coins.
  for (const [out, name] of [["slot-common", "white"], ["slot-uncommon", "green"], ["slot-rare", "blue"], ["slot-epic", "epic"], ["slot-legendary", "legendary"]]) {
    await single(out, atlas(`professions-slot-frame-${name}`));
  }
  for (const coin of ["gold", "silver", "copper"]) await single(`coin-${coin}`, atlas(`coin-${coin}-20x20`));

  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ build: version, textures: manifest }, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(manifest).length} textures to public/ui (build ${version})`);
  for (const [name, info] of Object.entries(manifest)) console.log(`  ${name.padEnd(22)} ${info.width}x${info.height} ${info.note ?? ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
