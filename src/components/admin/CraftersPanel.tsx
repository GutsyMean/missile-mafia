"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createCrafter,
  linkCrafter,
  saveApprovalSettings,
  setCrafterListed,
  type ActionResult,
} from "@/app/admin/actions";
import { unlinkedCrafters, waitingAccounts } from "@/lib/admin/directory";
import type { AdminDirectory, AdminSettings } from "@/lib/admin/types";
import wow from "@/components/wow/wow.module.css";
import styles from "./admin.module.css";

interface Props {
  directory: AdminDirectory;
  settings: AdminSettings | null;
  /** False while the site's server has no secret key: it then cannot record Discord's answers. */
  serverReady: boolean;
  /** The admin's own account, so changes to it can refresh their own tabs. */
  ownUserId: string;
  /** Takes the new list, or a function of the list as it stands. */
  onChange: (next: AdminDirectory | ((current: AdminDirectory) => AdminDirectory)) => void;
  onSettingsChange: (settings: AdminSettings) => void;
}

/** A fixed format, so the server and the browser print the same text. */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Site admins only: who has signed in, who is a crafter, and how the two are linked. */
export function CraftersPanel({ directory, settings, serverReady, ownUserId, onChange, onSettingsChange }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Character name typed for a waiting account, by account id. */
  const [names, setNames] = useState<Record<string, string>>({});
  /** What each "link to" dropdown has selected, by the id of the row it sits on. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");

  const waiting = waitingAccounts(directory);
  const spare = unlinkedCrafters(directory);
  const accounts = new Map(directory.accounts.map((account) => [account.id, account]));

  const run = (action: () => Promise<ActionResult<AdminDirectory>>, done: string, ownAccount: boolean) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChange(result.data);
      setNotice(done);
      // Linking or unlinking the admin's own account changes their own tabs.
      if (ownAccount) router.refresh();
    });
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Crafters</h2>
      <p className={styles.lead}>
        Guild members join with the &ldquo;Become a Crafter&rdquo; button above the crafting list, which signs them in
        with Discord. They
        wait here until you make them a crafter. Changes take effect straight away.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? (
        <p className={styles.ok} role="status">
          {notice}
        </p>
      ) : null}

      {settings ? <ApprovalSettings settings={settings} serverReady={serverReady} onSaved={onSettingsChange} /> : null}

      <h3 className={styles.subheading}>Waiting for you</h3>
      {waiting.length === 0 ? (
        <p className={styles.muted}>Nobody is waiting. Members appear here once they have signed in.</p>
      ) : (
        waiting.map((account) => {
          const name = names[account.id] ?? account.name;
          const pick = picks[account.id] ?? spare[0]?.id ?? "";
          const own = account.id === ownUserId;
          return (
            <section key={account.id} className={styles.character} aria-label={account.name}>
              <p>
                <span className={styles.personName}>{account.name}</span>
                {own ? " (you)" : ""} signed in on {day(account.createdAt)}
                {account.isVerifiedMember ? <span className={styles.ok}> · confirmed by Discord as a member</span> : null}
              </p>
              <div className={styles.row}>
                <label className={styles.inlineLabel}>
                  Character name
                  <input autoComplete="off"
                    className={wow.field}
                    value={name}
                    maxLength={40}
                    onChange={(event) => setNames((current) => ({ ...current, [account.id]: event.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className={wow.button}
                  disabled={pending || name.trim() === ""}
                  onClick={() =>
                    run(() => createCrafter(name, account.id), `${name.trim()} is now a crafter, managed by ${account.name}.`, own)
                  }
                >
                  Add as crafter
                </button>
              </div>
              {spare.length > 0 ? (
                <div className={styles.row}>
                  <label className={styles.inlineLabel}>
                    Or hand over an existing crafter
                    <select
                      className={`${wow.field} ${styles.wideSelect}`}
                      value={pick}
                      onChange={(event) => setPicks((current) => ({ ...current, [account.id]: event.target.value }))}
                    >
                      {spare.map((crafter) => (
                        <option key={crafter.id} value={crafter.id}>
                          {crafter.characterName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={wow.button}
                    disabled={pending || pick === ""}
                    onClick={() => {
                      const crafter = spare.find((c) => c.id === pick);
                      if (crafter) run(() => linkCrafter(crafter.id, account.id), `${crafter.characterName} is now managed by ${account.name}.`, own);
                    }}
                  >
                    Link
                  </button>
                </div>
              ) : null}
            </section>
          );
        })
      )}

      <h3 className={styles.subheading}>Crafters</h3>
      {directory.crafters.length === 0 ? <p className={styles.muted}>There are no crafters yet.</p> : null}
      {directory.crafters.map((crafter) => {
        const owner = crafter.userId ? accounts.get(crafter.userId) : undefined;
        const own = crafter.userId === ownUserId;
        const pick = picks[crafter.id] ?? directory.accounts[0]?.id ?? "";
        return (
          <section key={crafter.id} className={styles.character} aria-label={crafter.characterName}>
            <p>
              <span className={styles.personName}>{crafter.characterName}</span>{" "}
              <span className={styles.muted}>
                {crafter.recipeCount} {crafter.recipeCount === 1 ? "recipe" : "recipes"}
              </span>
            </p>
            {crafter.userId ? (
              <div className={styles.row}>
                <span>
                  Managed by {owner?.name ?? "an account that no longer exists"}
                  {own ? " (you)" : ""}
                </span>
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={pending}
                  onClick={() => run(() => linkCrafter(crafter.id, null), `${crafter.characterName} is no longer linked to an account.`, own)}
                >
                  Unlink
                </button>
              </div>
            ) : (
              <div className={styles.row}>
                <label className={styles.inlineLabel}>
                  Not linked. Hand over to
                  <select
                    className={`${wow.field} ${styles.wideSelect}`}
                    value={pick}
                    disabled={directory.accounts.length === 0}
                    onChange={(event) => setPicks((current) => ({ ...current, [crafter.id]: event.target.value }))}
                  >
                    {directory.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={wow.button}
                  disabled={pending || pick === ""}
                  onClick={() => {
                    const account = accounts.get(pick);
                    if (account) {
                      run(() => linkCrafter(crafter.id, account.id), `${crafter.characterName} is now managed by ${account.name}.`, account.id === ownUserId);
                    }
                  }}
                >
                  Link
                </button>
              </div>
            )}
            <label className={wow.checkbox}>
              <input
                type="checkbox"
                checked={crafter.isListed}
                onChange={(event) => {
                  const listed = event.target.checked;
                  const show = (value: boolean) =>
                    onChange((current) => ({
                      ...current,
                      crafters: current.crafters.map((c) => (c.id === crafter.id ? { ...c, isListed: value } : c)),
                    }));
                  // Shown at once; put back if the save fails.
                  show(listed);
                  setError(null);
                  setNotice(
                    listed
                      ? `${crafter.characterName} is shown on the crafting list.`
                      : `${crafter.characterName} is hidden from the crafting list.`,
                  );
                  void setCrafterListed(crafter.id, listed).then((result) => {
                    if (result.ok) {
                      show(listed); // in case a slower change redrew the list in between
                    } else {
                      show(!listed);
                      setNotice(null);
                      setError(`Not saved: ${result.error} ${crafter.characterName} was put back.`);
                    }
                  });
                }}
              />
              Shown on the crafting list
            </label>
          </section>
        );
      })}

      <h3 className={styles.subheading}>Add a crafter who has not signed in yet</h3>
      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (name === "") return;
          run(() => createCrafter(name, null), `${name} was added. Link them to an account once they have signed in.`, false);
          setNewName("");
        }}
      >
        <label className={styles.inlineLabel}>
          Character name
          <input autoComplete="off" className={wow.field} value={newName} maxLength={40} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <button type="submit" className={wow.button} disabled={pending || newName.trim() === ""}>
          Add crafter
        </button>
      </form>
    </div>
  );
}

/** Who becomes a crafter without waiting for an admin: members of a Discord server, optionally with a role. */
function ApprovalSettings({
  settings,
  serverReady,
  onSaved,
}: {
  settings: AdminSettings;
  serverReady: boolean;
  onSaved: (settings: AdminSettings) => void;
}) {
  const [autoApprove, setAutoApprove] = useState(settings.autoApprove);
  const [guildId, setGuildId] = useState(settings.discordGuildId ?? "");
  const [roleId, setRoleId] = useState(settings.discordRoleId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={styles.character}
      aria-label="Automatic approval"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await saveApprovalSettings(autoApprove, guildId, roleId);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onSaved(result.data);
          setSaved(true);
        });
      }}
    >
      <h3 className={styles.subheading}>Automatic approval</h3>
      <p>
        When this is on, anyone who signs in and is a member of your Discord server can set up their own crafter
        profile, with no approval from you. The site asks Discord itself at every sign-in, so membership cannot be
        faked. People who are not in the server still wait for you below.
      </p>
      <label className={wow.checkbox}>
        <input type="checkbox" checked={autoApprove} onChange={(event) => setAutoApprove(event.target.checked)} />
        Approve members of my Discord server automatically
      </label>
      <div className={styles.row}>
        <label className={styles.inlineLabel}>
          Server ID
          <input autoComplete="off"
            className={wow.field}
            inputMode="numeric"
            placeholder="Required"
            value={guildId}
            onChange={(event) => setGuildId(event.target.value)}
          />
        </label>
        <label className={styles.inlineLabel}>
          Role ID
          <input autoComplete="off"
            className={wow.field}
            inputMode="numeric"
            placeholder="Optional: only this role"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          />
        </label>
        <button type="submit" className={wow.button} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className={styles.muted}>
        To copy the IDs, turn on Developer Mode in Discord (User Settings, Advanced). Then right-click your server
        and choose Copy Server ID. For a role, open Server Settings, Roles, right-click the role and choose Copy
        Role ID.
      </p>
      {!serverReady ? (
        <p className={styles.error}>
          This cannot work yet: the site&apos;s server is missing its Supabase secret key, which it needs to record
          Discord&apos;s answers.
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {saved ? (
        <p className={styles.ok} role="status">
          Saved. {autoApprove ? "Members are checked the next time they sign in." : "Approval is manual again."}
        </p>
      ) : null}
      {settings.autoApprove ? (
        <p className={styles.muted}>
          {settings.verifiedMembers} {settings.verifiedMembers === 1 ? "account has" : "accounts have"} been confirmed
          by Discord so far. If you signed in before this was turned on, sign out and in again to be checked yourself.
        </p>
      ) : null}
    </form>
  );
}
