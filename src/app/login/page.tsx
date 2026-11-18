import Link from "next/link";
import { Suspense } from "react";
import styles from "@/components/admin/admin.module.css";
import { Frame } from "@/components/wow/Frame";
import wow from "@/components/wow/wow.module.css";
import pageStyles from "../page.module.css";
import { signInWithDiscord } from "./actions";

export const metadata = { title: "Sign in · Missile Mafia Crafting" };

const ERRORS: Record<string, string> = {
  discord: "Discord sign-in could not be started. Try again in a moment.",
  callback: "Discord sign-in did not complete. Try again.",
};

async function SignInError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;
  return message ? <p className={styles.error}>{message}</p> : null;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className={pageStyles.page}>
      <Frame title="Crafter Sign-in" className={styles.window}>
        <div className={styles.card}>
          <p>
            Browsing the crafting list needs no account. Sign in only if you are a guild crafter managing your own
            recipe list.
          </p>
          <p>
            New here? Signing in with Discord is also how you join: it creates your account, and you then set up
            your crafter profile.
          </p>
          <Suspense fallback={null}>
            <SignInError searchParams={searchParams} />
          </Suspense>
          <form action={signInWithDiscord}>
            <button type="submit" className={wow.button}>
              Sign in with Discord
            </button>
          </form>
          <p>
            <Link href="/">Back to the crafting list</Link>
          </p>
        </div>
      </Frame>
    </main>
  );
}
