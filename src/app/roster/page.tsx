import Link from "next/link";
import { Frame } from "@/components/wow/Frame";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { loadCraftables } from "@/lib/craftables/load";
import { roster } from "@/lib/guild-summary";
import styles from "./roster.module.css";

export const metadata = {
  title: "Roster",
  description: "Missile Mafia's crafters: who has which profession and at what skill.",
};

/** Every crafter against every profession: who has what, and how far along. */
export default async function RosterPage() {
  const doc = await loadCraftables();
  const { professions, rows, best } = roster(doc);

  return (
    <main className={styles.page}>
      <Frame title="Roster" className={styles.window}>
        <p className={styles.lead}>
          {rows.length === 0
            ? "No crafter has signed up yet."
            : `${rows.length} ${rows.length === 1 ? "crafter" : "crafters"} and the skill each has. A number opens what that character makes with the profession; the best in each is in gold.`}
        </p>
        {rows.length > 0 ? (
          <div className={styles.pane}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.who}>
                    Character
                  </th>
                  <th scope="col" className={styles.count}>
                    Recipes
                  </th>
                  {professions.map((profession) => (
                    <th key={profession.id} scope="col" className={styles.profession}>
                      <Link href={`/crafting?prof=${profession.slug}`}>
                        <ItemIcon fileId={profession.iconFileId} size={30} />
                        <span>{profession.name}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ crafter, recipes, skills }) => {
                  const about = [crafter.level ? `Level ${crafter.level}` : null, crafter.class].filter(Boolean).join(" ");
                  return (
                    <tr key={crafter.id}>
                      <th scope="row" className={styles.who}>
                        <Link href={`/crafting?crafter=${crafter.slug}`} className={styles.name}>
                          {crafter.characterName}
                        </Link>
                        {about ? <span className={styles.about}>{about}</span> : null}
                      </th>
                      <td className={styles.count}>{recipes}</td>
                      {skills.map((skill, column) => (
                        <td key={professions[column].id} className={styles.skill}>
                          {skill > 0 ? (
                            <Link
                              href={`/crafting?crafter=${crafter.slug}&prof=${professions[column].slug}`}
                              data-best={skill === best[column] ? "" : undefined}
                              aria-label={`${crafter.characterName}: ${professions[column].name} ${skill}`}
                            >
                              {skill}
                            </Link>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Frame>
    </main>
  );
}
