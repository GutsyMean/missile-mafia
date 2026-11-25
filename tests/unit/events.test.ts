import { describe, expect, it } from "vitest";
import { groupByDay, splitEvents, toFields, toInstant, zoneName, type GuildEvent } from "@/lib/events";

const event = (id: string, startsAt: string, title = id): GuildEvent => ({ id, title, startsAt, details: null });

describe("splitEvents", () => {
  const now = Date.parse("2026-12-05T20:00:00Z");
  const events = [
    event("next week", "2026-12-12T19:30:00Z"),
    event("last week", "2026-11-28T19:30:00Z"),
    event("under way", "2026-12-05T18:00:00Z"),
    event("this morning", "2026-12-05T09:00:00Z"),
    event("tomorrow", "2026-12-06T19:30:00Z"),
  ];

  it("lists what is to come soonest first, keeping an event that has only just started", () => {
    expect(splitEvents(events, now).upcoming.map((e) => e.id)).toEqual(["under way", "tomorrow", "next week"]);
  });

  it("lists what has been newest first", () => {
    expect(splitEvents(events, now).earlier.map((e) => e.id)).toEqual(["this morning", "last week"]);
  });
});

describe("groupByDay", () => {
  const events = [
    event("raid", "2026-12-05T19:30:00Z", "Molten Core"),
    event("late", "2026-12-05T23:30:00Z", "Late run"),
    event("meeting", "2026-12-12T20:00:00Z", "Guild meeting"),
  ];

  it("puts each event under its day, with its time of day", () => {
    expect(groupByDay(events, "UTC")).toEqual([
      {
        key: "2026-12-05",
        label: "Saturday 5 December",
        events: [
          { ...events[0], time: "19:30" },
          { ...events[1], time: "23:30" },
        ],
      },
      { key: "2026-12-12", label: "Saturday 12 December", events: [{ ...events[2], time: "20:00" }] },
    ]);
  });

  it("goes by the reader's own time zone, which can move an event to another day", () => {
    const berlin = groupByDay(events, "Europe/Berlin");
    expect(berlin.map((day) => [day.label, day.events.map((e) => e.time)])).toEqual([
      ["Saturday 5 December", ["20:30"]],
      ["Sunday 6 December", ["00:30"]],
      ["Saturday 12 December", ["21:00"]],
    ]);
    expect(groupByDay(events, "America/Los_Angeles")[0].events.map((e) => e.time)).toEqual(["11:30", "15:30"]);
  });
});

describe("zoneName", () => {
  it("names a time zone as it stands on the day", () => {
    expect(zoneName("UTC", Date.parse("2026-12-05T00:00:00Z"))).toBe("UTC");
    expect(zoneName("Europe/Berlin", Date.parse("2026-12-05T00:00:00Z"))).toBe("CET");
    expect(zoneName("Europe/Berlin", Date.parse("2026-07-05T00:00:00Z"))).toBe("CEST");
  });
});

describe("the form's date and time", () => {
  it("make an instant, and an instant makes them again", () => {
    const instant = toInstant("2026-12-05", "19:30");
    expect(instant).not.toBeNull();
    expect(toFields(instant!)).toEqual({ date: "2026-12-05", time: "19:30" });
  });

  it("are refused when they do not make a date", () => {
    expect(toInstant("", "19:30")).toBeNull();
    expect(toInstant("2026-12-05", "")).toBeNull();
    expect(toInstant("2026-13-45", "19:30")).toBeNull();
    expect(toInstant("5 Dec", "7pm")).toBeNull();
  });
});
