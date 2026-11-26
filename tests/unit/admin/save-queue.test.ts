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

  describe("putting what was saved on the site", () => {
    /** As above, with a stand-in for the step that refreshes the public pages. */
    function setupPublishing(initial: number[] = []) {
      const backend = server();
      const waiting: ((result: SaveResult) => void)[] = [];
      let published = 0;
      const queue = new SaveQueue<"manual" | "bulk">({
        initial,
        save: backend.save,
        onChange: () => {},
        onError: () => {},
        delay: 250,
        publish: () => {
          published += 1;
          return new Promise<SaveResult>((resolve) => waiting.push(resolve));
        },
        publishDelay: 1500,
      });
      const publishAnswer = async (result: SaveResult = { ok: true }) => {
        waiting.shift()!(result);
        await vi.advanceTimersByTimeAsync(0);
      };
      return { ...backend, queue, published: () => published, publishAnswer };
    }

    /** One tick, sent and saved. */
    async function tickAndSave(context: ReturnType<typeof setupPublishing>, id: number) {
      context.queue.change([id], [], "manual");
      await vi.advanceTimersByTimeAsync(250);
      await context.answer();
    }

    it("refreshes the site once for a run of ticks, when the clicking pauses", async () => {
      const context = setupPublishing();
      await tickAndSave(context, 1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(context.published()).toBe(0);
      await tickAndSave(context, 2); // the clicking goes on, so the wait starts again
      await vi.advanceTimersByTimeAsync(1499);
      expect(context.published()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(context.published()).toBe(1);
      expect(context.calls).toHaveLength(2);
    });

    it("waits for a save that is still on its way", async () => {
      const context = setupPublishing();
      context.queue.change([1], [], "manual");
      await vi.advanceTimersByTimeAsync(250);
      await vi.advanceTimersByTimeAsync(5000);
      expect(context.published()).toBe(0);
      await context.answer();
      await vi.advanceTimersByTimeAsync(1500);
      expect(context.published()).toBe(1);
    });

    it("refreshes nothing when nothing was saved", async () => {
      const context = setupPublishing();
      context.queue.change([1], [], "manual");
      context.queue.change([], [1], "manual"); // undone before it was sent
      await vi.advanceTimersByTimeAsync(5000);
      context.queue.change([2], [], "manual");
      await vi.advanceTimersByTimeAsync(250);
      await context.answer({ ok: false, error: "nope" });
      await vi.advanceTimersByTimeAsync(5000);
      expect(context.published()).toBe(0);
    });

    it("still refreshes for what was saved when later clicks come to nothing", async () => {
      const context = setupPublishing();
      await tickAndSave(context, 1);
      await vi.advanceTimersByTimeAsync(500);
      context.queue.change([2], [], "manual");
      context.queue.change([], [2], "manual");
      await vi.advanceTimersByTimeAsync(250); // nothing to send
      await vi.advanceTimersByTimeAsync(1499);
      expect(context.published()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(context.published()).toBe(1);
    });

    it("refreshes again for what is saved while a refresh is on its way", async () => {
      const context = setupPublishing();
      await tickAndSave(context, 1);
      await vi.advanceTimersByTimeAsync(1500);
      expect(context.published()).toBe(1);
      await tickAndSave(context, 2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(context.published()).toBe(1); // one at a time
      await context.publishAnswer();
      await vi.advanceTimersByTimeAsync(1500);
      expect(context.published()).toBe(2);
    });

    it("tries a failed refresh again, three times at most, and afresh after the next save", async () => {
      const context = setupPublishing();
      await tickAndSave(context, 1);
      for (const attempt of [1, 2, 3]) {
        await vi.advanceTimersByTimeAsync(1500);
        expect(context.published()).toBe(attempt);
        await context.publishAnswer({ ok: false, error: "network down" });
      }
      await vi.advanceTimersByTimeAsync(60_000);
      expect(context.published()).toBe(3);
      await tickAndSave(context, 2);
      await vi.advanceTimersByTimeAsync(1500);
      expect(context.published()).toBe(4);
    });

    it("saves and refreshes at once when the page is left", async () => {
      const context = setupPublishing();
      context.queue.change([1], [], "manual");
      context.queue.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(context.calls).toHaveLength(1);
      expect(context.published()).toBe(0); // not before it is saved
      await context.answer();
      expect(context.published()).toBe(1);
    });

    it("refreshes at once when the page is left with everything saved", async () => {
      const context = setupPublishing();
      await tickAndSave(context, 1);
      await vi.advanceTimersByTimeAsync(100);
      context.queue.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(context.published()).toBe(1);
    });

    it("goes back to waiting for more clicks when the page is come back to", async () => {
      const context = setupPublishing();
      context.queue.finish();
      context.queue.change([1], [], "manual");
      await vi.advanceTimersByTimeAsync(249);
      expect(context.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(context.calls).toHaveLength(1);
      await context.answer();
      await vi.advanceTimersByTimeAsync(1499);
      expect(context.published()).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(context.published()).toBe(1);
    });
  });
});
