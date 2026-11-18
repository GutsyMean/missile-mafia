import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveQueue, type SaveResult } from "@/lib/admin/save-queue";

type Call = { add: number[]; remove: number[]; source: string };

/** A stand-in for the server: records each save and answers when told to. */
function server() {
  const calls: Call[] = [];
  const waiting: ((result: SaveResult) => void)[] = [];
  const save = (add: number[], remove: number[], source: string) => {
    calls.push({ add: [...add].sort((a, b) => a - b), remove: [...remove].sort((a, b) => a - b), source });
    return new Promise<SaveResult>((resolve) => waiting.push(resolve));
  };
  const answer = async (result: SaveResult = { ok: true }) => {
    waiting.shift()!(result);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { calls, save, answer };
}

function setup(initial: number[] = []) {
  const backend = server();
  const views: number[][] = [];
  const errors: { message: string; undone: number[] }[] = [];
  const busy: boolean[] = [];
  const queue = new SaveQueue<"manual" | "bulk">({
    initial,
    save: backend.save,
    onChange: (view) => views.push([...view].sort((a, b) => a - b)),
    onError: (message, undone) => errors.push({ message, undone: [...undone].sort((a, b) => a - b) }),
    onBusy: (saving) => busy.push(saving),
    delay: 250,
  });
  const shown = () => views[views.length - 1];
  return { ...backend, queue, views, errors, busy, shown };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SaveQueue", () => {
  it("shows a tick at once and saves it a moment later", async () => {
    const { queue, calls, shown } = setup([1]);
    queue.change([2], [], "manual");
    expect(shown()).toEqual([1, 2]);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toEqual([{ add: [2], remove: [], source: "manual" }]);
  });

  it("sends several quick clicks as one save", async () => {
    const { queue, calls } = setup([3]);
    queue.change([1], [], "manual");
    await vi.advanceTimersByTimeAsync(100);
    queue.change([2], [], "manual");
    await vi.advanceTimersByTimeAsync(100);
    queue.change([], [3], "manual");
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toEqual([{ add: [1, 2], remove: [3], source: "manual" }]);
  });

  it("never blocks: clicks made during a save show at once and are sent next", async () => {
    const { queue, calls, shown, answer } = setup();
    queue.change([1], [], "manual");
    await vi.advanceTimersByTimeAsync(250);
    queue.change([2], [], "manual");
    expect(shown()).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
    await answer();
    await vi.advanceTimersByTimeAsync(250);
    expect(calls[1]).toEqual({ add: [2], remove: [], source: "manual" });
  });

  it("undoes only what failed to save, and says so", async () => {
    const { queue, shown, errors, answer } = setup([5]);
    queue.change([1], [], "manual");
    await vi.advanceTimersByTimeAsync(250);
    queue.change([2], [], "manual"); // made while the first save is on its way
    await answer({ ok: false, error: "Sign in again to save." });
    expect(shown()).toEqual([2, 5]);
    expect(errors).toEqual([{ message: "Sign in again to save.", undone: [1] }]);
    await vi.advanceTimersByTimeAsync(250);
    await answer();
    expect(shown()).toEqual([2, 5]);
  });

  it("puts a removed tick back when removing it fails", async () => {
    const { queue, shown, answer } = setup([1, 2]);
    queue.change([], [2], "manual");
    expect(shown()).toEqual([1]);
    await vi.advanceTimersByTimeAsync(250);
    await answer({ ok: false, error: "nope" });
    expect(shown()).toEqual([1, 2]);
  });

  it("treats a save that throws like one that failed", async () => {
    const views: number[][] = [];
    const errors: string[] = [];
    const queue = new SaveQueue<"manual">({
      initial: [],
      save: async () => {
        throw new Error("network down");
      },
      onChange: (view) => views.push([...view]),
      onError: (message) => errors.push(message),
      delay: 250,
    });
    queue.change([1], [], "manual");
    await vi.advanceTimersByTimeAsync(250);
    expect(views[views.length - 1]).toEqual([]);
    expect(errors).toEqual(["network down"]);
  });

  it("sends nothing for a click that is undone before it was saved", async () => {
    const { queue, calls, shown } = setup([1]);
    queue.change([2], [], "manual");
    queue.change([], [2], "manual");
    expect(shown()).toEqual([1]);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toEqual([]);
  });

  it("removes a tick again if it is unticked while its save is on the way", async () => {
    const { queue, calls, shown, answer } = setup();
    queue.change([1], [], "manual");
    await vi.advanceTimersByTimeAsync(250);
    queue.change([], [1], "manual");
    expect(shown()).toEqual([]);
    await answer();
    await vi.advanceTimersByTimeAsync(250);
    expect(calls[1]).toEqual({ add: [], remove: [1], source: "manual" });
    await answer();
    expect(shown()).toEqual([]);
  });

  it("keeps how each tick was made", async () => {
    const { queue, calls, answer } = setup();
    queue.change([1, 2, 3], [], "bulk");
    queue.change([9], [], "manual");
    await vi.advanceTimersByTimeAsync(250);
    await answer();
    expect(calls).toEqual([
      { add: [1, 2, 3], remove: [], source: "bulk" },
      { add: [9], remove: [], source: "manual" },
    ]);
  });

  it("keeps unsaved clicks on top of a list refreshed from the server", async () => {
    const { queue, shown } = setup([1]);
    queue.change([9], [], "manual");
    queue.reset([1, 2, 3]);
    expect(shown()).toEqual([1, 2, 3, 9]);
  });

  it("reports when it is saving and when everything is saved", async () => {
    const { queue, busy, answer } = setup();
    expect(queue.unsaved).toBe(false);
    queue.change([1], [], "manual");
    expect(queue.unsaved).toBe(true);
    expect(busy).toEqual([true]);
    await vi.advanceTimersByTimeAsync(250);
    await answer();
    expect(busy).toEqual([true, false]);
    expect(queue.unsaved).toBe(false);
  });
});
