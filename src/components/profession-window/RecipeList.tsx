"use client";

import type { EntryGroup } from "@/lib/craftables/filter";
import { skillLabel } from "@/lib/craftables/pending";
import type { Entry } from "@/lib/craftables/types";
import { ItemIcon } from "@/components/wow/ItemIcon";
import styles from "./window.module.css";

/** The line under an item's name: where it is worn and what is needed to use it. */
export function describeEntry(entry: Entry): string {
  const { item, recipe } = entry;
  if (!item) return recipe.effectText ?? recipe.category;
  const parts: string[] = [];
  if (item.slotName) parts.push(item.slotName);
  if (item.typeName) parts.push(item.typeName);
  if (parts.length === 0) parts.push(recipe.category);
  if (item.requiredLevel > 1) parts.push(`Requires Level ${item.requiredLevel}`);
  return parts.join(" · ");
}

interface Props {
  groups: EntryGroup[];
  /** The recipe the visitor opened. */
  selectedId: number | null;
  /** The recipe the detail pane is showing (the first one, until something is opened). */
  shownId: number | null;
  onSelect: (entry: Entry) => void;
  onHover: (entry: Entry | null, element: HTMLElement | null) => void;
}

export function RecipeList({ groups, selectedId, shownId, onSelect, onHover }: Props) {
  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <section key={group.category ?? "all"} aria-label={group.category ?? "Recipes"}>
          {group.category ? (
            <h2 className={styles.groupHeader}>
              <span>{group.category}</span>
              <span className={styles.groupCount}>{group.entries.length}</span>
            </h2>
          ) : null}
          <ul className={styles.rows}>
            {group.entries.map((entry) => {
              const quality = entry.item?.quality ?? 1;
              const soulbound = entry.item ? !entry.item.tradeable : false;
              const skill = skillLabel(entry);
              return (
                <li key={entry.recipe.id}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-pressed={entry.recipe.id === selectedId}
                    data-shown={entry.recipe.id === shownId}
                    data-recipe={entry.recipe.id}
                    data-available={entry.available}
                    onClick={() => onSelect(entry)}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") onHover(entry, event.currentTarget);
                    }}
                    onPointerLeave={() => onHover(null, null)}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(":focus-visible")) onHover(entry, event.currentTarget);
                    }}
                    onBlur={() => onHover(null, null)}
                  >
                    <ItemIcon fileId={entry.recipe.iconFileId} quality={quality} count={entry.recipe.craftedCount} />
                    <span className={styles.rowText}>
                      <span className={styles.rowName} data-quality={quality}>
                        {entry.item?.name ?? entry.recipe.name}
                      </span>
                      <span className={styles.rowSub}>
                        {entry.available ? describeEntry(entry) : `Not available yet · ${describeEntry(entry)}`}
                      </span>
                    </span>
                    <span className={styles.rowTags}>
                      {skill ? (
                        <span className={styles.rowSkill}>
                          <span className={styles.wideOnly}>{skill}</span>
                          {/* On a phone the profession's name would crowd out the item's own line. */}
                          <span className={styles.narrowOnly}>Skill {entry.recipe.learnSkill}</span>
                        </span>
                      ) : null}
                      {soulbound ? <span className={styles.soulbound}>Soulbound</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
