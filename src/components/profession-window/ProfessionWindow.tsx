"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { applyFilters, buildEntries, filterOptions, groupEntries } from "@/lib/craftables/filter";
import { DEFAULT_FILTERS, type CraftablesDoc, type Entry, type Filters } from "@/lib/craftables/types";
import { parseViewState, serializeViewState, type ViewState } from "@/lib/craftables/url-state";
import { Frame } from "@/components/wow/Frame";
import { ItemTooltip } from "@/components/wow/ItemTooltip";
import wow from "@/components/wow/wow.module.css";
import { DetailPane } from "./DetailPane";
import { FilterBar } from "./FilterBar";
import { RecipeList } from "./RecipeList";
import styles from "./window.module.css";

/** Below this width the detail pane becomes a full-screen sheet. Matches the CSS. */
const SHEET_QUERY = "(max-width: 820px)";
const MAX_SKILL = 300;

interface Hover {
  entry: Entry;
  rect: DOMRect;
}

/*
 * The address bar is the single source of truth for the filters and the open
 * recipe, so any view can be copied as a link. The component subscribes to it
 * like any other external store.
 */
const URL_CHANGED = "craftables:url";

function subscribeToUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_CHANGED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_CHANGED, onChange);
  };
}

const readUrl = () => window.location.search;
const readUrlOnServer = () => "";

function writeView(view: ViewState, history: "replace" | "push" = "replace") {
  const query = serializeViewState(view);
  const url = query ? `?${query}` : window.location.pathname;
  if (history === "push") window.history.pushState({ sheet: true }, "", url);
  else window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(URL_CHANGED));
}

function isFiltered(filters: Filters): boolean {
  return serializeViewState({ filters: { ...filters, sort: DEFAULT_FILTERS.sort }, recipeId: null }) !== "";
}

