"use client";

import { useState } from "react";
import type { ClassView } from "@/lib/craftables/types";
import { NO_GEAR, type GearChoice } from "@/lib/craftables/url-state";
import { ALL_GEAR_STATS, GEAR_STATS, type GearStat } from "@/lib/gear/stats";
import wow from "@/components/wow/wow.module.css";
import styles from "./window.module.css";

/** The highest level a character can be. */
export const MAX_LEVEL = 60;

interface Props {
  classes: ClassView[];
  /** The choice as the address has it. */
  gear: GearChoice;
  /** The class and talent tree that choice resolves to; null when gear is not being chosen. */
  gameClass: ClassView | null;
  spec: ClassView["specs"][number] | null;
  /** The order of stats in force; null when the talent tree has none. */
  order: GearStat[] | null;
  /** True when the order is the visitor's own. */
  custom: boolean;
  /** The guide the default order follows; null when it is our own reading. */
  guide: string | null;
  onChange: (gear: GearChoice) => void;
  /** Sets the visitor's own order; null goes back to the default. */
  onOrderChange: (order: GearStat[] | null) => void;
}

function levelValue(text: string): number | null {
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) && number > 0 ? Math.min(MAX_LEVEL, number) : null;
}

/** Who gear is being chosen for, and the order of stats it is ranked by. */
export function GearBar({
  classes,
  gear,
  gameClass,
  spec,
  order,
  custom,
  guide,
  onChange,
  onOrderChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  if (classes.length === 0) return null;

  const move = (from: number, to: number) => {
    if (!order) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    onOrderChange(next);
  };
  const unused = ALL_GEAR_STATS.filter((stat) => !order?.includes(stat));
  // Said only when the order is not simply the one a guide gives.
  const sourceNote = custom
    ? "Your own order, kept in this browser."
    : order && !guide
      ? "wowforever.be has no order for this talent tree yet, so this one is our own."
      : null;

  return (
    <section className={styles.gear} aria-label="Best gear for a character" data-editing={editing}>
      <div className={styles.gearChoice}>
        <span className={styles.gearLabel}>Best gear for</span>
        <select
          className={wow.field}
          aria-label="Class"
          value={gameClass?.slug ?? ""}
          onChange={(event) => {
            setEditing(false);
            onChange({ ...gear, classSlug: event.target.value, specSlug: "" });
          }}
        >
          <option value="">Choose a class</option>
          {classes.map((option) => (
            <option key={option.id} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>
        {gameClass && spec ? (
          <>
            <select
              className={`${wow.field} ${styles.picker}`}
              aria-label="Talent tree"
              value={spec.slug}
              onChange={(event) => onChange({ ...gear, classSlug: gameClass.slug, specSlug: event.target.value })}
            >
              {gameClass.specs.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
            <label className={styles.levels}>
              <span className={styles.levelsLabel}>Level</span>
              <input
                autoComplete="off"
                className={`${wow.field} ${styles.level}`}
                inputMode="numeric"
                aria-label="Character level"
                placeholder={String(MAX_LEVEL)}
                value={gear.level ?? ""}
                onChange={(event) => onChange({ ...gear, level: levelValue(event.target.value) })}
              />
            </label>
            <label className={wow.checkbox}>
              <input
                type="checkbox"
                checked={gear.everySource}
                onChange={(event) => onChange({ ...gear, everySource: event.target.checked })}
              />
              Include drops and quest rewards
            </label>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setEditing(false);
                onChange(NO_GEAR);
              }}
            >
              Another class
            </button>
          </>
        ) : null}
      </div>

      {gameClass && spec ? (
        <div className={styles.gearOrder}>
          {order ? (
            <>
              <span className={styles.gearLabel}>Ranked by</span>
              <ol className={styles.gearStats} aria-label="Order of stats">
                {order.map((stat) => (
                  <li key={stat}>{GEAR_STATS[stat].label}</li>
                ))}
              </ol>
            </>
          ) : (
            <span>No order of stats for this talent tree yet, so it is ranked by item level.</span>
          )}
          <button
            type="button"
            className={styles.linkButton}
            aria-expanded={editing}
            aria-controls="gear-order-editor"
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? "Done" : "Change"}
          </button>
          {sourceNote ? <span className={styles.gearSource}>{sourceNote}</span> : null}
        </div>
      ) : null}


      {gameClass && spec && editing ? (
        <div id="gear-order-editor" className={styles.gearEditor} role="group" aria-label="Change the order of stats">
          <ol>
            {(order ?? []).map((stat, index) => {
              const label = GEAR_STATS[stat].label;
              return (
                <li key={stat}>
                  <span>{label}</span>
                  <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} down`}
                    disabled={index === (order?.length ?? 0) - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => onOrderChange((order ?? []).filter((other) => other !== stat))}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={styles.gearEditorActions}>
            {unused.length > 0 ? (
              <select
                className={`${wow.field} ${styles.picker}`}
                aria-label="Add a stat"
                value=""
                onChange={(event) => {
                  if (event.target.value) onOrderChange([...(order ?? []), event.target.value as GearStat]);
                }}
              >
                <option value="">Add a stat…</option>
                {unused.map((stat) => (
                  <option key={stat} value={stat}>
                    {GEAR_STATS[stat].label}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className={styles.linkButton} disabled={!custom} onClick={() => onOrderChange(null)}>
              Back to the default order
            </button>
          </div>
          <p className={styles.gearHow}>
            A stat higher up counts for more: each place down is worth a fifth less. A weapon&apos;s damage counts
            for its slot only.
          </p>
        </div>
      ) : null}
    </section>
  );
}
