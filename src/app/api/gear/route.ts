import { loadGearElsewhere } from "@/lib/craftables/load";

/**
 * Gear made by professions no listed crafter has. The crafting window fetches
 * this when a visitor asks for the best gear for a class, so the front page
 * does not carry it for everyone.
 */
export async function GET() {
  try {
    return Response.json(await loadGearElsewhere());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
