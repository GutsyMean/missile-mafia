import { SourceText } from "@/components/wow/SourceText";
import { isCrafted } from "@/lib/craftables/filter";
import type { Entry } from "@/lib/craftables/types";
import { WOWFOREVER_RECIPE_PAGES, wowForeverUrl } from "@/lib/game-data/wowforever";
import type { Ranked } from "@/lib/gear/rank";
import { describeSource, sourceKind } from "@/lib/gear/sources";
import { skillToWear } from "@/lib/gear/usable";
import wow from "@/components/wow/wow.module.css";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { ItemTooltip } from "@/components/wow/ItemTooltip";
import styles from "./window.module.css";

interface Props {
  entry: Entry;
  /** When gear is being chosen: what this piece scores, and for which slot. */
  rank?: Ranked;
  /** Who it is being chosen for, e.g. "level 31 Retribution Paladin". */
  character?: string | null;
}

const points = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/** What the selected recipe makes, what it needs, and who can make it. */
export function DetailPane({ entry, rank, character }: Props) {
  const { item, recipe, reagents, crafters, pending } = entry;
  const quality = item?.quality ?? 1;
  // Gear that is not crafted stands in the list for comparison: it has sources instead of a recipe.
  const crafted = isCrafted(entry);
  const sources = entry.sources ?? [];
  // A drop binds to whoever picks it up, which is its wearer; only a crafted piece is lost to them.
  const soulbound = crafted && item ? !item.tradeable : false;
  const recipePage =
    crafted && entry.professionSlug && WOWFOREVER_RECIPE_PAGES.has(entry.professionSlug)
      ? wowForeverUrl(entry.professionSlug)
      : null;
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
            {crafted
              ? recipe.category
              : `Not crafted · ${[...new Set(sources.map(sourceKind))].join(", ")}`}
            {recipe.craftedCount > 1 ? ` · makes ${recipe.craftedCount}` : ""}
          </p>
          {crafted ? (
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
          ) : null}
          {/* Where to read up on it: the item's own page, and the page that says how the recipe is learned. */}
          <p className={styles.readUp}>
            Read up on it:{" "}
            <a
              href={`https://www.wowhead.com/forever/${item ? `item=${item.id}` : `spell=${recipe.id}`}`}
              target="_blank"
              rel="noreferrer"
            >
              Wowhead
            </a>
            {recipePage ? (
              <>
                {" · "}
                <a href={recipePage} target="_blank" rel="noreferrer">
                  wowforever.be {profession} recipes
                </a>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {rank && character ? (
        <p className={styles.rankNote} data-testid="rank">
          <strong>
            {rank.slot} for a {character}.
          </strong>{" "}
          {rank.parts.length > 0 ? (
            <>
              Scores {points(rank.score)}:{" "}
              {rank.parts.map((part) => `${part.label} ${part.amount} (${points(part.points)})`).join(" · ")}.
            </>
          ) : (
            "Ranked by item level."
          )}
          {item && skillToWear(item) ? ` Only a character with ${skillToWear(item)} can wear it.` : ""}
        </p>
      ) : null}

      {crafted && !entry.available ? (
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

      {sources.length > 0 ? (
        <section aria-label={crafted ? "Other sources" : "Where it comes from"}>
          <h3 className={styles.sectionTitle}>{crafted ? "Also found" : "Where it comes from"}</h3>
          <ul className={styles.sources}>
            {sources.map((source) => {
              const { before, link, after } = describeSource(source);
              return (
                <li key={`${source.url}|${source.from ?? ""}`}>
                  {before}
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                  {after}
                  {source.faction ? (
                    <>
                      {" "}
                      <span className={wow.faction} data-faction={source.faction}>
                        ({source.faction === "horde" ? "Horde only" : "Alliance only"})
                      </span>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {crafted ? (
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
      ) : null}

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
    </article>
  );
}
