import { EventList, ZoneNote } from "@/components/events/EventList";
import { Frame } from "@/components/wow/Frame";
import { loadEvents } from "@/lib/events-load";
import styles from "./events.module.css";

export const metadata = {
  title: "Events",
  description: "Missile Mafia's calendar: raids and guild events, in your own time zone.",
};

/** The guild's calendar: what is coming up, and what has lately been. */
export default async function EventsPage() {
  const { upcoming, earlier } = await loadEvents();
  const first = upcoming[0] ?? earlier[0];

  return (
    <main className={styles.page}>
      <Frame title="Events" className={styles.window}>
        <p className={styles.lead}>
          {first ? <ZoneNote at={first.startsAt} /> : "Raids and guild events show up here once an officer adds them."}
        </p>
        <div className={styles.columns} data-single={earlier.length === 0}>
          <section className={styles.pane} aria-labelledby="events-upcoming">
            <h2 id="events-upcoming" className={styles.heading}>
              Coming up
            </h2>
            {upcoming.length > 0 ? (
              <EventList events={upcoming} />
            ) : (
              <p className={styles.note}>Nothing is planned at the moment.</p>
            )}
          </section>
          {earlier.length > 0 ? (
            <section className={styles.pane} aria-labelledby="events-earlier">
              <h2 id="events-earlier" className={styles.heading}>
                Earlier
              </h2>
              <EventList events={earlier} />
            </section>
          ) : null}
        </div>
      </Frame>
    </main>
  );
}
