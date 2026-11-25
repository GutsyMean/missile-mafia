import { ItemIcon } from "@/components/wow/ItemIcon";
import { Money } from "@/components/wow/Money";
import { bankContents, describeEntry, type GuildBankDoc } from "@/lib/guild-bank";
import styles from "./bank.module.css";

/** A fixed format, so the server and the browser print the same text. */
const day = (when: string | number) =>
  new Date(typeof when === "number" ? when * 1000 : when).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The bank as a member sees it: the gold, what lies in each tab, and what happened lately. */
export function BankView({ bank }: { bank: GuildBankDoc }) {
  const { slots } = bankContents(bank.tabs);
  const quality = (id: number | null) => (id === null ? 1 : (bank.items[String(id)]?.quality ?? 1));
  const icon = (id: number | null) => (id === null ? 0 : (bank.items[String(id)]?.iconFileId ?? 0));
  const lines = bank.ledger.flatMap((entry, index) => {
    const told = describeEntry(entry);
    return told ? [{ entry, told, key: `${entry.at}-${index}` }] : [];
  });

  return (
    <>
      <header className={styles.summary}>
        <p className={styles.gold}>
          <Money copper={bank.money} />
        </p>
        <p className={styles.reading}>
          As read in game on {day(bank.readAt)}
          {bank.readBy ? ` by ${bank.readBy}` : ""}. {count(bank.tabs.length, "tab")}, {count(slots, "slot")} in use.
          {bank.nextTabCost ? (
            <>
              {" "}
              The next tab costs <Money copper={bank.nextTabCost} />.
            </>
          ) : null}
        </p>
      </header>

      <div className={styles.columns}>
        <section className={styles.pane} aria-labelledby="bank-contents">
          <h2 id="bank-contents" className={styles.heading}>
            What it holds
          </h2>
          {bank.tabs.length === 0 ? (
            <p className={styles.note}>The guild has not bought a bank tab yet, so the bank holds gold only.</p>
          ) : (
            bank.tabs.map((tab) => (
              <section key={tab.n} className={styles.tab} aria-label={tab.name}>
                <h3 className={styles.tabName}>
                  <span>{tab.name}</span>
                  <span className={styles.tabCount}>{count(tab.slots.length, "slot")}</span>
                </h3>
                {tab.slots.length === 0 ? (
                  <p className={styles.note}>Empty.</p>
                ) : (
                  <ul className={styles.items}>
                    {tab.slots.map((held) => (
                      <li key={held.slot} className={styles.item}>
                        <ItemIcon fileId={icon(held.id)} quality={quality(held.id)} count={held.count} />
                        <span className={styles.itemName} data-quality={quality(held.id)}>
                          {held.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </section>

        <section className={styles.pane} aria-labelledby="bank-ledger">
          <h2 id="bank-ledger" className={styles.heading}>
            Lately
          </h2>
          {lines.length === 0 ? (
            <p className={styles.note}>The reading has no ledger lines.</p>
          ) : (
            <ol className={styles.ledger}>
              {lines.map(({ entry, told, key }) => (
                <li key={key} className={styles.line} data-gap={entry.kind === "gap" ? "" : undefined}>
                  <time className={styles.when} dateTime={new Date(entry.at * 1000).toISOString()}>
                    {day(entry.at)}
                  </time>
                  <span>
                    {told.who ? <span className={styles.who}>{told.who}</span> : null} {told.did}{" "}
                    {told.what === "money" && entry.copper !== null ? <Money copper={entry.copper} /> : null}
                    {told.what === "item" ? (
                      <span className={styles.itemName} data-quality={quality(entry.id)}>
                        {entry.count && entry.count > 1 ? `${entry.count} × ` : ""}
                        {entry.name ?? `Item ${entry.id}`}
                      </span>
                    ) : null}
                    {told.after ? ` ${told.after}` : null}
                    {told.what === "item" && entry.tab && !told.after ? (
                      <span className={styles.where}> · tab {entry.tab}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
