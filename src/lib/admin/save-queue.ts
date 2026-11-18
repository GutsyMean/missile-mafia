/**
 * Saves a set of ticked ids in the background, so ticking never waits.
 *
 * A click shows at once. Clicks made close together are sent as one save,
 * and clicks made while a save is on its way are kept and sent next. If a
 * save fails, only the changes it carried are undone; everything saved
 * before and everything clicked since stays as it is.
 */

export type SaveResult = { ok: true } | { ok: false; error: string };

interface Options<Source extends string> {
  /** The ids the server has now. */
  initial: Iterable<number>;
  save: (add: number[], remove: number[], source: Source) => Promise<SaveResult>;
  /** What to show: what the server has, with every unsaved click applied on top. */
  onChange: (view: Set<number>) => void;
  /** A save failed. `undone` are the ids put back to what the server has. */
  onError: (message: string, undone: number[]) => void;
  /** True from the first unsaved click until everything is saved. */
  onBusy?: (saving: boolean) => void;
  /** How long to wait for more clicks before sending, in milliseconds. */
  delay?: number;
}

type Intent<Source> = { on: boolean; source: Source };

export class SaveQueue<Source extends string = string> {
  /** What the server is known to have. */
  private confirmed: Set<number>;
  /** Clicks not sent yet: the latest wish per id. */
  private queued = new Map<number, Intent<Source>>();
  /** Clicks in the save that is on its way. */
  private sending: Map<number, Intent<Source>> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private readonly options: Options<Source>;

  constructor(options: Options<Source>) {
    this.options = options;
    this.confirmed = new Set(options.initial);
  }

  /** True while a click is waiting to be saved or being saved. */
  get unsaved(): boolean {
    return this.queued.size > 0 || this.sending !== null;
  }

  /** Ticks and unticks. Shows at once; saves shortly. */
  change(add: number[], remove: number[], source: Source): void {
    for (const id of add) this.queued.set(id, { on: true, source });
    for (const id of remove) this.queued.set(id, { on: false, source });
    this.options.onChange(this.view());
    this.setBusy(true);
    this.schedule();
  }

  /** The server's list changed by another route (an import, say). Unsaved clicks stay on top. */
  reset(ids: Iterable<number>): void {
    this.confirmed = new Set(ids);
    this.options.onChange(this.view());
  }

  private view(): Set<number> {
    const view = new Set(this.confirmed);
    for (const intents of [this.sending, this.queued]) {
      for (const [id, intent] of intents ?? []) {
        if (intent.on) view.add(id);
        else view.delete(id);
      }
    }
    return view;
  }

  private setBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    this.options.onBusy?.(busy);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.delay ?? 250);
  }

  private async flush(): Promise<void> {
    if (this.sending) return; // the save on its way picks the queue up when it returns

    // Only what differs from the server needs sending: a tick undone before it was saved is nothing.
    const batch = new Map([...this.queued].filter(([id, intent]) => intent.on !== this.confirmed.has(id)));
    this.queued.clear();
    if (batch.size === 0) {
      this.setBusy(false);
      return;
    }
    this.sending = batch;

    const undone: number[] = [];
    let failure: string | null = null;
    for (const source of new Set([...batch.values()].map((intent) => intent.source))) {
      const mine = [...batch].filter(([, intent]) => intent.source === source);
      const add = mine.filter(([, intent]) => intent.on).map(([id]) => id);
      const remove = mine.filter(([, intent]) => !intent.on).map(([id]) => id);
      let result: SaveResult;
      try {
        result = await this.options.save(add, remove, source);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (result.ok) {
        for (const id of add) this.confirmed.add(id);
        for (const id of remove) this.confirmed.delete(id);
      } else {
        failure = result.error;
        // What was clicked again since keeps its newer wish and is tried again with the next save.
        undone.push(...mine.map(([id]) => id).filter((id) => !this.queued.has(id)));
      }
    }

    this.sending = null;
    this.options.onChange(this.view());
    if (failure !== null) this.options.onError(failure, undone);
    if (this.queued.size > 0) this.schedule();
    else this.setBusy(false);
  }
}
