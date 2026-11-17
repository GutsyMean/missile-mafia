"use client";

import { useState, useTransition } from "react";
import type { ActionResult, ProfileInput } from "@/app/admin/actions";
import type { CatalogProfession } from "@/lib/admin/types";
import wow from "@/components/wow/wow.module.css";
import styles from "./admin.module.css";

export const EMPTY_PROFILE: ProfileInput = {
  characterName: "",
  realm: "",
  faction: "",
  className: "",
  level: "",
  note: "",
  skills: {},
};

interface Props {
  heading: string;
  /** Shown under the heading, e.g. what the profile is for. */
  lead?: string;
  initial: ProfileInput;
  professions: CatalogProfession[];
  submitLabel: string;
  onSubmit: (input: ProfileInput) => Promise<ActionResult<unknown>>;
  onSaved: () => void;
}

/** A crafter's profile: used both for signing up and for editing later. */
export function ProfileForm({ heading, lead, initial, professions, submitLabel, onSubmit, onSaved }: Props) {
  const [form, setForm] = useState({
    characterName: initial.characterName,
    realm: initial.realm,
    faction: initial.faction,
    className: initial.className,
    level: initial.level,
    note: initial.note,
  });
  const [skills, setSkills] = useState<Record<string, string>>(initial.skills);
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
          const result = await onSubmit({ ...form, skills });
          if (result.ok) onSaved();
          else setError(result.error);
        });
      }}
    >
      <h2 className={styles.heading}>{heading}</h2>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
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
      <p className={styles.muted}>Fill in the professions you have; leave the rest empty.</p>
      <div className={styles.fields}>
        {professions.map((profession) => (
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
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
