"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  checkForGameUpdates,
  correctQuestFaction,
  correctUnlockLevel,
  importGuildon,
  saveProfile,
  saveRecipes,
  signUpCrafter,
  type SignUpResult,
  type SyncSummary,
} from "@/app/admin/actions";
import { signOut } from "@/app/login/actions";
import type { AdminCrafter, AdminData, SyncRunView } from "@/lib/admin/load";
import type { AdminCatalog, AdminDirectory, AdminSettings, QuestFactionChoice } from "@/lib/admin/types";
import {
  matchGuildonExport,
  parseGuildonExport,
  planImport,
  sameCharacter,
  type GuildonErrorReason,
} from "@/lib/guildon";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import { listNames } from "@/lib/admin/directory";
import { CraftersPanel } from "./CraftersPanel";
import { GuildImportPanel } from "./GuildImportPanel";
import { SaveQueue } from "@/lib/admin/save-queue";
import { EMPTY_PROFILE, ProfileForm } from "./ProfileForm";
import { heldNotice } from "./SignupForm";
import { RecipeChecklist } from "./RecipeChecklist";
import styles from "./admin.module.css";

type Tab = "recipes" | "import" | "profile" | "add" | "crafters" | "guild" | "data";

const IMPORT_ERRORS: Record<GuildonErrorReason, string> = {
  format: "is not an export line. Copy the whole text from /gnc export.",
  checksum: "was cut off or changed while copying. Copy it again.",
  version: "comes from a newer version of the addon than this site understands.",
  wrong_game: "is from Classic Era, not WoW Forever.",
};

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** How a crafter's stored profile fills the form. */
function profileOf(crafter: AdminCrafter) {
  return {
    characterName: crafter.characterName,
    realm: crafter.realm ?? "",
    faction: crafter.faction ?? "",
    className: crafter.className ?? "",
    level: crafter.level ? String(crafter.level) : "",
    note: crafter.note ?? "",
    skills: Object.fromEntries(Object.entries(crafter.skills).map(([id, skill]) => [id, String(skill)])),
  };
}

interface Props {
  data: AdminData;
  /** True straight after adding a character: opens on the recipe import, the second step. */
  welcome?: boolean;
  /** The character to open on, when the account has several. */
  initialCrafterId?: string;
}

