"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  applyFilters,
  buildEntries,
  filterOptions,
  groupEntries,
  isCrafted,
  mergeGearElsewhere,
  mergeUnlearned,
  resolveFilters,
  unlearnedToLoad,
  withSourcedGear,
  type EntryGroup,
} from "@/lib/craftables/filter";
import {
  DEFAULT_FILTERS,
  type CraftablesDoc,
  type Entry,
  type Filters,
  type GearElsewhereDoc,
  type GearSourcesDoc,
  type UnlearnedDoc,
} from "@/lib/craftables/types";
import {
  NO_GEAR,
  parseViewState,
  serializeViewState,
  type GearChoice,
  type ViewState,
} from "@/lib/craftables/url-state";
import {
  readCustomOrders,
  readCustomOrdersOnServer,
  saveCustomOrder,
  subscribeToCustomOrders,
} from "@/lib/gear/custom-orders";
import { specPriority } from "@/lib/gear/priorities";
import { rankGear, showSection, type Ranked } from "@/lib/gear/rank";
import { Frame } from "@/components/wow/Frame";
import { ItemTooltip } from "@/components/wow/ItemTooltip";
import wow from "@/components/wow/wow.module.css";
import { DetailPane } from "./DetailPane";
import { FilterBar } from "./FilterBar";
import { GearBar, MAX_LEVEL } from "./GearBar";
import { RecipeList } from "./RecipeList";
import styles from "./window.module.css";

/** Below this width the detail pane becomes a full-screen sheet. Matches the CSS. */
const SHEET_QUERY = "(max-width: 820px)";
const MAX_SKILL = 300;
const NO_GEAR_ELSEWHERE: GearElsewhereDoc = { professions: [], recipes: [], items: {} };
const NO_SOURCED_GEAR: GearSourcesDoc = { items: {}, sources: {} };

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
  return serializeViewState({ filters: narrowing, recipeId: null, gear: NO_GEAR }) !== "";
}

interface Props {
  doc: CraftablesDoc;
  /** Recipes still to learn that came with the page, by profession id. */
  initialUnlearned?: Record<number, UnlearnedDoc>;
}

