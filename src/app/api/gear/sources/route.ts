import { loadGearFromSources } from "@/lib/craftables/load";

/**
 * Gear that is not crafted, with where each piece comes from. The crafting
 * window fetches this only when a visitor asks to compare craftable gear with
 * gear from every source.
 */
export async function GET() {
  try {
    return Response.json(await loadGearFromSources());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
