import { SourceText } from "@/components/wow/SourceText";
import type { Entry } from "@/lib/craftables/types";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { ItemTooltip } from "@/components/wow/ItemTooltip";
import styles from "./window.module.css";

/** What the selected recipe makes, what it needs, and who can make it. */
export function DetailPane({ entry }: { entry: Entry }) {
  const { item, recipe, reagents, crafters, pending } = entry;
  const quality = item?.quality ?? 1;
  const soulbound = item ? !item.tradeable : false;
  const profession = entry.professionName ?? "Skill";
  const learnSkill = recipe.learnSkill ?? null;
  // The skill at which crafting it stops being a sure skill-up, as the game colours it.
  const steps: [string, number | null | undefined][] = [
    ["orange", learnSkill],
    ["yellow", recipe.skillYellow],
    ["green", recipe.skillGreen],
    ["grey", recipe.skillGrey],
  ];
  const known = steps.filter((step): step is [string, number] => typeof step[1] === "number" && step[1] > 0);
  // Only shown when the numbers rise in order; a few recipes in the game data do not.
  const shownSteps = known.every(([, value], index) => index === 0 || value >= known[index - 1][1]) ? known : [];
  const waiting = pending.map((crafter) => crafter.characterName);

  return (
    <article className={styles.detail} data-testid="detail">
      <header className={styles.detailHeader}>
        <ItemIcon fileId={recipe.iconFileId} quality={quality} size={48} count={recipe.craftedCount} />
        <div>
          <h2 className={styles.detailName} data-quality={quality}>
            {item?.name ?? recipe.name}
          </h2>
          <p className={styles.detailMeta}>
            {recipe.category}
            {recipe.craftedCount > 1 ? ` · makes ${recipe.craftedCount}` : ""}
          </p>
          <p className={styles.detailSkill}>
            {learnSkill !== null ? `Requires ${profession} (${learnSkill})` : `${profession} skill needed: not confirmed`}
            {shownSteps.length > 1 ? (
              <span
                className={styles.skillSteps}
                aria-label={`Skill-ups: ${shownSteps.map(([colour, value]) => `${colour} from ${value}`).join(", ")}`}
              >
                {shownSteps.map(([colour, value]) => (
                  <span key={colour} data-step={colour} aria-hidden="true">
                    {value}
                  </span>
                ))}
              </span>
            ) : null}
          </p>
        </div>
      </header>

      {!entry.available ? (
        <p className={styles.pendingBanner} role="note">
          <strong>Not available yet.</strong>{" "}
          {waiting.length > 0
            ? `${waiting.join(", ")} ${waiting.length === 1 ? "has" : "have"} not learned this recipe.`
            : "Nobody in the guild has learned this recipe."}
          {learnSkill !== null ? ` It needs ${profession} ${learnSkill}.` : ""} Source: <SourceText recipe={recipe} />.
        </p>
      ) : null}

      {soulbound ? (
        <p className={styles.soulboundBanner} role="note">
          <strong>Soulbound.</strong> This item binds to the crafter when it is made, so it cannot be traded
          or mailed to you.
        </p>
      ) : null}

      {item ? (
        <ItemTooltip
          lines={item.tooltip}
          quality={item.quality}
          sellPrice={item.sellPrice}
          incomplete={!item.tooltipComplete}
        />
      ) : recipe.effectText ? (
        <p className={styles.effect}>{recipe.effectText}</p>
      ) : null}

      <section aria-label="Reagents">
        <h3 className={styles.sectionTitle}>Reagents</h3>
        <ul className={styles.reagents}>
          {reagents.map((reagent) => (
            <li key={reagent.itemId} className={styles.reagent}>
              <ItemIcon fileId={reagent.item?.iconFileId ?? 0} quality={reagent.item?.quality ?? 1} size={32} />
              <span className={styles.reagentCount}>{reagent.quantity}</span>
              <span className={styles.reagentName} data-quality={reagent.item?.quality ?? 1}>
                {reagent.item?.name ?? `Item ${reagent.itemId}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {crafters.length > 0 ? (
        <section aria-label="Crafters">
          <h3 className={styles.sectionTitle}>Crafted by</h3>
          <ul className={styles.crafters}>
            {crafters.map((crafter) => (
              <li key={crafter.id}>
                <span className={styles.crafterName}>{crafter.characterName}</span>
                <span className={styles.crafterHow}> — whisper in game</span>
                {crafter.note ? <p className={styles.crafterNote}>{crafter.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {item ? (
        <p className={styles.external}>
          <a href={`https://www.wowhead.com/forever/item=${item.id}`} target="_blank" rel="noreferrer">
            View on Wowhead
          </a>
        </p>
      ) : null}
    </article>
  );
}
