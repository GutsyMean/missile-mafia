"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { applyGuildImport, importGuildBank, previewGuildImport, type GuildImportResult } from "@/app/admin/actions";
import { Money } from "@/components/wow/Money";
import { bankContents } from "@/lib/guild-bank";
import type { AdminCatalog, AdminDirectory } from "@/lib/admin/types";
import { listNames } from "@/lib/admin/directory";
import {
  matchGuildyMember,
  playersToRecord,
  readGuildyFile,
  samePlayer,
  suggestCrafters,
  toImportMember,
  type GuildImportTally,
  type GuildyFileProblem,
  type GuildyGuild,
  type GuildyMemberMatch,
} from "@/lib/guildy";
import wow from "@/components/wow/wow.module.css";
import styles from "./admin.module.css";

interface Props {
  catalog: AdminCatalog;
  directory: AdminDirectory;
  onImported: (result: GuildImportResult) => void;
  /** How the server is asked. Only given a stand-in where there is no server to ask. */
  actions?: { preview: typeof previewGuildImport; apply: typeof applyGuildImport; bank: typeof importGuildBank };
}

/** What the admin chose for one member: whether to import them, and into which crafter ("" for a new one). */
interface Choice {
  include: boolean;
  crafterId: string;
}

const PROBLEMS: Record<GuildyFileProblem, string> = {
  not_saved_data: "That file is not saved addon data. Choose Guildy.lua from the game's SavedVariables folder.",
  not_guildy: "That file is not Guildy's. Choose Guildy.lua from the game's SavedVariables folder.",
  no_guild:
    "Guildy has not recorded a guild in that file. Open the guild window in game, log out, then choose the file again.",
};

/** Guildy's file for a large guild runs to a few megabytes; anything far beyond that is something else. */
const MAX_FILE_BYTES = 40_000_000;

const SERVER = { preview: previewGuildImport, apply: applyGuildImport, bank: importGuildBank };

/** A fixed format, so the date reads the same everywhere. */
const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The members of a guild who have a profession the site lists, each once. */
function membersWorthImporting(
  guild: GuildyGuild | null,
  professions: AdminCatalog["professions"],
  known: ReadonlyMap<number, number>,
): GuildyMemberMatch[] {
  const seen = new Set<string>();
  const rows: GuildyMemberMatch[] = [];
  for (const member of guild?.members ?? []) {
    const match = matchGuildyMember(member, professions, known);
    if (match.professions.length === 0 || seen.has(match.name)) continue;
    seen.add(match.name);
    rows.push(match);
  }
  return rows;
}

/** A crafter picked for more than one of the members to import, if any. */
function sharedCrafter(rows: GuildyMemberMatch[], choices: Record<string, Choice>): string | null {
  const picked = new Set<string>();
  for (const row of rows) {
    const choice = choices[row.name];
    if (!choice?.include || choice.crafterId === "") continue;
    if (picked.has(choice.crafterId)) return choice.crafterId;
    picked.add(choice.crafterId);
  }
  return null;
}

