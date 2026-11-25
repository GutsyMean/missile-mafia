import { loadCraftables } from "@/lib/craftables/load";
import styles from "./site.module.css";

/** The credits at the foot of every page: where the game data comes from, and whose game it is. */
export async function SiteFooter() {
  const doc = await loadCraftables();
  const synced = doc.syncedAt ? doc.syncedAt.slice(0, 10) : null;
  return (
    <footer className={styles.footer}>
      <p>
        {doc.build ? `Game data from build ${doc.build}` : "Game data not loaded yet"}
        {synced ? `, updated ${synced}. ` : ". "}
        Unlock levels, quest factions and dungeon loot from <a href="https://wowforever.be">wowforever.be</a> and the{" "}
        <a href="https://warcraft.wiki.gg">Warcraft Wiki</a> (CC BY-SA). Missile Mafia is a fan site, not
        affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and its art are trademarks and
        © Blizzard Entertainment.
      </p>
    </footer>
  );
}
