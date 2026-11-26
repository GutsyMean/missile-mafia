import { revalidateTag } from "next/cache";
import { after, type NextRequest } from "next/server";

/** Temporary: expires the timing page now and/or a while after answering. */
export async function GET(request: NextRequest) {
  const now = request.nextUrl.searchParams.get("now") === "1";
  const then = Number(request.nextUrl.searchParams.get("then") ?? 0);
  if (now) revalidateTag("zz-timing", { expire: 0 });
  if (then > 0) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, then));
      revalidateTag("zz-timing", { expire: 0 });
      console.log(`zz-timing expired again at ${new Date().toISOString()}`);
    });
  }
  const at = Date.now();
  return Response.json({ at: new Date(at).toISOString(), expiredNow: now, expiresAgainAt: then > 0 ? new Date(at + then).toISOString() : null });
}
