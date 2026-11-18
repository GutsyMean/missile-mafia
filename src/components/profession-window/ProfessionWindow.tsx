"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  applyFilters,
  buildEntries,
  filterOptions,
  groupEntries,
  mergeUnlearned,
  resolveFilters,
  unlearnedToLoad,
} from "@/lib/craftables/filter";
import {
  DEFAULT_FILTERS,
  type CraftablesDoc,
  type Entry,
  type Filters,
  type UnlearnedDoc,
} from "@/lib/craftables/types";
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
  const narrowing = { ...filters, crafter: "", profession: "", sort: DEFAULT_FILTERS.sort };
  return serializeViewState({ filters: narrowing, recipeId: null }) !== "";
}

interface Props {
  doc: CraftablesDoc;
  /** Recipes still to learn that came with the page, by profession id. */
  initialUnlearned?: Record<number, UnlearnedDoc>;
}

export function ProfessionWindow({ doc, initialUnlearned = {} }: Props) {
  const search = useSyncExternalStore(subscribeToUrl, readUrl, readUrlOnServer);
  const { filters, recipeId } = useMemo(() => {
    const view = parseViewState(new URLSearchParams(search));
    // A link may name a crafter who has left or a profession the guild lacks; those fall back to everyone.
    return { filters: resolveFilters(doc, view.filters), recipeId: view.recipeId };
  }, [search, doc]);

  // Recipes nobody has learned yet are fetched per profession, when a view calls for them.
  const [unlearned, setUnlearned] = useState(initialUnlearned);
  const requested = useRef(new Set(Object.keys(initialUnlearned).map(Number)));
  const wanted = useMemo(() => unlearnedToLoad(doc, filters), [doc, filters]);
  useEffect(() => {
    for (const id of wanted) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      fetch(`/api/unlearned/${id}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((loaded: UnlearnedDoc) => setUnlearned((current) => ({ ...current, [id]: loaded })))
        // The list still shows what can be made; the next change of view tries again.
        .catch(() => requested.current.delete(id));
    }
  }, [wanted]);
  const loadingMore = wanted.some((id) => !(id in unlearned));

  const crafter = useMemo(() => doc.crafters.find((c) => c.slug === filters.crafter) ?? null, [doc, filters.crafter]);
  const entries = useMemo(
    () => buildEntries(mergeUnlearned(doc, wanted.flatMap((id) => unlearned[id] ?? [])), crafter?.id ?? null),
    [doc, wanted, unlearned, crafter],
  );
  const options = useMemo(() => filterOptions(entries), [entries]);
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

  // The profile shown beside the filters: the chosen crafter, or the only one there is.
  const profiled = crafter ?? (doc.crafters.length === 1 ? doc.crafters[0] : null);
  const chosenProfession = doc.professions.find((p) => p.slug === filters.profession) ?? null;
  const portrait = (
    chosenProfession ??
    doc.professions.find((p) => profiled && (profiled.skills[String(p.id)] ?? 0) > 0) ??
    doc.professions[0]
  )?.iconFileId;
  const moreToLearn =
    !filters.availableOnly && wanted.length === 0 && !crafter && !chosenProfession && (doc.unlearned ?? []).length > 0;
  const title = "Missile Mafia Crafting";

  return (
    <>
      <Frame title={title} portraitFileId={portrait} className={styles.window}>
        <div className={styles.toolbar}>
          {profiled ? (
            <section className={styles.profile} aria-label={`${profiled.characterName}'s profile`}>
              <p className={styles.profileName}>{profiled.characterName}</p>
              {profiled.level || profiled.class || profiled.faction ? (
                <p className={styles.profileMeta}>
                  {[profiled.level ? `Level ${profiled.level}` : null, profiled.class, profiled.faction]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {doc.professions
                .filter((p) => (profiled.skills[String(p.id)] ?? 0) > 0)
                .map((p) => {
                  const skill = profiled.skills[String(p.id)];
                  return (
                    <div key={p.id} className={styles.skill} aria-label={`${profiled.characterName}: ${p.name} ${skill}`}>
                      <div className={styles.skillFill} style={{ width: `${Math.min(100, (skill / MAX_SKILL) * 100)}%` }} />
                      <span className={styles.skillText}>
                        {p.name} {skill}
                      </span>
                    </div>
                  );
                })}
            </section>
          ) : null}
          <FilterBar
            filters={filters}
            options={options}
            crafters={doc.crafters}
            professions={doc.professions}
            onChange={(patch) => setFilters({ ...filters, ...patch })}
          />
        </div>

        <div className={styles.body}>
          <div className={styles.listPane}>
            {entries.length === 0 ? (
              <p className={styles.empty}>
                {crafter
                  ? `${crafter.characterName} has not listed any recipes yet.`
                  : "No crafter has listed any recipes yet."}
              </p>
            ) : visible.length === 0 && chosenProfession && !isFiltered(filters) ? (
              // The choice of crafter and profession has nothing in it; say so rather than show something else.
              <div className={styles.empty}>
                <p>
                  {crafter
                    ? `${crafter.characterName} has no ${chosenProfession.name} recipes.`
                    : `Nobody has listed ${chosenProfession.name} recipes yet.`}
                </p>
                <button type="button" className={wow.button} onClick={() => setFilters({ ...filters, profession: "" })}>
                  All professions
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className={styles.empty}>
                <p>Nothing matches these filters.</p>
                <button
                  type="button"
                  className={wow.button}
                  onClick={() => setFilters({ ...DEFAULT_FILTERS, crafter: filters.crafter, profession: filters.profession })}
                >
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
            {loadingMore ? " · loading what is still to learn…" : ""}
            {moreToLearn ? " · choose a crafter or a profession to also see what is still to learn" : ""}
          </span>
          {isFiltered(filters) ? (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() =>
                // Who and which profession is being looked at is a choice of view, not a filter to clear.
                setFilters({ ...DEFAULT_FILTERS, crafter: filters.crafter, profession: filters.profession, sort: filters.sort })
              }
            >
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
