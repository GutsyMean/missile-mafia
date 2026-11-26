import { revalidateTag } from "next/cache";
import { CRAFTABLES_TAG } from "@/lib/craftables/load";
import { runSiteSync } from "@/lib/game-data/run";
import { settle } from "@/lib/publish";

/** A full sync downloads about thirty game tables; give it room. */
export const maxDuration = 300;

/**
 * The daily game-data sync. Vercel's scheduler calls this with the project's
 * CRON_SECRET; nobody else can start it from here.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    const result = await runSiteSync("cron");
    if (result.status === "ok") {
      revalidateTag(CRAFTABLES_TAG, "max");
      settle(CRAFTABLES_TAG);
    }
    return Response.json(result, { status: result.status === "ok" ? 200 : 500 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
