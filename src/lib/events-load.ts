import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { DAYS_KEPT_IN_VIEW, EVENTS_TAG, splitEvents, type GuildEvent } from "./events";

const DAY = 86_400_000;

/** Stand-ins for the calendar where there is no database: two events ahead and one behind, whatever the date. */
function sampleEvents(now: number): GuildEvent[] {
  const at = (days: number, hour: number, minute = 0) => {
    const day = new Date(now + days * DAY);
    day.setUTCHours(hour, minute, 0, 0);
    return day.toISOString();
  };
  return [
    { id: "00000000-0000-4000-8000-000000000001", title: "Scarlet Monastery run", startsAt: at(-6, 19, 0), details: null },
    { id: "00000000-0000-4000-8000-000000000002", title: "Molten Core", startsAt: at(2, 19, 30), details: "Bring fire resistance and two flasks." },
    { id: "00000000-0000-4000-8000-000000000003", title: "Guild meeting", startsAt: at(9, 20, 0), details: null },
  ];
}

/**
 * The guild's calendar: what is coming up and what has lately been. Cached, and
 * refreshed through its tag when a site admin changes it.
 */
export async function loadEvents(): Promise<{ upcoming: GuildEvent[]; earlier: GuildEvent[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag(EVENTS_TAG);

  const now = Date.now();
  if (process.env.CRAFTABLES_FIXTURE === "1") return splitEvents(sampleEvents(now), now);

  const supabase = createPublicClient();
  if (!supabase) return { upcoming: [], earlier: [] };
  const { data, error } = await supabase
    .from("guild_events")
    .select("id, title, starts_at, details")
    .gte("starts_at", new Date(now - DAYS_KEPT_IN_VIEW * DAY).toISOString())
    .order("starts_at")
    .limit(500);
  if (error) throw new Error(`Could not load the calendar: ${error.message}`);
  return splitEvents(
    (data ?? []).map((row) => ({ id: row.id, title: row.title, startsAt: new Date(row.starts_at).toISOString(), details: row.details })),
    now,
  );
}
