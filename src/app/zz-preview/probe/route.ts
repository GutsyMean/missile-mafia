import type { NextRequest } from "next/server";

/**
 * Temporary: asks this deployment for the timing page the way a browser
 * prefetches a link, in two parts at once, while the page is being rebuilt.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";
  const started = Date.now();

  const ask = async (label: string, delay: number, headers: Record<string, string>) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const sent = Date.now();
    try {
      const response = await fetch(`${origin}/zz-preview/h1`, { headers: { cookie, ...headers }, cache: "no-store" });
      const body = await response.text();
      const snapshot = body.match(/1[0-9]{12}/)?.[0];
      return {
        label,
        sentAfterMs: sent - started,
        tookMs: Date.now() - sent,
        status: response.status,
        redirectedTo: response.redirected ? response.url.replace(origin, "") : null,
        vercelCache: response.headers.get("x-vercel-cache"),
        snapshot: snapshot ? new Date(Number(snapshot)).toISOString() : null,
        bytes: body.length,
      };
    } catch (error) {
      return { label, sentAfterMs: sent - started, error: String(error) };
    }
  };

  const prefetch = (segment: string) => ({ rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": segment });
  const answers = await Promise.all([
    ask("tree part, first", 0, prefetch("/_tree")),
    ask("page part, while the first is rebuilding", 1500, prefetch("/zz-preview/h1/__PAGE__")),
    ask("whole page, while still rebuilding", 3000, {}),
    ask("page part, after the rebuild", 12000, prefetch("/zz-preview/h1/__PAGE__")),
  ]);
  return Response.json({ startedAt: new Date(started).toISOString(), answers });
}
