import { ProfessionWindow } from "@/components/profession-window/ProfessionWindow";
import { loadCraftables } from "@/lib/craftables/load";
import styles from "./page.module.css";

export default async function Home() {
  const doc = await loadCraftables();
  const synced = doc.syncedAt ? doc.syncedAt.slice(0, 10) : null;

  return (
    <main className={styles.page}>
      <ProfessionWindow doc={doc} />
      <p className={styles.credits}>
        {doc.build ? `Game data from build ${doc.build}` : "Game data not loaded yet"}
        {synced ? `, updated ${synced}. ` : ". "}
        Unlock levels from <a href="https://wowforever.be">wowforever.be</a> and the{" "}
        <a href="https://warcraft.wiki.gg">Warcraft Wiki</a> (CC BY-SA). Missile Mafia is a fan site, not
        affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and its art are trademarks and
        © Blizzard Entertainment.
      </p>
    </main>
  );
}