/** Site admins only: brings in the members, skills and recipes the Guildy addon has collected. */
export function GuildImportPanel({ catalog, directory, onImported, actions = SERVER }: Props) {
  const [loaded, setLoaded] = useState<{ fileName: string; guilds: GuildyGuild[] } | null>(null);
  const [guildKey, setGuildKey] = useState("");
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [listNew, setListNew] = useState(true);
  /** What importing would do, by member name, as the server last worked it out. */
  const [tallies, setTallies] = useState<Record<string, GuildImportTally>>({});
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** How bringing in the bank went, and whether it is under way. */
  const [bankNote, setBankNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [bankPending, startBank] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  /** Counts the looks asked for, so an answer to an earlier one is not shown. */
  const looks = useRef(0);

  const known = useMemo(() => new Map(catalog.recipes.map((r) => [r.id, r.professionId])), [catalog.recipes]);
  const professionName = useMemo(() => new Map(catalog.professions.map((p) => [p.id, p.name])), [catalog.professions]);
  const guild = loaded?.guilds.find((g) => g.key === guildKey) ?? loaded?.guilds[0] ?? null;
  const rows = useMemo(() => membersWorthImporting(guild, catalog.professions, known), [guild, catalog.professions, known]);
  const suggestions = useMemo(
    () => suggestCrafters(rows.map((row) => row.name), directory.crafters),
    [rows, directory.crafters],
  );
  const crafterName = new Map(directory.crafters.map((crafter) => [crafter.id, crafter.characterName]));

  const included = rows.filter((row) => choices[row.name]?.include);
  const shared = sharedCrafter(rows, choices);
  const without = (guild?.members.length ?? 0) - rows.length;

  const membersToSend = (from: GuildyMemberMatch[], chosen: Record<string, Choice>) =>
    from.filter((row) => chosen[row.name]?.include).map((row) => toImportMember(row, chosen[row.name].crafterId || null));

  /** Asks the server what importing would do, with the choices as they now stand. */
  const look = (from: GuildyMemberMatch[], chosen: Record<string, Choice>, list: boolean) => {
    const ticket = ++looks.current;
    const members = membersToSend(from, chosen);
    setTallies({});
    if (members.length === 0 || sharedCrafter(from, chosen) !== null) {
      setChecking(false);
      return;
    }
    setChecking(true);
    void actions.preview(members, list).then((result) => {
      if (ticket !== looks.current) return;
      setChecking(false);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      setTallies(Object.fromEntries(result.data.map((tally, index) => [members[index].name, tally])));
    });
  };

  const openGuild = (next: GuildyGuild) => {
    const members = membersWorthImporting(next, catalog.professions, known);
    const pairs = suggestCrafters(members.map((row) => row.name), directory.crafters);
    const chosen = Object.fromEntries(
      members.map((row) => [row.name, { include: true, crafterId: pairs.get(row.name)?.crafterId ?? "" }]),
    );
    setGuildKey(next.key);
    setChoices(chosen);
    look(members, chosen, listNew);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setDone(null);
    if (file.size > MAX_FILE_BYTES) {
      setProblem("That file is far larger than Guildy's saved data. Choose Guildy.lua from the game's SavedVariables folder.");
      return;
    }
    const read = readGuildyFile(await file.text());
    if (!read.ok) {
      setLoaded(null);
      setProblem(PROBLEMS[read.problem]);
      return;
    }
    setLoaded({ fileName: file.name, guilds: read.guilds });
    setBankNote(null);
    openGuild(read.guilds[0]);
  };

  const change = (name: string, next: Partial<Choice>) => {
    const chosen = { ...choices, [name]: { ...choices[name], ...next } };
    setChoices(chosen);
    setProblem(null);
    setDone(null);
    look(rows, chosen, listNew);
  };

  const importNow = () => {
    const members = membersToSend(rows, choices);
    setProblem(null);
    setDone(null);
    startTransition(async () => {
      const result = await actions.apply(members, listNew, playersToRecord(guild?.players ?? [], members, directory.crafters));
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      setProblem(result.data.warning);
      const created = result.data.tallies.filter((tally) => tally.created).length;
      const recipes = result.data.tallies.reduce((sum, tally) => sum + tally.recipesAdded, 0);
      setDone(
        `Imported ${count(members.length, "member")}: ${count(created, "new crafter")}, ${count(recipes, "recipe")} added.`,
      );
      // The crafters now exist: aim each member at theirs, so pressing again adds nobody twice.
      const chosen = { ...choices };
      result.data.tallies.forEach((tally, index) => {
        if (tally.crafterId) chosen[members[index].name] = { include: true, crafterId: tally.crafterId };
      });
      setChoices(chosen);
      onImported(result.data);
      look(rows, chosen, listNew);
    });
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Import guild members</h2>
      <ol className={styles.steps}>
        <li>
          In game, with the <em>Guildy</em> addon, open the guild window, go to Professions and press{" "}
          <em>Read online members</em>.
        </li>
        <li>
          Log out, or type <code>/reload</code>, so the game saves what Guildy has read.
        </li>
        <li>
          Choose <code>Guildy.lua</code> from <code>WTF/Account/&lt;your account&gt;/SavedVariables</code> in the game
          folder.
        </li>
      </ol>
      <div className={styles.row}>
        <button type="button" className={wow.button} disabled={pending} onClick={() => fileInput.current?.click()}>
          Choose Guildy.lua
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".lua,text/plain"
          hidden
          aria-label="Guildy.lua"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // so the same file can be chosen again after a new read in game
            void choose(file);
          }}
        />
        {loaded ? <span className={styles.muted}>{loaded.fileName}</span> : null}
        {loaded && loaded.guilds.length > 1 ? (
          <label className={styles.inlineLabel}>
            Guild
            <select
              className={`${wow.field} ${styles.wideSelect}`}
              value={guild?.key ?? ""}
              disabled={pending}
              onChange={(event) => {
                const next = loaded.guilds.find((g) => g.key === event.target.value);
                if (next) openGuild(next);
              }}
            >
              {loaded.guilds.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name} ({count(g.members.length, "member")})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {problem ? <p className={styles.error}>{problem}</p> : null}
      {done ? (
        <p className={styles.ok} role="status">
          {done}
        </p>
      ) : null}

      {guild ? (
        <>
          <h3 className={styles.subheading}>Guild bank</h3>
          {guild.bank ? (
            <section className={styles.character} aria-label="Guild bank">
              <p>
                <Money copper={guild.bank.money} />{" "}
                <span className={styles.muted}>
                  · {count(guild.bank.tabs.length, "tab")}, {count(bankContents(guild.bank.tabs).slots, "slot")} in use ·{" "}
                  {count(guild.bank.ledger.length, "ledger line")}
                </span>
              </p>
              <p className={styles.muted}>
                Read by Guildy on {day(guild.bank.at)}
                {guild.bank.by ? ` by ${guild.bank.by}` : ""}. Guild members see it on the Guild bank page.
              </p>
              {bankNote ? (
                <p className={bankNote.kind === "ok" ? styles.ok : styles.error} role="status">
                  {bankNote.text}
                </p>
              ) : null}
              <button
                type="button"
                className={wow.button}
                disabled={bankPending}
                onClick={() => {
                  const reading = guild.bank;
                  if (!reading) return;
                  setBankNote(null);
                  startBank(async () => {
                    const result = await actions.bank(reading);
                    setBankNote(
                      result.ok
                        ? { kind: "ok", text: `The Guild bank page now shows the reading of ${day(reading.at)}.` }
                        : { kind: "error", text: result.error },
                    );
                  });
                }}
              >
                {bankPending ? "Updating…" : "Update the guild bank"}
              </button>
            </section>
          ) : (
            <p className={styles.muted}>
              Guildy has not read the guild bank in this file. Open the bank at a guild banker in game, log out, then
              choose the file again.
            </p>
          )}
          <h3 className={styles.subheading}>
            {guild.name}: {count(rows.length, "member")} with professions
          </h3>
          {rows.length === 0 ? (
            <p className={styles.muted}>
              Guildy has no professions for anyone in this guild yet. Press Read online members in game first.
            </p>
          ) : null}
          {rows.map((row) => {
            const choice = choices[row.name] ?? { include: false, crafterId: "" };
            const tally = tallies[row.name];
            const suggestion = suggestions.get(row.name);
            const target = choice.crafterId === "" ? null : (crafterName.get(choice.crafterId) ?? null);
            const others = samePlayer(row.name, guild.players);
            return (
              <section key={row.name} className={styles.character} aria-label={row.name} data-included={choice.include}>
                <div className={styles.row}>
                  <label className={wow.checkbox}>
                    <input
                      type="checkbox"
                      checked={choice.include}
                      disabled={pending}
                      onChange={(event) => change(row.name, { include: event.target.checked })}
                    />
                    <span className={styles.personName}>{row.name}</span>
                  </label>
                  <label className={styles.inlineLabel}>
                    Import as
                    <select
                      className={`${wow.field} ${styles.wideSelect}`}
                      value={choice.crafterId}
                      disabled={pending || !choice.include}
                      onChange={(event) => change(row.name, { crafterId: event.target.value })}
                    >
                      <option value="">A new crafter</option>
                      {directory.crafters.map((crafter) => (
                        <option key={crafter.id} value={crafter.id}>
                          {crafter.characterName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ul className={styles.inlineList}>
                  {row.professions.map((profession) => (
                    <li key={profession.professionId}>
                      {profession.name} {profession.skill}
                      <span className={styles.muted}>
                        {" · "}
                        {profession.recipes === null ? "skill only" : count(profession.recipes, "recipe")}
                      </span>
                    </li>
                  ))}
                </ul>
                {suggestion?.how === "close" && suggestion.crafterId === choice.crafterId && target ? (
                  <p className={styles.muted}>
                    Matched to {target} by name. Check it is the same character, or choose another.
                  </p>
                ) : null}
                {choice.include ? (
                  <p className={tally && (tally.created || tally.recipesAdded > 0 || tally.skills.length > 0) ? styles.ok : styles.muted}>
                    {tally ? describe(tally, target, professionName) : checking ? "Checking…" : ""}
                  </p>
                ) : null}
                <p className={styles.muted}>
                  {others.length > 0 ? `Same player as ${listNames(others)} · ` : ""}
                  {row.readAt > 0 ? `Read by Guildy on ${day(row.readAt)}` : "Guildy does not say when it read this"}
                  {row.unknownSpellIds.length > 0
                    ? ` · ${count(row.unknownSpellIds.length, "entry is", "entries are")} not ${row.unknownSpellIds.length === 1 ? "a recipe" : "recipes"} this site lists`
                    : ""}
                </p>
              </section>
            );
          })}
          {without > 0 ? (
            <p className={styles.muted}>
              {count(without, "other member has", "other members have")} no professions in the file and{" "}
              {without === 1 ? "is" : "are"} left out.
            </p>
          ) : null}
          {shared ? (
            <p className={styles.error}>
              {crafterName.get(shared) ?? "One crafter"} is chosen for more than one member. Give each member their own
              crafter.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <>
              <label className={`${wow.checkbox} ${styles.wrapLabel}`}>
                <input
                  type="checkbox"
                  checked={listNew}
                  disabled={pending}
                  onChange={(event) => {
                    setListNew(event.target.checked);
                    look(rows, choices, event.target.checked);
                  }}
                />
                Show new crafters on the crafting list straight away
              </label>
              <div className={styles.row}>
                <button
                  type="button"
                  className={wow.button}
                  disabled={pending || checking || included.length === 0 || shared !== null}
                  onClick={importNow}
                >
                  {pending ? "Importing…" : `Import ${count(included.length, "member")}`}
                </button>
              </div>
              <p className={styles.muted}>
                Importing only adds. A skill is never lowered, and a recipe a member took off their own list stays
                off.
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** One line on what importing a member does, or would do. */
function describe(tally: GuildImportTally, target: string | null, professionName: ReadonlyMap<number, string>): string {
  const parts: string[] = [];
  if (tally.created) parts.push("New crafter");
  if (tally.recipesAdded > 0) {
    // Where a higher skill brings trainer recipes the file does not name, say how many of each.
    const forSkill = tally.recipesAdded - tally.recipesFromFile;
    const split = forSkill > 0 ? ` (${tally.recipesFromFile} from the file, ${forSkill} trainer ${forSkill === 1 ? "recipe" : "recipes"} for the skill)` : "";
    parts.push(`${tally.created ? "" : "adds "}${count(tally.recipesAdded, "recipe")}${split}`);
  }
  if (!tally.created) {
    for (const skill of tally.skills) {
      const name = professionName.get(skill.professionId) ?? "A profession";
      parts.push(skill.from === null ? `${name} ${skill.to} is new` : `${name} ${skill.from} → ${skill.to}`);
    }
  }
  if (tally.recipesSkipped > 0) {
    parts.push(`${count(tally.recipesSkipped, "recipe")} they took off their list ${tally.recipesSkipped === 1 ? "stays" : "stay"} off`);
  }
  if (parts.length === 0) return target ? `Nothing new for ${target}` : "Nothing new";
  const text = parts.join(" · ");
  return !tally.created && target ? `${target}: ${text}` : text[0].toUpperCase() + text.slice(1);
}
