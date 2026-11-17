"use client";

import { useState } from "react";
import type { FilterOptions } from "@/lib/craftables/filter";
import type { Filters, SortMode } from "@/lib/craftables/types";
import wow from "@/components/wow/wow.module.css";
import styles from "./window.module.css";

interface Props {
  filters: Filters;
  options: FilterOptions;
  onChange: (patch: Partial<Filters>) => void;
}

function levelValue(text: string): number | null {
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function FilterBar({ filters, options, onChange }: Props) {
  // On a phone the extra filters stay folded away until asked for.
  const [expanded, setExpanded] = useState(false);
  const active = [
    filters.slot,
    filters.type,
    filters.stat,
    filters.minLevel,
    filters.maxLevel,
    filters.tradeableOnly,
    filters.availableOnly,
  ].filter(Boolean).length;
  const select = (label: string, key: "slot" | "type" | "stat", all: string, values: string[]) => (
    <select
      className={wow.field}
      aria-label={label}
      value={filters[key]}
      onChange={(event) => onChange({ [key]: event.target.value })}
    >
      <option value="">{all}</option>
      {values.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );

  return (
    <form className={styles.filters} role="search" onSubmit={(event) => event.preventDefault()}>
      <input
        className={`${wow.field} ${styles.search}`}
        type="search"
        aria-label="Search items and reagents"
        placeholder="Search"
        value={filters.search}
        onChange={(event) => onChange({ search: event.target.value })}
      />
      <button
        type="button"
        className={`${wow.button} ${styles.filterToggle}`}
        aria-expanded={expanded}
        aria-controls="more-filters"
        onClick={() => setExpanded((open) => !open)}
      >
        Filters{active > 0 ? ` (${active})` : ""}
      </button>
      <div id="more-filters" className={styles.moreFilters} data-expanded={expanded}>
      {select("Slot", "slot", "All slots", options.slots)}
      {select("Armor or weapon type", "type", "All types", options.types)}
      {select("Stat", "stat", "Any stat", options.stats)}
      <span className={styles.levels}>
        <span className={styles.levelsLabel}>Level</span>
        <input
          className={`${wow.field} ${styles.level}`}
          inputMode="numeric"
          aria-label="Lowest required level"
          placeholder="1"
          value={filters.minLevel ?? ""}
          onChange={(event) => onChange({ minLevel: levelValue(event.target.value) })}
        />
        <span aria-hidden="true">–</span>
        <input
          className={`${wow.field} ${styles.level}`}
          inputMode="numeric"
          aria-label="Highest required level"
          placeholder="60"
          value={filters.maxLevel ?? ""}
          onChange={(event) => onChange({ maxLevel: levelValue(event.target.value) })}
        />
      </span>
      <select
        className={wow.field}
        aria-label="Sort"
        value={filters.sort}
        onChange={(event) => onChange({ sort: event.target.value as SortMode })}
      >
        <option value="category">By type</option>
        <option value="name">By name</option>
        <option value="level">By level</option>
      </select>
      <label className={wow.checkbox}>
        <input
          type="checkbox"
          checked={filters.availableOnly}
          onChange={(event) => onChange({ availableOnly: event.target.checked })}
        />
        Available now only
      </label>
      <label className={wow.checkbox}>
        <input
          type="checkbox"
          checked={filters.tradeableOnly}
          onChange={(event) => onChange({ tradeableOnly: event.target.checked })}
        />
        Tradeable only
      </label>
      </div>
    </form>
  );
}
