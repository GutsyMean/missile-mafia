"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { isCrafted, type EntryGroup } from "@/lib/craftables/filter";
import { factionNote, skillLabel } from "@/lib/craftables/pending";
import { sourceKind, sourcePlace, sourcesFaction } from "@/lib/gear/sources";
import { skillToWear } from "@/lib/gear/usable";
import type { Entry } from "@/lib/craftables/types";
import { ItemIcon } from "@/components/wow/ItemIcon";
import wow from "@/components/wow/wow.module.css";
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

/** How many rows are drawn at first, and how many more each time the end comes near. */
const STRETCH = 300;

interface Props {
  groups: EntryGroup[];
  /** The recipe the visitor opened. */
  selectedId: number | null;
  /** The recipe the detail pane is showing (the first one, until something is opened). */
  shownId: number | null;
  onSelect: (entry: Entry) => void;
  onHover: (entry: Entry | null, element: HTMLElement | null) => void;
  /** Opens a group up to show everything in it, or closes it again. Groups say whether they can be. */
  onToggleGroup?: (category: string) => void;
}

/**
 * Remembered between renders: the window re-renders on every hover, and the
 * list can hold a couple of thousand rows that have not changed.
 */
export const RecipeList = memo(function RecipeList({
  groups,
  selectedId,
  shownId,
  onSelect,
  onHover,
  onToggleGroup,
}: Props) {
  // A long list is drawn a stretch at a time, more as the reader nears the end.
  // Drawing a couple of thousand rows at once makes every keystroke in the search wait.
  const total = useMemo(() => groups.reduce((count, group) => count + group.entries.length, 0), [groups]);
  // The opened recipe is always drawn, however far down it is.
  const opened = useMemo(() => {
    if (selectedId === null) return 0;
    let position = 0;
    for (const group of groups) {
      for (const entry of group.entries) {
        position++;
        if (entry.recipe.id === selectedId) return position;
      }
    }
    return 0;
  }, [groups, selectedId]);
  const [reached, setReached] = useState(STRETCH);
  const limit = Math.max(reached, opened + 20);

  const nearEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const marker = nearEnd.current;
    if (!marker) return;
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((entry) => entry.isIntersecting)) setReached((current) => current + STRETCH);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [limit, total]);

  let drawn = 0;
  return (
    <div className={styles.list}>
      {groups.map((group) => {
        const room = Math.max(0, limit - drawn);
        const entries = group.entries.length > room ? group.entries.slice(0, room) : group.entries;
        drawn += entries.length;
        // A group with nothing drawn yet waits for its turn, heading and all.
        if (entries.length === 0) return null;
        return (
        <section key={group.category ?? "all"} aria-label={group.category ?? "Recipes"}>
          {group.category ? (
            <h2 className={styles.groupHeader}>
              <span>{group.category}</span>
              <span className={styles.groupTools}>
                {group.toggle && onToggleGroup ? (
                  <button
                    type="button"
                    className={styles.groupToggle}
                    aria-expanded={group.toggle === "close"}
                    onClick={() => onToggleGroup(group.category ?? "")}
                  >
                    {group.toggle === "open" ? `Show all ${group.total}` : "Show fewer"}
                  </button>
                ) : null}
                <span className={styles.groupCount}>
                  {group.total !== undefined && group.total > group.entries.length
                    ? `${group.entries.length} of ${group.total}`
                    : group.entries.length}
                </span>
              </span>
            </h2>
          ) : null}
          <ul className={styles.rows}>
            {entries.map((entry) => {
              const quality = entry.item?.quality ?? 1;
              const crafted = isCrafted(entry);
              // A drop binds to whoever picks it up, which is its wearer; only a crafted piece is lost to them.
              const soulbound = crafted && entry.item ? !entry.item.tradeable : false;
              const skill = crafted ? skillLabel(entry) : null;
              // Worth a mark in the list only when it shuts a faction out of a recipe nobody has yet.
              const faction = entry.available ? null : factionNote(entry.recipe);
              // For gear that is not crafted: the first place to look, and the side it is limited to, if any.
              const source = crafted ? null : (entry.sources?.[0] ?? null);
              const side = crafted ? null : sourcesFaction(entry.sources ?? []);
              const note = group.notes?.[entry.recipe.id];
              // When gear is ranked: a piece only someone with a profession can wear says so.
              const needs = group.ranked && entry.item ? skillToWear(entry.item) : null;
              return (
                <li key={entry.recipe.id}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-pressed={entry.recipe.id === selectedId}
                    data-shown={entry.recipe.id === shownId}
                    data-recipe={entry.recipe.id}
                    data-available={entry.available}
                    data-crafted={crafted}
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
                        {source
                          ? `${sourcePlace(source)} · ${describeEntry(entry)}`
                          : entry.available
                            ? describeEntry(entry)
                            : `Not available yet · ${describeEntry(entry)}`}
                      </span>
                    </span>
                    <span className={styles.rowTags}>
                      {note ? <span className={styles.best}>{note}</span> : null}
                      {source ? <span className={styles.sourceTag}>{sourceKind(source)}</span> : null}
                      {needs ? <span className={styles.needsSkill}>Wearer needs {needs}</span> : null}
                      {side ? (
                        <span className={wow.faction} data-faction={side}>
                          {side === "horde" ? "Horde only" : "Alliance only"}
                        </span>
                      ) : null}
                      {skill ? (
                        <span className={styles.rowSkill}>
                          <span className={styles.wideOnly}>{skill}</span>
                          {/* On a phone the profession's name would crowd out the item's own line. */}
                          <span className={styles.narrowOnly}>Skill {entry.recipe.learnSkill}</span>
                        </span>
                      ) : null}
                      {faction?.sole ? (
                        <span className={wow.faction} data-faction={faction.faction}>
                          {faction.text}
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
        );
      })}
      {limit < total ? (
        // Reaches up over the last screenful, so the next stretch is drawn before the end comes into view.
        <div className={styles.moreMarker}>
          <div ref={nearEnd} />
        </div>
      ) : null}
    </div>
  );
});
