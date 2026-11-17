import { getIcon, parseIconId } from "@/lib/icons/serve";
import { iconSources } from "@/lib/icons/sources";

/** The game's own "unknown item" question mark, shown when an icon cannot be found. */
const QUESTION_MARK_FILE_ID = 134400;

function image(body: Uint8Array, cacheControl: string) {
  return new Response(Buffer.from(body), {
    headers: { "Content-Type": "image/webp", "Cache-Control": cacheControl },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fileId = parseIconId((await params).id);
  if (fileId === null) return new Response("Not an icon id", { status: 400 });

  const sources = iconSources();
  const icon = await getIcon(fileId, sources);
  // An icon never changes for a given file id, so browsers and the CDN may keep it for good.
  if (icon) return image(icon, "public, max-age=31536000, s-maxage=31536000, immutable");

  const fallback = await getIcon(QUESTION_MARK_FILE_ID, sources);
  if (fallback) return image(fallback, "public, max-age=300, s-maxage=300");
  return new Response("Icon not found", { status: 404 });
}
