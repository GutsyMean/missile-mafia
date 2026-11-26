import { cacheLife, cacheTag } from "next/cache";

/** Temporary: times how the hosted page cache treats a rebuild that overlaps a later refresh. */
async function load(): Promise<number> {
  "use cache";
  cacheLife("hours");
  cacheTag("zz-timing");
  const snapshot = Date.now();
  // The answer arrives a while after the snapshot was taken.
  await new Promise((resolve) => setTimeout(resolve, 8000));
  return snapshot;
}

export default async function Page() {
  const snapshot = await load();
  return <main data-snapshot={snapshot}>snapshot={new Date(snapshot).toISOString()}</main>;
}
