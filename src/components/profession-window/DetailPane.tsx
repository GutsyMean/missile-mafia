import type { Entry } from "@/lib/craftables/types";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { ItemTooltip } from "@/components/wow/ItemTooltip";
import styles from "./window.module.css";

/** What the selected recipe makes, what it needs, and who can make it. */
export function DetailPane({ entry }: { entry: Entry }) {
  const { item, recipe, reagents, crafters } = entry;
  const quality = item?.quality ?? 1;
  const soulbound = item ? !item.tradeable : false;

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
        </div>
      </header>

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
