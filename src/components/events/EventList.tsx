"use client";

import { useSyncExternalStore } from "react";
import { groupByDay, zoneName, type GuildEvent } from "@/lib/events";
import styles from "./events.module.css";

// The reader's time zone is only known in their browser; until the page is up there, times stand in UTC.
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "UTC";

export function useTimeZone(): string {
  return useSyncExternalStore(subscribe, browserZone, serverZone);
}

interface Props {
  events: GuildEvent[];
  /** Names and times only, for a corner of another page. */
  brief?: boolean;
}

/** Events under the day each falls on, at the time of day it is for whoever is reading. */
export function EventList({ events, brief = false }: Props) {
  const timeZone = useTimeZone();
  return (
    <ol className={styles.days} data-brief={brief}>
      {groupByDay(events, timeZone).map((day) => (
        <li key={day.key} className={styles.dayGroup}>
          <h3 className={styles.day}>{day.label}</h3>
          <ul className={styles.events}>
            {day.events.map((event) => (
              <li key={event.id} className={styles.event}>
                <time className={styles.time} dateTime={event.startsAt}>
                  {event.time}
                </time>
                <div className={styles.what}>
                  <p className={styles.title}>{event.title}</p>
                  {!brief && event.details ? <p className={styles.details}>{event.details}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Says which time zone the times are in, as it stands on the day of the event given. */
export function ZoneNote({ at }: { at: string }) {
  const timeZone = useTimeZone();
  return <>Times are in your own time zone ({zoneName(timeZone, Date.parse(at))}).</>;
}
