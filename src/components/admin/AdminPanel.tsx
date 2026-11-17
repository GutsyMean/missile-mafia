"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  checkForGameUpdates,
  correctUnlockLevel,
  importGuildon,
  saveProfile,
  saveRecipes,
  type SyncSummary,
} from "@/app/admin/actions";
import { signOut } from "@/app/login/actions";
import type { AdminCrafter, AdminData, SyncRunView } from "@/lib/admin/load";
import type { AdminCatalog, AdminDirectory } from "@/lib/admin/types";
import { matchGuildonExport, parseGuildonExport, type GuildonErrorReason } from "@/lib/guildon";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import { CraftersPanel } from "./CraftersPanel";
import { RecipeChecklist } from "./RecipeChecklist";
import styles from "./admin.module.css";

type Tab = "recipes" | "import" | "profile" | "crafters" | "data";

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

export function AdminPanel({ data }: { data: AdminData }) {
  // A site admin need not be a crafter; they then see only the admin tabs.
  const crafter = data.crafters[0] ?? null;
  const [tab, setTab] = useState<Tab>(crafter ? "recipes" : "crafters");
  const [ticked, setTicked] = useState(() => new Set(crafter?.recipeIds ?? []));
  const [catalog, setCatalog] = useState<AdminCatalog>(data.catalog);
  const [directory, setDirectory] = useState<AdminDirectory | null>(data.directory);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const changeRecipes = (add: number[], remove: number[], source: "manual" | "bulk") => {
    if (!crafter) return;
    const before = ticked;
    const next = new Set(ticked);
    for (const id of add) next.add(id);
    for (const id of remove) next.delete(id);
    setTicked(next); // show the change at once; put it back if saving fails
    setMessage(null);
    startTransition(async () => {
      const result = await saveRecipes(crafter.id, add, remove, source);
      if (!result.ok) {
        setTicked(before);
        setMessage({ kind: "error", text: `Not saved: ${result.error}` });
      } else if (source === "bulk") {
        setMessage({ kind: "ok", text: `Added ${result.data.added} recipes to your list.` });
      }
    });
  };

  const correct = (recipeId: number, level: number | null) => {
    setMessage(null);
    startTransition(async () => {
      const result = await correctUnlockLevel(recipeId, level);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setCatalog((current) => ({
        ...current,
        recipes: current.recipes.map((recipe) =>
          recipe.id !== recipeId
            ? recipe
            : level === null
              ? { ...recipe, learnSkill: null, learnStatus: "unconfirmed" }
              : { ...recipe, learnSkill: level, learnStatus: "owner" },
        ),
      }));
      setMessage({ kind: "ok", text: level === null ? "Correction removed." : `Unlock level set to ${level}.` });
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
    ...(data.isAdmin
      ? ([
          ["crafters", "Crafters"],
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
          <Link href="/" className={styles.linkButton}>
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
        {message?.text ?? (pending ? "Saving…" : "")}
      </div>

      <div className={styles.pane}>
        {tab === "recipes" && crafter ? (
          <RecipeChecklist
            catalog={catalog}
            ticked={ticked}
            skills={crafter.skills}
            isAdmin={data.isAdmin}
            busy={pending}
            onChange={changeRecipes}
            onCorrect={correct}
          />
        ) : null}
        {tab === "import" && crafter ? (
          <GuildonImport
            catalog={catalog}
            crafterId={crafter.id}
            ticked={ticked}
            onImported={(ids, text) => {
              setTicked((current) => new Set([...current, ...ids]));
              setMessage({ kind: "ok", text });
              setTab("recipes");
            }}
          />
        ) : null}
        {tab === "profile" && crafter ? (
          <ProfileForm crafter={crafter} catalog={catalog} onSaved={(text) => setMessage({ kind: "ok", text })} />
        ) : null}
        {tab === "crafters" && directory ? (
          <CraftersPanel directory={directory} ownUserId={data.userId} onChange={setDirectory} />
        ) : null}
        {tab === "data" ? <GameDataPanel runs={data.runs} configured={data.syncConfigured} /> : null}
      </div>
    </Frame>
  );
}

function GuildonImport({
  catalog,
  crafterId,
  ticked,
  onImported,
}: {
  catalog: AdminCatalog;
  crafterId: string;
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
          In game, with the <em>Guildon: Crafts &amp; Recipes</em> addon installed, open your profession window once.
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
        const fresh = match.recipeIds.filter((id) => !ticked.has(id));
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
            {match.unknownSpellIds.length > 0 ? (
              <p className={styles.muted}>
                {match.unknownSpellIds.length} entries are not recipes this site lists and will be skipped.
              </p>
            ) : null}
            <button
              type="button"
              className={wow.button}
              disabled={pending || match.recipeIds.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await importGuildon(crafterId, text, character.name);
                  if (!result.ok) setError(result.error);
                  else onImported(match.recipeIds, `Imported ${character.name}: ${result.data.added} recipes added.`);
                })
              }
            >
              {fresh.length > 0 ? `Add ${fresh.length} recipes` : "Already on your list"}
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

function ProfileForm({
  crafter,
  catalog,
  onSaved,
}: {
  crafter: AdminCrafter;
  catalog: AdminCatalog;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState({
    characterName: crafter.characterName,
    realm: crafter.realm ?? "",
    faction: crafter.faction ?? "",
    className: crafter.className ?? "",
    level: crafter.level ? String(crafter.level) : "",
    note: crafter.note ?? "",
  });
  const [skills, setSkills] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(crafter.skills).map(([id, skill]) => [id, String(skill)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      className={styles.section}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await saveProfile(crafter.id, { ...form, skills });
          if (result.ok) onSaved("Profile saved.");
          else setError(result.error);
        });
      }}
    >
      <h2 className={styles.heading}>How guild members find you</h2>
      <div className={styles.fields}>
        <label className={styles.fieldLabel}>
          Character name
          <input className={wow.field} value={form.characterName} onChange={set("characterName")} required maxLength={40} />
        </label>
        <label className={styles.fieldLabel}>
          Rule set or realm
          <input className={wow.field} value={form.realm} onChange={set("realm")} maxLength={40} placeholder="Normal, PvP, RP…" />
        </label>
        <label className={styles.fieldLabel}>
          Faction
          <select className={wow.field} value={form.faction} onChange={set("faction")}>
            <option value="">Not shown</option>
            <option value="Alliance">Alliance</option>
            <option value="Horde">Horde</option>
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Class
          <input className={wow.field} value={form.className} onChange={set("className")} maxLength={20} />
        </label>
        <label className={styles.fieldLabel}>
          Level
          <input className={wow.field} inputMode="numeric" value={form.level} onChange={set("level")} />
        </label>
      </div>

      <h3 className={styles.subheading}>Profession skill</h3>
      <div className={styles.fields}>
        {catalog.professions.map((profession) => (
          <label key={profession.id} className={styles.fieldLabel}>
            {profession.name}
            <input
              className={wow.field}
              inputMode="numeric"
              placeholder="Not learned"
              value={skills[String(profession.id)] ?? ""}
              onChange={(event) => setSkills((current) => ({ ...current, [String(profession.id)]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      <label className={styles.fieldLabel}>
        Note shown with your items
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={500}
          value={form.note}
          onChange={set("note")}
          placeholder="Bring the materials and whisper me in game."
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div>
        <button type="submit" className={wow.button} disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
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
