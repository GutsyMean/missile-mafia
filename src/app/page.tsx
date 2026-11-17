import Link from "next/link";
import { ProfessionWindow } from "@/components/profession-window/ProfessionWindow";
import { unlearnedToLoad } from "@/lib/craftables/filter";
import { loadCraftables, loadUnlearned } from "@/lib/craftables/load";
import { DEFAULT_FILTERS, type UnlearnedDoc } from "@/lib/craftables/types";
import styles from "./page.module.css";

export default async function Home() {
  const doc = await loadCraftables();
  const synced = doc.syncedAt ? doc.syncedAt.slice(0, 10) : null;
  // What the opening view shows of recipes still to learn comes with the page; the rest is fetched when asked for.
  const unlearned: Record<number, UnlearnedDoc> = Object.fromEntries(
    await Promise.all(unlearnedToLoad(doc, DEFAULT_FILTERS).map(async (id) => [id, await loadUnlearned(id)] as const)),
  );

  return (
    <main className={styles.page}>
      <ProfessionWindow doc={doc} initialUnlearned={unlearned} />
      <p className={styles.credits}>
        {doc.build ? `Game data from build ${doc.build}` : "Game data not loaded yet"}
        {synced ? `, updated ${synced}. ` : ". "}
        Unlock levels from <a href="https://wowforever.be">wowforever.be</a> and the{" "}
        <a href="https://warcraft.wiki.gg">Warcraft Wiki</a> (CC BY-SA). Missile Mafia is a fan site, not
        affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and its art are trademarks and
        © Blizzard Entertainment. <Link href="/admin">Crafter sign-in</Link>
      </p>
    </main>
  );
}