export function ProfessionWindow({ doc, initialUnlearned = {} }: Props) {
  const search = useSyncExternalStore(subscribeToUrl, readUrl, readUrlOnServer);
  const view = useMemo(() => parseViewState(new URLSearchParams(search)), [search]);
  const { recipeId, gear } = view;

  // Gear is being chosen once a class is named. The talent tree defaults to the class's first, the level to the highest.
  const gameClass = useMemo(
    () => doc.classes?.find((option) => option.slug === gear.classSlug) ?? null,
    [doc, gear.classSlug],
  );
  const spec = gameClass ? (gameClass.specs.find((option) => option.slug === gear.specSlug) ?? gameClass.specs[0]) : null;
  const level = Math.min(MAX_LEVEL, gear.level ?? MAX_LEVEL);

  // Then the gear of professions nobody in the guild has joins in, so that "best" looks at everything.
  const [elsewhere, setElsewhere] = useState<GearElsewhereDoc | null>(null);
  const elsewhereAsked = useRef(false);
  useEffect(() => {
    if (!gameClass || elsewhereAsked.current) return;
    elsewhereAsked.current = true;
    fetch("/api/gear")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((loaded: GearElsewhereDoc) => setElsewhere(loaded))
      .catch(() => {
        // The guild's own gear is still ranked; choosing a class again tries once more.
        elsewhereAsked.current = false;
        setElsewhere(NO_GEAR_ELSEWHERE);
      });
  }, [gameClass]);
  const withElsewhere = useMemo(
    () => (gameClass ? mergeGearElsewhere(doc, elsewhere) : doc),
    [doc, gameClass, elsewhere],
  );

  // And, when asked for, gear that is not crafted at all: dungeon drops and quest rewards, to compare with.
  const everySource = gameClass !== null && gear.everySource;
  const [sourced, setSourced] = useState<GearSourcesDoc | null>(null);
  const sourcedAsked = useRef(false);
  useEffect(() => {
    if (!everySource || sourcedAsked.current) return;
    sourcedAsked.current = true;
    fetch("/api/gear/sources")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((loaded: GearSourcesDoc) => setSourced(loaded))
      .catch(() => {
        // What is crafted is still ranked; asking again tries once more.
        sourcedAsked.current = false;
        setSourced(NO_SOURCED_GEAR);
      });
  }, [everySource]);

  // A link may name a crafter who has left or a profession the guild lacks; those fall back to everyone.
  const filters = useMemo(() => resolveFilters(withElsewhere, view.filters), [withElsewhere, view.filters]);

  // Recipes nobody has learned yet are fetched per profession, when a view calls for them.
  const [unlearned, setUnlearned] = useState(initialUnlearned);
  const requested = useRef(new Set(Object.keys(initialUnlearned).map(Number)));
  const wanted = useMemo(() => unlearnedToLoad(withElsewhere, filters), [withElsewhere, filters]);
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
  const stillLoading = wanted.filter((id) => !(id in unlearned)).length;
  const loadingElsewhere = gameClass !== null && elsewhere === null;
  const loadingSourced = everySource && sourced === null;
  const loadingMore = stillLoading > 0 || loadingElsewhere || loadingSourced;

  const crafter = useMemo(() => doc.crafters.find((c) => c.slug === filters.crafter) ?? null, [doc, filters.crafter]);
  const entries = useMemo(
    () => buildEntries(mergeUnlearned(withElsewhere, wanted.flatMap((id) => unlearned[id] ?? [])), crafter?.id ?? null),
    [withElsewhere, wanted, unlearned, crafter],
  );
  // Everything in the running: the recipes, and beside them gear that is not crafted when that is asked for.
  const candidates = useMemo(() => (everySource ? withSourcedGear(entries, sourced) : entries), [everySource, entries, sourced]);
  const options = useMemo(() => filterOptions(candidates), [candidates]);
  const [hover, setHover] = useState<Hover | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matching = useMemo(() => applyFilters(candidates, filters), [candidates, filters]);

  // The order of stats gear is ranked by: the visitor's own for this talent tree, or the default.
  const customOrders = useSyncExternalStore(subscribeToCustomOrders, readCustomOrders, readCustomOrdersOnServer);
  const tree = gameClass && spec ? `${gameClass.slug}/${spec.slug}` : "";
  const priority = gameClass && spec ? specPriority(gameClass.slug, spec.slug) : null;
  const order = customOrders[tree] ?? priority?.order ?? null;
  // A search does not change who is in the running, only which of them are shown: a piece
  // looked up by name keeps its true place in the ranking.
  const searchless = useMemo(() => ({ ...filters, search: "" }), [filters]);
  const ranking = useMemo(
    () => (gameClass ? rankGear(applyFilters(candidates, searchless), gameClass, level, order) : null),
    [candidates, searchless, gameClass, level, order],
  );
  const found = useMemo(
    () => (filters.search.trim() ? new Set(matching.map((entry) => entry.recipe.id)) : null),
    [filters.search, matching],
  );
  // Slots show their top few until opened up; choosing a slot in the filters opens it too.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const toggleSlot = useCallback(
    (slot: string) =>
      setOpened((current) => {
        const next = new Set(current);
        if (!next.delete(slot)) next.add(slot);
        return next;
      }),
    [],
  );
  const sections = useMemo(
    () =>
      ranking
        ?.map((section) => {
          const shown = showSection(section, {
            open: filters.slot !== "" || opened.has(section.slot),
            only: found ? (entry) => found.has(entry.recipe.id) : undefined,
          });
          // Nothing to open while a search or a chosen slot decides what is shown, or when the short list is all there is.
          const canOpen = !found && filters.slot === "" && showSection(section).rows.length < section.ranked.length;
          const toggle = opened.has(section.slot) ? ("close" as const) : ("open" as const);
          return { ...shown, toggle: canOpen ? toggle : undefined };
        })
        .filter((section) => section.rows.length > 0) ?? null,
    [ranking, filters.slot, opened, found],
  );
  // What a piece scores, by recipe, for the detail pane. A piece listed for two slots shows the first.
  const ranks = useMemo(() => {
    const byRecipe = new Map<number, Ranked>();
    for (const ranked of sections?.flatMap((section) => section.rows) ?? []) {
      if (!byRecipe.has(ranked.entry.recipe.id)) byRecipe.set(ranked.entry.recipe.id, ranked);
    }
    return byRecipe;
  }, [sections]);

  // What the list shows: the best pieces slot by slot when gear is being chosen, else everything that matches.
  const visible = useMemo(() => (sections ? [...ranks.values()].map((ranked) => ranked.entry) : matching), [sections, ranks, matching]);
  const groups = useMemo<EntryGroup[]>(
    () =>
      sections
        ? sections.map((section) => ({
            category: section.slot,
            entries: section.rows.map((ranked) => ranked.entry),
            ranked: true,
            notes: section.notes,
            total: section.total,
            toggle: section.toggle,
          }))
        : groupEntries(matching, filters.sort),
    [sections, matching, filters.sort],
  );
  const notYet = useMemo(() => visible.filter((entry) => !entry.available).length, [visible]);
  const notCrafted = useMemo(() => visible.filter((entry) => !isCrafted(entry)).length, [visible]);
  const selected = useMemo(
    () => candidates.find((entry) => entry.recipe.id === recipeId) ?? null,
    [candidates, recipeId],
  );
  // On a wide screen the pane always shows something, as the in-game window does.
  const shown = selected ?? visible[0] ?? null;
  const character = gameClass && spec ? `level ${level} ${spec.name} ${gameClass.name}` : null;

  const setFilters = useCallback(
    (next: Filters) => writeView({ filters: next, recipeId, gear }),
    [recipeId, gear],
  );

  const setGear = useCallback(
    (next: GearChoice) =>
      // The level range and the sort order have no say while gear is ranked, so they are let go.
      writeView({
        filters: next.classSlug ? { ...filters, minLevel: null, maxLevel: null, sort: DEFAULT_FILTERS.sort } : filters,
        recipeId: null,
        gear: next,
      }),
    [filters],
  );

  const select = useCallback(
    (entry: Entry) => {
      setHover(null);
      const view = { filters, recipeId: entry.recipe.id, gear };
      const dialog = sheet.current;
      if (window.matchMedia(SHEET_QUERY).matches && dialog && !dialog.open) {
        // A history entry of its own, so the Back button closes the sheet.
        writeView(view, "push");
        dialog.showModal();
      } else {
        writeView(view);
      }
    },
    [filters, gear],
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
  const chosenProfession = withElsewhere.professions.find((p) => p.slug === filters.profession) ?? null;
  const portrait = (
    chosenProfession ??
    doc.professions.find((p) => profiled && (profiled.skills[String(p.id)] ?? 0) > 0) ??
    doc.professions[0]
  )?.iconFileId;
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
            professions={withElsewhere.professions}
            ranking={gameClass !== null}
            onChange={(patch) => setFilters({ ...filters, ...patch })}
          />
          <GearBar
            classes={doc.classes ?? []}
            gear={gear}
            gameClass={gameClass}
            spec={spec}
            order={order}
            custom={tree in customOrders}
            guide={priority?.guide ?? null}
            onChange={setGear}
            onOrderChange={(next) => saveCustomOrder(tree, next)}
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
            ) : character && visible.length === 0 && !loadingMore ? (
              <div className={styles.empty}>
                <p>
                  Nothing {filters.availableOnly ? "the guild can craft now" : "craftable"} suits a {character}
                  {isFiltered(filters) || filters.crafter || filters.profession ? " with these filters" : ""}.
                </p>
                {isFiltered(filters) ? (
                  <button
                    type="button"
                    className={wow.button}
                    onClick={() => setFilters({ ...DEFAULT_FILTERS, crafter: filters.crafter, profession: filters.profession })}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
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
            ) : visible.length === 0 && loadingMore ? (
              // Nothing among what has arrived so far; the rest is still on its way.
              <p className={styles.empty} role="status">
                <span className={styles.spinner} aria-hidden="true" /> Looking through recipes not learned yet…
              </p>
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
                onToggleGroup={toggleSlot}
              />
            )}
          </div>
          <div className={styles.detailPane}>
            {shown ? (
              <DetailPane entry={shown} rank={ranks.get(shown.recipe.id)} character={character} />
            ) : (
              <p className={styles.empty}>Select an item to see what it needs.</p>
            )}
          </div>
        </div>

        <footer className={styles.status}>
          <span>
            {sections && character
              ? `Best for a ${character}: ${visible.length} ${visible.length === 1 ? "piece" : "pieces"} for ${sections.length} ${sections.length === 1 ? "slot" : "slots"}`
              : visible.length === entries.length
                ? `${entries.length} recipes`
                : `${visible.length} of ${entries.length} recipes`}
            {notCrafted > 0 ? ` · ${notCrafted} not crafted` : ""}
            {notYet > 0 ? ` · ${notYet} not available yet` : ""}
            {stillLoading > 0 ? (
              <span className={styles.loading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Loading recipes not learned yet
                {wanted.length > 1 ? ` (${wanted.length - stillLoading} of ${wanted.length} professions)` : ""}…
              </span>
            ) : loadingElsewhere ? (
              <span className={styles.loading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Loading gear from other professions…
              </span>
            ) : loadingSourced ? (
              <span className={styles.loading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Loading drops and quest rewards…
              </span>
            ) : null}
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
        {selected ? <DetailPane entry={selected} rank={ranks.get(selected.recipe.id)} character={character} /> : null}
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
