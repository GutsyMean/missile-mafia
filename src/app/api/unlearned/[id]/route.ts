import { loadUnlearned } from "@/lib/craftables/load";

/**
 * The recipes of one profession that no listed crafter has learned yet. The
 * crafting window fetches this when a visitor looks at that profession, so the
 * front page itself stays small however many crafters join.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9][0-9]{0,5}$/.test(id)) return Response.json({ error: "Not a profession" }, { status: 400 });
  try {
    return Response.json(await loadUnlearned(Number(id)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
