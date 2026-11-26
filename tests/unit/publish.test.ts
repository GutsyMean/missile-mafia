import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";
import { publish, settle } from "@/lib/publish";

/** Runs what was handed to `after`, as the server does once it has answered. */
const runAfterAnswering = () => (vi.mocked(after).mock.calls.at(-1)![0] as () => Promise<void>)();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("settle", () => {
  it("expires the tag's pages again ten seconds after the change, not before", async () => {
    settle("craftables");
    expect(revalidateTag).not.toHaveBeenCalled();
    const done = runAfterAnswering();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(revalidateTag).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("craftables", { expire: 0 });
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("publish", () => {
  it("expires the tag's pages at once, and again once rebuilds under way have finished", async () => {
    publish("events");
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("events");
    const done = runAfterAnswering();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("events", { expire: 0 });
  });
});
