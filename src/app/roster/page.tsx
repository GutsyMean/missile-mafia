import Link from "next/link";
import { Frame } from "@/components/wow/Frame";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { SkillBar } from "@/components/wow/SkillBar";
import { loadCraftables } from "@/lib/craftables/load";
import { MAX_SKILL } from "@/lib/craftables/types";
import { professionCoverage } from "@/lib/guild-summary";
import styles from "./roster.module.css";

export const metadata = {
  title: "Roster",
  description: "Missile Mafia's crafters by profession: who has which, and how far along.",
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The guild by profession: under each, everyone who has it, with their skill as a bar. */
export default async function RosterPage() {
  const doc = await loadCraftables();
  const professions = professionCoverage(doc).filter((coverage) => coverage.crafters.length > 0);

  return (
    <main className={styles.page}>
      <Frame title="Roster" className={styles.window}>
        <p className={styles.lead}>
          {professions.length === 0
            ? "No crafter has signed up yet."
            : `${count(doc.crafters.length, "crafter")} across ${count(professions.length, "profession")}, the most skilled first. Each bar is a character's skill out of ${MAX_SKILL}; a name opens what they make.`}
        </p>
        <div className={styles.professions}>
          {professions.map(({ profession, crafters }) => (
            <section key={profession.id} className={styles.profession} aria-labelledby={`roster-${profession.slug}`}>
              <h2 id={`roster-${profession.slug}`} className={styles.heading}>
                <Link href={`/crafting?prof=${profession.slug}`} className={styles.name}>
                  <ItemIcon fileId={profession.iconFileId} size={32} />
                  <span>{profession.name}</span>
                </Link>
                <span className={styles.count}>{count(crafters.length, "crafter")}</span>
              </h2>
              <ol className={styles.crafters}>
                {crafters.map(({ crafter, skill }) => (
                  <li key={crafter.id} className={styles.crafter}>
                    <Link
                      href={`/crafting?crafter=${crafter.slug}&prof=${profession.slug}`}
                      className={styles.who}
                      title={crafter.characterName}
                    >
                      {crafter.characterName}
                    </Link>
                    <SkillBar
                      className={styles.bar}
                      skill={skill}
                      label={`${crafter.characterName}: ${profession.name} ${skill} of ${MAX_SKILL}`}
                    >
                      {skill} / {MAX_SKILL}
                    </SkillBar>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Frame>
    </main>
  );
}
