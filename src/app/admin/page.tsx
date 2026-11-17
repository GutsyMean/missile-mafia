import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { AdminPanel } from "@/components/admin/AdminPanel";
import styles from "@/components/admin/admin.module.css";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import { loadAdminData } from "@/lib/admin/load";
import pageStyles from "../page.module.css";

export const metadata = { title: "My recipes · Missile Mafia Crafting" };

/** "Check for game updates" runs a full sync from this page's actions. */
export const maxDuration = 300;

async function AdminContent() {
  const data = await loadAdminData();
  if (!data) redirect("/login");

  if (data.crafters.length === 0) {
    return (
      <Frame title="Not a crafter yet" className={styles.window}>
        <div className={styles.card}>
          <p>
            You are signed in{data.accountName ? ` as ${data.accountName}` : ""}, but this account is not linked to
            a crafter. Ask the guild&apos;s site owner to link it, then reload this page.
          </p>
          <form action={signOut}>
            <button type="submit" className={wow.button}>
              Sign out
            </button>
          </form>
        </div>
      </Frame>
    );
  }
  return <AdminPanel data={data} />;
}

export default function AdminPage() {
  return (
    <main className={pageStyles.page}>
      <Suspense
        fallback={
          <Frame title="Loading your recipes" className={styles.window}>
            <div className={styles.card}>
              <p>Loading…</p>
            </div>
          </Frame>
        }
      >
        <AdminContent />
      </Suspense>
    </main>
  );
}
