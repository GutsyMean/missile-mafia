import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { SignupForm } from "@/components/admin/SignupForm";
import styles from "@/components/admin/admin.module.css";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import { loadAdminData } from "@/lib/admin/load";
import pageStyles from "../page.module.css";

export const metadata = { title: "My recipes · Missile Mafia Crafting" };

/** "Check for game updates" runs a full sync from this page's actions. */
export const maxDuration = 300;

async function AdminContent({ searchParams }: { searchParams: Promise<{ welcome?: string; character?: string }> }) {
  const [data, { welcome, character }] = await Promise.all([loadAdminData(), searchParams]);
  if (!data) redirect("/login");

  // A member Discord confirmed sets up their own profile.
  if (data.crafters.length === 0 && !data.isAdmin && data.signup.open && data.signup.verified) {
    return <SignupForm accountName={data.accountName} professions={data.catalog.professions} />;
  }

  if (data.crafters.length === 0 && !data.isAdmin) {
    return (
      <Frame title="Not a crafter yet" className={styles.window}>
        <div className={styles.card}>
          {data.signup.open ? (
            <p>
              You are signed in{data.accountName ? ` as ${data.accountName}` : ""}, but Discord did not confirm this
              account as a member of the guild&apos;s server. Join the server, or ask an officer if a role is
              needed, then sign out and sign in again.
            </p>
          ) : (
            <p>
              You are signed in{data.accountName ? ` as ${data.accountName}` : ""}, but this account is not linked to
              a crafter. Ask the guild&apos;s site owner to link it, then reload this page.
            </p>
          )}
          <form action={signOut}>
            <button type="submit" className={wow.button}>
              Sign out
            </button>
          </form>
        </div>
      </Frame>
    );
  }
  // Remount when the account's characters change, so the page starts from the new list.
  return (
    <AdminPanel
      key={data.crafters.map((crafter) => crafter.id).join(",") || "no-crafter"}
      data={data}
      welcome={welcome === "1"}
      initialCrafterId={typeof character === "string" ? character : undefined}
    />
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
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
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
