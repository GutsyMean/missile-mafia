import Link from "next/link";
import { Frame } from "@/components/wow/Frame";
import { ItemIcon } from "@/components/wow/ItemIcon";
import wow from "@/components/wow/wow.module.css";
import { loadCraftables } from "@/lib/craftables/load";
import { craftableNow, professionCoverage } from "@/lib/guild-summary";
import styles from "./home.module.css";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The front page: where a guild member starts, whatever they came for. */
export default async function Home() {
  const doc = await loadCraftables();
  const coverage = professionCoverage(doc);
  const classes = doc.classes ?? [];

  return (
    <main className={styles.home}>
      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.title}>
          What do you need made?
        </h1>
        <p className={styles.lead}>
          Search everything Missile Mafia&apos;s crafters can make, see who to whisper, or find the best gear for your
          character.
        </p>
        <form className={styles.search} action="/crafting" role="search">
          <input
            className={`${wow.field} ${styles.searchField}`}
            type="search"
            name="q"
            autoComplete="off"
            aria-label="Search items and reagents"
            placeholder="An item or a reagent, like Mithril"
          />
          <button type="submit" className={`${wow.button} ${styles.searchButton}`}>
            Search
          </button>
        </form>
        {doc.crafters.length > 0 ? (
          <p className={styles.tally}>
            {count(craftableNow(doc), "recipe")} from {count(doc.crafters.length, "crafter")} across{" "}
            {count(coverage.length, "profession")}.
          </p>
        ) : null}
      </section>

      <div className={styles.columns}>
        <Frame title="Professions" heading="h2" className={styles.professions}>
          <div className={styles.pane}>
            {coverage.length === 0 ? (
              <p className={styles.empty}>
                No crafter has listed a profession yet. The first to sign in and add their recipes shows up here.
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Profession</th>
                    <th scope="col" className={styles.number}>
                      Recipes
                    </th>
                    <th scope="col">Who to ask, most skilled first</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map(({ profession, recipes, crafters }) => (
                    <tr key={profession.id}>
                      <th scope="row">
                        <Link href={`/crafting?prof=${profession.slug}`} className={styles.profession}>
                          <ItemIcon fileId={profession.iconFileId} size={34} />
                          <span>{profession.name}</span>
                        </Link>
                      </th>
                      <td className={styles.number}>{recipes}</td>
                      <td>
                        <ul className={styles.people}>
                          {crafters.map(({ crafter, skill }) => (
                            <li key={crafter.id}>
                              <Link href={`/crafting?crafter=${crafter.slug}&prof=${profession.slug}`}>
                                {crafter.characterName}
                              </Link>{" "}
                              <span className={styles.skill}>{skill}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Frame>

        <div className={styles.side}>
          {classes.length > 0 ? (
            <Frame title="Best gear" heading="h2">
              <div className={styles.pane}>
                <p>
                  The best pieces for your class, talent tree and level, slot by slot: what the guild can craft, and
                  what drops or comes from quests.
                </p>
                <ul className={styles.classes}>
                  {classes.map((option) => (
                    <li key={option.id}>
                      <Link href={`/gear?class=${option.slug}`} className={wow.button}>
                        {option.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Frame>
          ) : null}
          <Frame title="Crafters" heading="h2">
            <div className={styles.pane}>
              <p>
                Have a profession? Sign in with Discord and list what you can make, so guildmates find you when they
                need it. An addon export fills in your recipes for you.
              </p>
              <div className={styles.actions}>
                <Link href="/admin" className={wow.button}>
                  List my recipes
                </Link>
                <Link href="/roster" className={styles.more}>
                  See the whole roster
                </Link>
              </div>
            </div>
          </Frame>
        </div>
      </div>
    </main>
  );
}