export function AdminPanel({ data, welcome = false, initialCrafterId }: Props) {
  const router = useRouter();
  // One login can hold several characters; the page works on one at a time.
  const [activeId, setActiveId] = useState(
    () => (data.crafters.find((c) => c.id === initialCrafterId) ?? data.crafters[0])?.id ?? null,
  );
  // A site admin need not be a crafter; they then see only the admin tabs.
  const crafter = data.crafters.find((c) => c.id === activeId) ?? data.crafters[0] ?? null;
  const [tab, setTab] = useState<Tab>(crafter ? (welcome ? "import" : "recipes") : "crafters");
  const [settings, setSettings] = useState<AdminSettings | null>(data.settings);
  // Each character's ticks, kept while switching between them.
  const [tickedByCrafter, setTickedByCrafter] = useState<Record<string, Set<number>>>(() =>
    Object.fromEntries(data.crafters.map((c) => [c.id, new Set(c.recipeIds)])),
  );
  const ticked = useMemo(
    () => (crafter ? (tickedByCrafter[crafter.id] ?? new Set(crafter.recipeIds)) : new Set<number>()),
    [crafter, tickedByCrafter],
  );
  // Ticks are saved in the background, one queue per character, so ticking never waits for the server.
  const queues = useRef(new Map<string, SaveQueue<"manual" | "bulk">>());
  const [saving, setSaving] = useState(false);
  const queueFor = (owner: AdminCrafter) => {
    let queue = queues.current.get(owner.id);
    if (!queue) {
      queue = new SaveQueue<"manual" | "bulk">({
        initial: owner.recipeIds,
        save: async (add, remove, source) => {
          const result = await saveRecipes(owner.id, add, remove, source);
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        },
        onChange: (view) => setTickedByCrafter((current) => ({ ...current, [owner.id]: view })),
        onError: (error, undone) =>
          setMessage({
            kind: "error",
            text: `Not saved: ${error} ${undone.length === 1 ? "That change was" : `Those ${undone.length} changes were`} undone.`,
          }),
        onBusy: () => setSaving([...queues.current.values()].some((entry) => entry.unsaved)),
      });
      queues.current.set(owner.id, queue);
    }
    return queue;
  };
  /** The server says the list is now exactly this (after an import or a new skill). */
  const setTicked = (next: Set<number>) => {
    if (crafter) queueFor(crafter).reset(next);
  };

  // Closing the tab in the instant before a tick is sent would lose it; the browser asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ([...queues.current.values()].some((entry) => entry.unsaved)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // Members Discord confirmed, and admins, can add characters themselves.
  const canAddCharacter = data.isAdmin || (data.signup.open && data.signup.verified);
  const [catalog, setCatalog] = useState<AdminCatalog>(data.catalog);
  const [directory, setDirectory] = useState<AdminDirectory | null>(data.directory);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  /** A character just asked for that turned out to be listed already. */
  const [held, setHeld] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeRecipes = (add: number[], remove: number[], source: "manual" | "bulk") => {
    if (!crafter) return;
    // Shown at once and saved in the background; only a failed save is undone.
    setMessage(source === "bulk" ? { kind: "ok", text: `Added ${add.length} recipes to your list.` } : null);
    queueFor(crafter).change(add, remove, source);
  };

  const correct = (recipeId: number, level: number | null) => {
    const before = catalog.recipes.find((recipe) => recipe.id === recipeId);
    if (!before) return;
    const show = (patch: Pick<typeof before, "learnSkill" | "learnStatus">) =>
      setCatalog((current) => ({
        ...current,
        recipes: current.recipes.map((recipe) => (recipe.id === recipeId ? { ...recipe, ...patch } : recipe)),
      }));
    // Shown at once; put back if the save fails.
    show(level === null ? { learnSkill: null, learnStatus: "unconfirmed" } : { learnSkill: level, learnStatus: "owner" });
    setMessage({ kind: "ok", text: level === null ? "Correction removed." : `Unlock level set to ${level}.` });
    startTransition(async () => {
      const result = await correctUnlockLevel(recipeId, level);
      if (!result.ok) {
        show({ learnSkill: before.learnSkill, learnStatus: before.learnStatus });
        setMessage({ kind: "error", text: `Not saved: ${result.error} The level was put back.` });
      }
    });
  };

  const correctFaction = (recipeId: number, faction: QuestFactionChoice | null) => {
    const before = catalog.recipes.find((recipe) => recipe.id === recipeId);
    if (!before) return;
    const show = (questFactionOwner: QuestFactionChoice | null) =>
      setCatalog((current) => ({
        ...current,
        recipes: current.recipes.map((recipe) => (recipe.id === recipeId ? { ...recipe, questFactionOwner } : recipe)),
      }));
    // Shown at once; put back if the save fails.
    show(faction);
    setMessage({
      kind: "ok",
      text: faction === null ? "Left to the wiki again." : `Saved for ${before.name}.`,
    });
    startTransition(async () => {
      const result = await correctQuestFaction(recipeId, faction);
      if (!result.ok) {
        show(before.questFactionOwner);
        setMessage({ kind: "error", text: `Not saved: ${result.error} The choice was put back.` });
      }
    });
  };

  const tabs: [Tab, string][] = [
    ...(crafter
      ? ([
          ["recipes", "My recipes"],
          ["import", "Import from addon"],
          ["profile", "Profile"],
        ] as [Tab, string][])
      : []),
    ...(canAddCharacter ? ([["add", "Add character"]] as [Tab, string][]) : []),
    ...(data.isAdmin
      ? ([
          ["crafters", "Crafters"],
          ["guild", "Import guild"],
          ["data", "Game data"],
        ] as [Tab, string][])
      : []),
  ];

  return (
    <Frame
      title={crafter ? `${crafter.characterName}'s Recipes` : "Site admin"}
      portraitFileId={
        (catalog.professions.find((p) => crafter?.skills[String(p.id)] !== undefined) ?? catalog.professions[0])
          ?.iconFileId
      }
      className={styles.window}
    >
      <div className={styles.topbar}>
        {data.crafters.length > 1 && crafter ? (
          <label className={styles.inlineLabel}>
            Character
            <select
              className={`${wow.field} ${styles.wideSelect}`}
              value={crafter.id}
              onChange={(event) => {
                setActiveId(event.target.value);
                setMessage(null);
                if (tab === "add") setTab("recipes");
              }}
            >
              {data.crafters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.characterName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <nav className={styles.tabs} aria-label="Sections">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={styles.tab}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setMessage(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.account}>
          <Link href="/crafting" className={styles.linkButton}>
            View the crafting list
          </Link>
          <form action={signOut}>
            <button type="submit" className={styles.linkButton}>
              Sign out{data.accountName ? ` (${data.accountName})` : ""}
            </button>
          </form>
        </div>
      </div>

      <div className={styles.status} role="status" data-kind={message?.kind}>
        {message?.text ?? (saving || pending ? "Saving…" : "")}
      </div>
      {welcome && crafter && tab === "import" && ticked.size === 0 ? (
        <p className={styles.welcome}>
          <strong>{crafter.characterName} is set up. Step 2 of 2: this character&apos;s recipes.</strong> Paste an
          export from the addon below to add everything it has learned at once, or open <em>My recipes</em> and tick
          them by hand. The profile is already on the crafting list.
        </p>
      ) : null}

      <div className={styles.pane}>
        {tab === "recipes" && crafter ? (
          <RecipeChecklist
            key={crafter.id}
            catalog={catalog}
            ticked={ticked}
            skills={crafter.skills}
            isAdmin={data.isAdmin}
            onChange={changeRecipes}
            onCorrect={correct}
            onCorrectFaction={correctFaction}
          />
        ) : null}
        {tab === "import" && crafter ? (
          <GuildonImport
            key={crafter.id}
            catalog={catalog}
            crafterId={crafter.id}
            crafterName={crafter.characterName}
            skills={crafter.skills}
            ticked={ticked}
            onImported={(ids, text) => {
              setTicked(new Set(ids));
              setMessage({ kind: "ok", text });
              setTab("recipes");
              router.refresh(); // the skills the export brought show on the profile
            }}
          />
        ) : null}
        {tab === "profile" && crafter ? (
          <ProfileForm
            key={crafter.id}
            heading={`How guild members find ${crafter.characterName}`}
            initial={profileOf(crafter)}
            professions={catalog.professions}
            submitLabel="Save profile"
            onSubmit={(input) => saveProfile(crafter.id, input)}
            onSaved={(result) => {
              // A higher skill brings its trainer recipes with it.
              const { recipeIds } = result as { recipeIds: number[] };
              const unlocked = recipeIds.filter((id) => !ticked.has(id)).length;
              setTicked(new Set(recipeIds));
              setMessage({
                kind: "ok",
                text:
                  unlocked > 0
                    ? `Profile saved. ${unlocked} trainer ${unlocked === 1 ? "recipe" : "recipes"} for your skill ${unlocked === 1 ? "was" : "were"} added to your list.`
                    : "Profile saved.",
              });
              router.refresh(); // the name and skill shown elsewhere on the page follow
            }}
          />
        ) : null}
        {tab === "add" && canAddCharacter && data.waitingFor.length > 0 ? (
          <p className={styles.welcome}>
            <strong>
              {listNames(data.waitingFor)} {data.waitingFor.length === 1 ? "is" : "are"} already on the crafting list.
            </strong>{" "}
            A site admin will hand {data.waitingFor.length === 1 ? "it" : "them"} over to you; nothing more is needed
            from you.
          </p>
        ) : null}
        {tab === "add" && canAddCharacter ? (
          <ProfileForm
            heading="Add another character"
            lead="Each character is listed on its own, with its own professions and recipes. Use this for an alt with different professions."
            initial={EMPTY_PROFILE}
            professions={catalog.professions}
            submitLabel="Add character"
            onSubmit={signUpCrafter}
            notice={held ? heldNotice(held) : null}
            onSaved={(result) => {
              const outcome = result as SignUpResult;
              if ("held" in outcome) {
                // Nothing was created: the character is listed already and is being kept for them.
                setHeld(outcome.held);
                router.refresh();
                return;
              }
              // Reload on the new character, at the recipe import.
              router.replace(`/admin?character=${outcome.crafterId}&welcome=1`);
              router.refresh();
            }}
          />
        ) : null}
        {tab === "crafters" && directory ? (
          <CraftersPanel
            directory={directory}
            settings={settings}
            serverReady={data.syncConfigured}
            ownUserId={data.userId}
            onChange={(next) =>
              setDirectory((current) => (typeof next === "function" ? (current ? next(current) : current) : next))
            }
            onSettingsChange={setSettings}
          />
        ) : null}
        {tab === "guild" && directory ? (
          <GuildImportPanel
            catalog={catalog}
            directory={directory}
            onImported={(result) => {
              setDirectory(result.directory);
              // The admin's own characters may be among those imported: their lists follow.
              for (const [id, recipeIds] of Object.entries(result.ownRecipes)) {
                const own = data.crafters.find((c) => c.id === id);
                if (own) queueFor(own).reset(new Set(recipeIds));
              }
              router.refresh(); // skills the file raised show on the profile
            }}
          />
        ) : null}
        {tab === "data" ? <GameDataPanel runs={data.runs} configured={data.syncConfigured} /> : null}
      </div>
    </Frame>
  );
}

function GuildonImport({
  catalog,
  crafterId,
  crafterName,
  skills,
  ticked,
  onImported,
}: {
  catalog: AdminCatalog;
  crafterId: string;
  /** The character these recipes will be added to. */
  crafterName: string;
  /** That character's skills now, by profession id. */
  skills: Record<string, number>;
  ticked: Set<number>;
  onImported: (recipeIds: number[], message: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const known = useMemo(() => new Map(catalog.recipes.map((r) => [r.id, r.professionId])), [catalog.recipes]);
  const parsed = useMemo(() => parseGuildonExport(text), [text]);

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Import the recipes you have learned</h2>
      <ol className={styles.steps}>
        <li>
          In game, with the <em>Guildon: Crafts &amp; Recipes</em> addon installed, open the window of each profession
          you want to import. The addon records a profession&apos;s recipes when its window is open; until then it
          only knows your skill.
        </li>
        <li>
          Type <code>/gnc export</code>, press Ctrl+C to copy the text, and paste it below.
        </li>
      </ol>
      <textarea
        className={styles.textarea}
        aria-label="Export text"
        placeholder="GNX1;F;…"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        rows={5}
        spellCheck={false}
      />
      {parsed.errors.map((problem) => (
        <p key={problem.line} className={styles.error}>
          Line {problem.line} {IMPORT_ERRORS[problem.reason]}
        </p>
      ))}
      {error ? <p className={styles.error}>{error}</p> : null}

      {parsed.characters.map((character) => {
        const match = matchGuildonExport(character, catalog.professions, known);
        const plan = planImport(match, ticked, skills);
        return (
          <section key={character.name} className={styles.character} aria-label={character.name}>
            <h3 className={styles.subheading}>
              {character.name}, level {character.level}
            </h3>
            {match.skills.length === 0 ? (
              <p className={styles.muted}>This character has no crafting professions in the export.</p>
            ) : (
              <ul className={styles.plain}>
                {match.skills.map((skill) => (
                  <li key={skill.professionId}>
                    {skill.name} {skill.skill}: {skill.recipes} recipes
                  </li>
                ))}
              </ul>
            )}
            {!sameCharacter(character.name, crafterName) ? (
              <p className={styles.muted}>
                This export is from {character.name}, and you are editing {crafterName}. Its recipes will be added
                to {crafterName}; switch character first if that is not what you want.
              </p>
            ) : null}
            {plan.noRecipesRecorded ? (
              <p className={styles.error}>
                This export lists {character.name}&apos;s professions but not a single recipe, so there are none to
                add. The addon has not read the profession windows yet: in game, open each profession window, then
                type <code>/gnc export</code> again and paste the new text here.
              </p>
            ) : null}
            {plan.action === "skills" ? (
              <p className={styles.muted}>
                You can still take the skills from it (
                {plan.skillChanges.map((change) => `${change.name} ${change.to}`).join(", ")}). Trainer recipes for
                those skills are then added automatically.
              </p>
            ) : null}
            {match.unknownSpellIds.length > 0 ? (
              <p className={styles.muted}>
                {match.unknownSpellIds.length} entries are not recipes this site lists and will be skipped.
              </p>
            ) : null}
            <button
              type="button"
              className={wow.button}
              disabled={pending || plan.action === "nothing"}
              onClick={() =>
                startTransition(async () => {
                  const result = await importGuildon(crafterId, text, character.name);
                  if (!result.ok) setError(result.error);
                  else {
                    // The list as the server now has it: the import plus the trainer recipes its skills bring.
                    const gained = result.data.recipeIds.filter((id) => !ticked.has(id)).length;
                    const what = [
                      plan.skillChanges.length > 0 ? "skills updated" : null,
                      `${gained} ${gained === 1 ? "recipe" : "recipes"} added`,
                    ].filter(Boolean);
                    onImported(result.data.recipeIds, `Imported ${character.name}: ${what.join(", ")}.`);
                  }
                })
              }
            >
              {plan.action === "recipes"
                ? `Add ${plan.newRecipeIds.length} ${plan.newRecipeIds.length === 1 ? "recipe" : "recipes"}`
                : plan.action === "skills"
                  ? "Update skills"
                  : "Nothing new to add"}
            </button>
          </section>
        );
      })}
      <p className={styles.muted}>
        Importing only adds. Recipes you ticked by hand, such as ones you can afford but have not trained yet, stay
        on your list.
      </p>
    </div>
  );
}

function GameDataPanel({ runs, configured }: { runs: SyncRunView[]; configured: boolean }) {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = runs.find((run) => run.status === "ok");

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Game data</h2>
      <p className={styles.lead}>
        Recipes, items and unlock levels are read from the game&apos;s own data once a day. Use the button if a patch
        has just landed and you do not want to wait.
      </p>
      <p>
        {latest
          ? `Current data: build ${latest.build}, updated ${when(latest.finishedAt)}.`
          : "No game data has been loaded yet."}
      </p>
      {!configured ? (
        <p className={styles.error}>
          Updates cannot run yet: the site&apos;s server is missing its Supabase secret key (SUPABASE_SECRET_KEY in the
          Vercel project settings).
        </p>
      ) : null}
      <div>
        <button
          type="button"
          className={wow.button}
          disabled={pending || !configured}
          onClick={() => {
            setError(null);
            setSummary(null);
            startTransition(async () => {
              const result = await checkForGameUpdates();
              if (result.ok) setSummary(result.data);
              else setError(result.error);
            });
          }}
        >
          {pending ? "Checking… this takes about a minute" : "Check for game updates"}
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {summary ? (
        summary.status === "ok" ? (
          <p className={styles.ok} role="status">
            Up to date with build {summary.build}. {summary.newRecipes} new recipes, {summary.changedRecipes} changed
            recipes, {summary.changedItems} changed items, {summary.removedRecipes} retired.
            {summary.newRecipes > 0 ? " Reload this page to see the new ones marked New." : ""}
          </p>
        ) : (
          <p className={styles.error} role="status">
            The update did not finish, so nothing was changed: {summary.error}
          </p>
        )
      ) : null}
      {summary && summary.warnings.length > 0 ? (
        <ul className={styles.plain}>
          {summary.warnings.map((warning) => (
            <li key={warning} className={styles.muted}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className={styles.subheading}>Recent updates</h3>
      {runs.length === 0 ? (
        <p className={styles.muted}>None yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Started by</th>
              <th>Result</th>
              <th>Build</th>
              <th>New</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{when(run.startedAt)}</td>
                <td>{run.trigger === "cron" ? "Daily schedule" : run.trigger === "manual" ? "Button" : "Setup"}</td>
                <td data-status={run.status}>
                  {run.status === "ok" ? "Updated" : run.status === "failed" ? `Failed: ${run.error ?? "unknown"}` : "Running"}
                </td>
                <td>{run.build ?? ""}</td>
                <td>{run.stats.newRecipes ?? 0}</td>
                <td>{Math.max(0, (run.stats.recipesWritten ?? 0) - (run.stats.newRecipes ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
