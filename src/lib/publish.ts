import { revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";

/** How long after a change its pages are expired once more: longer than a page takes to rebuild. */
const SETTLE_MS = 10_000;

/**
 * Expires a tag's pages again a little after a change was written. Call it
 * after every write, from a server action or a route handler.
 *
 * Expiring only reaches what is already stored. A page that was being rebuilt
 * while the change was written still holds what was there before it, and is
 * stored as current when it finishes, after the expiry. It would then be served
 * until the cache's own time ran out, an hour later. Expiring once more, when
 * any such rebuild has finished, clears it.
 */
export function settle(tag: string): void {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    revalidateTag(tag, { expire: 0 });
  });
}

/** Shows a change on the tag's pages at once, and settles it. For server actions. */
export function publish(tag: string): void {
  updateTag(tag);
  settle(tag);
}
