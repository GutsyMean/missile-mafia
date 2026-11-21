"use client";

import { useMemo, useState } from "react";
import { planBulkSelect, type BulkSelectPlan } from "@/lib/admin/bulk-select";
import { hasQuestSource, questFactionChoices, shownQuestFaction } from "@/lib/admin/quest-faction";
import type { AdminCatalog, CatalogRecipe, QuestFactionChoice } from "@/lib/admin/types";
import { ItemIcon } from "@/components/wow/ItemIcon";
import { SourceText } from "@/components/wow/SourceText";
import wow from "@/components/wow/wow.module.css";
import styles from "./admin.module.css";

type Show = "all" | "ticked" | "unticked" | "new";

interface Props {
  catalog: AdminCatalog;
  ticked: Set<number>;
  /** The crafter's skill per profession id, used to prefill the bulk box. */
  skills: Record<string, number>;
  isAdmin: boolean;
  onChange: (add: number[], remove: number[], source: "manual" | "bulk") => void;
  onCorrect: (recipeId: number, level: number | null) => void;
  /** An admin says which faction can do the recipe's quest; null leaves it to the wiki. */
  onCorrectFaction: (recipeId: number, faction: QuestFactionChoice | null) => void;
}

/** The unlock level as text. Unsettled levels say so instead of showing a guess. */
function unlockLabel(recipe: CatalogRecipe): { text: string; settled: boolean } {
  const { wowForever, wiki, recipeItem } = recipe.learnCandidates;
  switch (recipe.learnStatus) {
    case "confirmed":
      return { text: String(recipe.learnSkill), settled: true };
    case "owner":
      return { text: `${recipe.learnSkill} (set here)`, settled: true };
    case "single_source":
      return { text: `${recipe.learnSkill}, one source`, settled: false };
    case "disputed": {
      const values = [...new Set([wowForever, wiki, recipeItem].filter((v) => typeof v === "number"))];
      return {
        text:
          values.length > 1
            ? `Sources disagree: ${values.join(" or ")}`
            : `Sources say ${values[0]}, which the game data rules out`,
        settled: false,
      };
    }
    default:
      return { text: "Not known", settled: false };
  }
}

