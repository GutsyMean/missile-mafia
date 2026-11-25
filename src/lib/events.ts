/** One entry in the guild's calendar. */
export interface GuildEvent {
  id: string;
  title: string;
  /** When it starts, as an instant: "2026-12-05T19:30:00.000Z". */
  startsAt: string;
  details: string | null;
}

/** Marks what is worked out from the calendar, so a change shows at once. */
export const EVENTS_TAG = "events";

/** An event still counts as coming up for this long after it has started: people are on their way. */
export const GRACE_HOURS = 3;

/** How far back the calendar looks. */
export const DAYS_KEPT_IN_VIEW = 45;

const HOUR = 3_600_000;

/** What is still to come, soonest first, and what has been, newest first. */
export function splitEvents(events: GuildEvent[], now: number): { upcoming: GuildEvent[]; earlier: GuildEvent[] } {
  const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const cut = now - GRACE_HOURS * HOUR;
  return {
    upcoming: sorted.filter((event) => Date.parse(event.startsAt) >= cut),
    earlier: sorted.filter((event) => Date.parse(event.startsAt) < cut).reverse(),
  };
}

export interface EventDay {
  /** "2026-12-05", the day as it falls in the time zone asked for. */
  key: string;
  /** "Saturday 5 December". */
  label: string;
  events: (GuildEvent & { time: string })[];
}

/** Events under the day each falls on in a time zone, each with its time of day there, in the order given. */
export function groupByDay(events: GuildEvent[], timeZone: string): EventDay[] {
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" });
  const timeOfDay = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  const days: EventDay[] = [];
  for (const event of events) {
    const at = new Date(event.startsAt);
    const key = dayKey.format(at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabel.format(at), events: [] };
      days.push(day);
    }
    day.events.push({ ...event, time: timeOfDay.format(at) });
  }
  return days;
}

/** A time zone as people name it, at a given moment: "CET", "GMT+1", "UTC". */
export function zoneName(timeZone: string, at: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" }).formatToParts(new Date(at));
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * The instant a date and a time of day name in the browser's own time zone,
 * as typed into the two fields of the form. Null when they do not make a date.
 */
export function toInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = new Date(`${date}T${time}:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The reverse: what the form's two fields show for an instant, in the browser's own time zone. */
export function toFields(instant: string): { date: string; time: string } {
  const at = new Date(instant);
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`,
    time: `${two(at.getHours())}:${two(at.getMinutes())}`,
  };
}
