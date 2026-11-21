import Link from "next/link";
import { ProfessionWindow } from "@/components/profession-window/ProfessionWindow";
import wow from "@/components/wow/wow.module.css";
import { unlearnedWithPage } from "@/lib/craftables/filter";
import { loadCraftables, loadUnlearned } from "@/lib/craftables/load";
import type { UnlearnedDoc } from "@/lib/craftables/types";
import styles from "./page.module.css";

export default async function Home() {
  const doc = await loadCraftables();
  const synced = doc.syncedAt ? doc.syncedAt.slice(0, 10) : null;
  // A guild with one profession gets its recipes still to learn with the page; otherwise they are fetched once it is up.
  const unlearned: Record<number, UnlearnedDoc> = Object.fromEntries(
    await Promise.all(unlearnedWithPage(doc).map(async (id) => [id, await loadUnlearned(id)] as const)),
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {/* Which of the two shows is decided in the visitor's browser: see lib/account-marker. */}
        <Link href="/admin" className={`${wow.button} ${styles.signIn}`}>
          <span className={styles.newVisitor}>Become a Crafter</span>
          <span className={styles.returning}>Crafter sign-in</span>
        </Link>
      </header>
      <ProfessionWindow doc={doc} initialUnlearned={unlearned} />
      <p className={styles.credits}>
        {doc.build ? `Game data from build ${doc.build}` : "Game data not loaded yet"}
        {synced ? `, updated ${synced}. ` : ". "}
        Unlock levels and quest factions from <a href="https://wowforever.be">wowforever.be</a> and the{" "}
        <a href="https://warcraft.wiki.gg">Warcraft Wiki</a> (CC BY-SA). Missile Mafia is a fan site, not
        affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and its art are trademarks and
        © Blizzard Entertainment.
      </p>
    </main>
  );
}