export function RecipeChecklist({ catalog, ticked, skills, isAdmin, onChange, onCorrect, onCorrectFaction }: Props) {
  const defaultProfession =
    catalog.professions.find((p) => skills[String(p.id)] !== undefined)?.id ?? catalog.professions[0]?.id ?? 0;
  const [professionId, setProfessionId] = useState(defaultProfession);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [bulkSkill, setBulkSkill] = useState(String(skills[String(defaultProfession)] ?? ""));
  const [plan, setPlan] = useState<(BulkSelectPlan & { chosen: Set<number> }) | null>(null);
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);

  const byId = useMemo(() => new Map(catalog.recipes.map((r) => [r.id, r])), [catalog.recipes]);
  const hasNew = catalog.latestRunId !== null && catalog.latestRunId !== catalog.firstRunId;
  const isNew = (recipe: CatalogRecipe) => hasNew && recipe.firstSeenRunId === catalog.latestRunId;

  const rows = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.recipes.filter((recipe) => {
      if (recipe.professionId !== professionId) return false;
      if (show === "ticked" && !ticked.has(recipe.id)) return false;
      if (show === "unticked" && ticked.has(recipe.id)) return false;
      if (show === "new" && !(hasNew && recipe.firstSeenRunId === catalog.latestRunId)) return false;
      const name = recipe.name.toLowerCase();
      return words.every((word) => name.includes(word));
    });
  }, [catalog, professionId, search, show, ticked, hasNew]);

  const tickedHere = catalog.recipes.filter((r) => r.professionId === professionId && ticked.has(r.id)).length;
  const newCount = catalog.recipes.filter((r) => r.professionId === professionId && isNew(r)).length;

  const preview = () => {
    const skill = Number(bulkSkill);
    if (!Number.isInteger(skill) || skill < 1) return;
    const result = planBulkSelect(catalog.recipes, professionId, skill);
    // Recipes needing a decision start unticked unless already on the list.
    setPlan({ ...result, chosen: new Set(result.check.filter((id) => ticked.has(id))) });
  };

  const applyPlan = () => {
    if (!plan) return;
    const add = [...plan.sure, ...plan.chosen].filter((id) => !ticked.has(id));
    onChange(add, [], "bulk");
    setPlan(null);
  };

  return (
    <div className={styles.checklist}>
      <div className={styles.controls}>
        <select
          className={wow.field}
          aria-label="Profession"
          value={professionId}
          onChange={(event) => {
            const id = Number(event.target.value);
            setProfessionId(id);
            setBulkSkill(String(skills[String(id)] ?? ""));
            setPlan(null);
          }}
        >
          {catalog.professions.map((profession) => (
            <option key={profession.id} value={profession.id}>
              {profession.name}
            </option>
          ))}
        </select>
        <input autoComplete="off"
          className={`${wow.field} ${styles.grow}`}
          type="search"
          aria-label="Search recipes"
          placeholder="Search recipes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className={wow.field} aria-label="Show" value={show} onChange={(event) => setShow(event.target.value as Show)}>
          <option value="all">All recipes</option>
          <option value="ticked">On my list</option>
          <option value="unticked">Not on my list</option>
          {hasNew ? <option value="new">New since last update</option> : null}
        </select>
      </div>

      <p className={styles.muted}>
        Trainer recipes are added by themselves when the skill on your Profile tab reaches their level. Anything you
        untick stays off. Plans from vendors, drops and quests are yours to tick.
      </p>
      <div className={styles.bulk}>
        <label className={styles.bulkLabel}>
          Tick every trainer recipe up to skill
          <input autoComplete="off"
            className={`${wow.field} ${styles.skillInput}`}
            inputMode="numeric"
            aria-label="Skill"
            value={bulkSkill}
            onChange={(event) => setBulkSkill(event.target.value)}
          />
        </label>
        <button type="button" className={wow.button} onClick={preview} disabled={bulkSkill.trim() === ""}>
          Preview
        </button>
        <span className={styles.muted}>
          {tickedHere} on your list{newCount > 0 ? `, ${newCount} new since the last update` : ""}
        </span>
      </div>

      {plan ? (
        <section className={styles.plan} aria-label="Bulk tick preview">
          <p>
            <strong>{plan.sure.length}</strong> trainer recipes have a confirmed unlock level within your skill and
            will be ticked ({plan.sure.filter((id) => !ticked.has(id)).length} are not on your list yet).
          </p>
          {plan.check.length > 0 ? (
            <>
              <p>
                <strong>{plan.check.length}</strong> more might apply, but their unlock level is not confirmed. Tick
                the ones your trainer offers:
              </p>
              <ul className={styles.planList}>
                {plan.check.map((id) => {
                  const recipe = byId.get(id)!;
                  return (
                    <li key={id}>
                      <label className={wow.checkbox}>
                        <input
                          type="checkbox"
                          checked={plan.chosen.has(id)}
                          onChange={(event) => {
                            const chosen = new Set(plan.chosen);
                            if (event.target.checked) chosen.add(id);
                            else chosen.delete(id);
                            setPlan({ ...plan, chosen });
                          }}
                        />
                        <span className={styles.planName}>{recipe.name}</span>
                        <span className={styles.muted}>{unlockLabel(recipe).text}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          <div className={styles.planActions}>
            <button type="button" className={wow.button} onClick={applyPlan}>
              Tick these
            </button>
            <button type="button" className={styles.linkButton} onClick={() => setPlan(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <ul className={styles.recipes}>
        {rows.map((recipe) => {
          const unlock = unlockLabel(recipe);
          const checked = ticked.has(recipe.id);
          return (
            <li key={recipe.id} className={styles.recipe} data-ticked={checked}>
              <label className={`${wow.checkbox} ${styles.recipeMain}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    event.target.checked ? onChange([recipe.id], [], "manual") : onChange([], [recipe.id], "manual")
                  }
                />
                <ItemIcon fileId={recipe.iconFileId} quality={recipe.quality} size={30} />
                <span className={styles.recipeText}>
                  <span className={styles.recipeName} data-quality={recipe.quality}>
                    {recipe.name}
                  </span>
                  <span className={styles.recipeSub}>
                    <SourceText recipe={{ ...recipe, questFaction: shownQuestFaction(recipe) }} />
                  </span>
                </span>
              </label>
              <span className={styles.badges}>
                {isNew(recipe) ? <span className={styles.newBadge}>New</span> : null}
                {!recipe.tradeable ? <span className={styles.soulbound}>Soulbound</span> : null}
              </span>
              <span className={styles.unlock} data-settled={unlock.settled}>
                <span className={styles.unlockLabel}>Unlocks at</span> {unlock.text}
                {isAdmin ? (
                  editing?.id === recipe.id ? (
                    <span className={styles.edit}>
                      <input autoComplete="off"
                        className={`${wow.field} ${styles.skillInput}`}
                        inputMode="numeric"
                        aria-label={`Unlock level for ${recipe.name}`}
                        value={editing.value}
                        onChange={(event) => setEditing({ id: recipe.id, value: event.target.value })}
                      />
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                          const level = editing.value.trim() === "" ? null : Number(editing.value);
                          if (level === null || (Number.isInteger(level) && level >= 1 && level <= 450)) {
                            onCorrect(recipe.id, level);
                            setEditing(null);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className={styles.linkButton} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() =>
                        setEditing({ id: recipe.id, value: recipe.learnStatus === "owner" ? String(recipe.learnSkill) : "" })
                      }
                    >
                      {recipe.learnStatus === "owner" ? "Change" : "Correct"}
                    </button>
                  )
                ) : null}
              </span>
              {isAdmin && hasQuestSource(recipe) ? (
                <label className={styles.factionPick}>
                  <span className={styles.unlockLabel}>Quest open to</span>
                  <select
                    className={`${wow.field} ${styles.factionSelect}`}
                    aria-label={`Who can do the quest for ${recipe.name}`}
                    value={recipe.questFactionOwner ?? ""}
                    onChange={(event) =>
                      onCorrectFaction(recipe.id, (event.target.value || null) as QuestFactionChoice | null)
                    }
                  >
                    {questFactionChoices(recipe).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rows.length === 0 ? <p className={styles.emptyList}>No recipes match.</p> : null}
    </div>
  );
}
