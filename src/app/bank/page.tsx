import Link from "next/link";
import { Suspense } from "react";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import { loadGuildBank } from "@/lib/guild-bank-load";
import { BankView } from "./BankView";
import styles from "./bank.module.css";

export const metadata = {
  title: "Guild bank",
  description: "What Missile Mafia's guild bank holds, for guild members.",
};

async function BankContent() {
  const view = await loadGuildBank();
  if (view.state === "ok") return <BankView bank={view.bank} />;
  return (
    <div className={styles.gate}>
      {view.state === "signed-out" ? (
        <>
          <p>What the bank holds, and who put in or took out what, is for guild members. Sign in with Discord to see it.</p>
          <Link href="/login" className={wow.button}>
            Sign in
          </Link>
        </>
      ) : view.state === "not-member" ? (
        <p>
          You are signed in, but this account is not known as a guild member. Join the guild&apos;s Discord server and
          sign in again, or ask an officer to link your character.
        </p>
      ) : (
        <p>
          Nobody has brought in a reading of the bank yet. A site admin does that from the Guildy addon&apos;s file,
          under Import guild, after opening the bank at a guild banker in game.
        </p>
      )}
    </div>
  );
}

export default function BankPage() {
  return (
    <main className={styles.page}>
      <Frame title="Guild bank" className={styles.window}>
        <Suspense fallback={<p className={styles.gate}>Opening the bank…</p>}>
          <BankContent />
        </Suspense>
      </Frame>
    </main>
  );
}
