import { loadCraftables } from "@/lib/craftables/load";

/**
 * A small health check: is the site connected to its database, which game
 * build is it showing, and how much is listed. Everything here is already
 * public on the front page.
 */
export async function GET() {
  try {
    const doc = await loadCraftables();
    return Response.json({
      ok: true,
      build: doc.build,
      syncedAt: doc.syncedAt,
      recipes: doc.recipes.length,
      crafters: doc.crafters.length,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