export function ProfessionWindow({ doc }: { doc: CraftablesDoc }) {
  const entries = useMemo(() => buildEntries(doc), [doc]);
  const options = useMemo(() => filterOptions(entries), [entries]);

  const search = useSyncExternalStore(subscribeToUrl, readUrl, readUrlOnServer);
  const { filters, recipeId } = useMemo(() => parseViewState(new URLSearchParams(search)), [search]);
  const [hover, setHover] = useState<Hover | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const groups = useMemo(() => groupEntries(visible, filters.sort), [visible, filters.sort]);
  const notYet = useMemo(() => visible.filter((entry) => !entry.available).length, [visible]);
  const selected = useMemo(
    () => entries.find((entry) => entry.recipe.id === recipeId) ?? null,
    [entries, recipeId],
  );
  // On a wide screen the pane always shows something, as the in-game window does.
  const shown = selected ?? visible[0] ?? null;

  const setFilters = useCallback(
    (next: Filters) => writeView({ filters: next, recipeId }),
    [recipeId],
  );

  const select = useCallback(
    (entry: Entry) => {
      setHover(null);
      const view = { filters, recipeId: entry.recipe.id };
      const dialog = sheet.current;
      if (window.matchMedia(SHEET_QUERY).matches && dialog && !dialog.open) {
        // A history entry of its own, so the Back button closes the sheet.
        writeView(view, "push");
        dialog.showModal();
      } else {
        writeView(view);
      }
    },
    [filters],
  );

  // A link that names a recipe opens it: as the sheet on a phone, scrolled into view otherwise.
  useEffect(() => {
    const linked = parseViewState(new URLSearchParams(window.location.search)).recipeId;
    if (linked === null) return;
    if (window.matchMedia(SHEET_QUERY).matches) sheet.current?.showModal();
    else document.querySelector(`[data-recipe="${linked}"]`)?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    const dialog = sheet.current;
    if (!dialog) return;
    const onClose = () => {
      if (window.history.state?.sheet) {
        window.history.back(); // drop the entry that opening the sheet added
      } else {
        const current = parseViewState(new URLSearchParams(window.location.search));
        writeView({ ...current, recipeId: null });
      }
    };
    const onPopState = () => {
      if (dialog.open) dialog.close();
    };
    dialog.addEventListener("close", onClose);
    window.addEventListener("popstate", onPopState);
    return () => {
      dialog.removeEventListener("close", onClose);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const onHover = useCallback((entry: Entry | null, element: HTMLElement | null) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (entry && element) {
      setHover({ entry, rect: element.getBoundingClientRect() });
    } else {
      // A short grace period lets the pointer travel onto the tooltip itself.
      hideTimer.current = setTimeout(() => setHover(null), 90);
    }
  }, []);

  useEffect(() => {
    if (!hover) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHover(null);
    };
    const onScroll = () => setHover(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [hover]);

  // Anchor interest-style tooltips are not yet available everywhere, so the
  // tooltip is placed beside its row here: to the right, or left if there is no room.
  useEffect(() => {
    const element = tooltip.current;
    if (!hover || !element) return;
    const gap = 10;
    const { width, height } = element.getBoundingClientRect();
    let left = hover.rect.right + gap;
    if (left + width > window.innerWidth - 8) left = Math.max(8, hover.rect.left - gap - width);
    const top = Math.min(Math.max(8, hover.rect.top), Math.max(8, window.innerHeight - height - 8));
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.visibility = "visible";
  }, [hover]);

  const profession = doc.professions[0];
  const crafter = doc.crafters[0];
  const skill = profession && crafter ? (crafter.skills[String(profession.id)] ?? 0) : 0;
  const title = "Missile Mafia Crafting";

  return (
    <>
      <Frame title={title} portraitFileId={profession?.iconFileId} className={styles.window}>
        <div className={styles.toolbar}>
          {profession && crafter ? (
            <div className={styles.skill} aria-label={`${crafter.characterName}: ${profession.name} ${skill}`}>
              <div className={styles.skillFill} style={{ width: `${Math.min(100, (skill / MAX_SKILL) * 100)}%` }} />
              <span className={styles.skillText}>
                {profession.name} {skill}
              </span>
            </div>
          ) : null}
          <FilterBar filters={filters} options={options} onChange={(patch) => setFilters({ ...filters, ...patch })} />
        </div>

        <div className={styles.body}>
          <div className={styles.listPane}>
            {entries.length === 0 ? (
              <p className={styles.empty}>No crafter has listed any recipes yet.</p>
            ) : visible.length === 0 ? (
              <div className={styles.empty}>
                <p>Nothing matches these filters.</p>
                <button type="button" className={wow.button} onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Clear filters
                </button>
              </div>
            ) : (
              <RecipeList
                groups={groups}
                selectedId={selected?.recipe.id ?? null}
                shownId={shown?.recipe.id ?? null}
                onSelect={select}
                onHover={onHover}
              />
            )}
          </div>
          <div className={styles.detailPane}>
            {shown ? <DetailPane entry={shown} /> : <p className={styles.empty}>Select an item to see what it needs.</p>}
          </div>
        </div>

        <footer className={styles.status}>
          <span>
            {visible.length === entries.length
              ? `${entries.length} recipes`
              : `${visible.length} of ${entries.length} recipes`}
            {notYet > 0 ? ` · ${notYet} not available yet` : ""}
          </span>
          {isFiltered(filters) ? (
            <button type="button" className={styles.linkButton} onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>
              Clear filters
            </button>
          ) : null}
        </footer>
      </Frame>

      <dialog ref={sheet} className={styles.sheet} aria-label="Item details">
        <div className={styles.sheetBar}>
          <button
            type="button"
            className={wow.closeButton}
            aria-label="Close"
            onClick={() => sheet.current?.close()}
          />
        </div>
        {selected ? <DetailPane entry={selected} /> : null}
      </dialog>

      {hover?.entry.item ? (
        <div
          ref={tooltip}
          className={styles.hoverTooltip}
          role="tooltip"
          onPointerEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
          onPointerLeave={() => setHover(null)}
        >
          <ItemTooltip
            lines={hover.entry.item.tooltip}
            quality={hover.entry.item.quality}
            incomplete={!hover.entry.item.tooltipComplete}
          />
        </div>
      ) : null}
    </>
  );
}
