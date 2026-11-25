"use client";

import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/app/admin/actions";
import { useTimeZone } from "@/components/events/EventList";
import wow from "@/components/wow/wow.module.css";
import { GRACE_HOURS, toFields, toInstant, zoneName, type GuildEvent } from "@/lib/events";
import styles from "./admin.module.css";

interface Props {
  /** The calendar, newest first. */
  events: GuildEvent[];
  /** When the page was put together, in milliseconds since 1970: near enough to now to tell what is still ahead. */
  loadedAt: number;
  onChange: (events: GuildEvent[]) => void;
}

const EMPTY = { id: null as string | null, title: "", date: "", time: "", details: "" };

/** Site admins only: the guild's calendar, to add to and to tidy. */
export function EventsPanel({ events, loadedAt, onChange }: Props) {
  const timeZone = useTimeZone();
  const [form, setForm] = useState(EMPTY);
  /** The event whose removal is being confirmed. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const when = (event: GuildEvent) =>
    new Date(event.startsAt).toLocaleString("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const set = (key: "title" | "date" | "time" | "details") => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const editing = form.id !== null;
  const ahead = events.filter((event) => Date.parse(event.startsAt) >= loadedAt - GRACE_HOURS * 3_600_000).reverse();
  const behind = events.filter((event) => !ahead.includes(event));

  return (
    <div className={styles.section}>
      <h2 className={styles.heading}>Events</h2>
      <p className={styles.lead}>
        Raids and guild events for the Events page, which anyone can read. Type the time as it is for you (
        {zoneName(timeZone, loadedAt)}); everyone sees it in their own time zone.
      </p>

      <form
        className={`${styles.character} ${styles.eventForm}`}
        aria-label={editing ? "Change the event" : "Add an event"}
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setNotice(null);
          const startsAt = toInstant(form.date, form.time);
          if (!startsAt) {
            setError("Choose the day and the time the event starts.");
            return;
          }
          startTransition(async () => {
            const result = await saveEvent({ id: form.id, title: form.title, startsAt, details: form.details });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onChange(result.data);
            setNotice(editing ? `${form.title.trim()} was changed.` : `${form.title.trim()} is on the calendar.`);
            setForm(EMPTY);
          });
        }}
      >
        <h3 className={styles.subheading}>{editing ? "Change the event" : "Add an event"}</h3>
        <div className={styles.fields}>
          <label className={styles.fieldLabel}>
            Name
            <input autoComplete="off" className={wow.field} value={form.title} onChange={set("title")} required maxLength={80} />
          </label>
          <label className={styles.fieldLabel}>
            Day
            <input className={wow.field} type="date" value={form.date} onChange={set("date")} required />
          </label>
          <label className={styles.fieldLabel}>
            Starts at
            <input className={wow.field} type="time" value={form.time} onChange={set("time")} required />
          </label>
        </div>
        <label className={styles.fieldLabel}>
          Details, if any
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={1000}
            value={form.details}
            onChange={set("details")}
            placeholder="What to bring, where to meet."
          />
        </label>
        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? (
          <p className={styles.ok} role="status">
            {notice}
          </p>
        ) : null}
        <div className={styles.row}>
          <button type="submit" className={wow.button} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add event"}
          </button>
          {editing ? (
            <button type="button" className={styles.linkButton} disabled={pending} onClick={() => setForm(EMPTY)}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {[
        ["Coming up", ahead, "Nothing is planned at the moment."] as const,
        ["Earlier", behind, null] as const,
      ].map(([heading, list, empty]) =>
        list.length === 0 && empty === null ? null : (
          <section key={heading} aria-label={heading} className={styles.eventList}>
            <h3 className={styles.subheading}>{heading}</h3>
            {list.length === 0 ? <p className={styles.muted}>{empty}</p> : null}
            {list.map((event) => (
              <section key={event.id} className={styles.character} aria-label={event.title}>
                <p>
                  <span className={styles.personName}>{event.title}</span>{" "}
                  <span className={styles.muted}>{when(event)}</span>
                </p>
                {event.details ? <p className={styles.muted}>{event.details}</p> : null}
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setRemoving(null);
                      setForm({ id: event.id, title: event.title, ...toFields(event.startsAt), details: event.details ?? "" });
                    }}
                  >
                    Change
                  </button>
                  {removing === event.id ? (
                    <>
                      <button
                        type="button"
                        className={wow.button}
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setNotice(null);
                          startTransition(async () => {
                            const result = await deleteEvent(event.id);
                            setRemoving(null);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            onChange(result.data);
                            setNotice(`${event.title} was taken off the calendar.`);
                            if (form.id === event.id) setForm(EMPTY);
                          });
                        }}
                      >
                        Remove it
                      </button>
                      <button type="button" className={styles.linkButton} disabled={pending} onClick={() => setRemoving(null)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button type="button" className={styles.linkButton} disabled={pending} onClick={() => setRemoving(event.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </section>
            ))}
          </section>
        ),
      )}
    </div>
  );
}
