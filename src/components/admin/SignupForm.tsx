"use client";

import { useRouter } from "next/navigation";
import { signUpCrafter } from "@/app/admin/actions";
import { signOut } from "@/app/login/actions";
import type { CatalogProfession } from "@/lib/admin/types";
import { Frame } from "@/components/wow/Frame";
import { EMPTY_PROFILE, ProfileForm } from "./ProfileForm";
import styles from "./admin.module.css";

interface Props {
  accountName: string | null;
  professions: CatalogProfession[];
}

/** First visit of a member Discord confirmed: set up a profile, then on to the recipes. */
export function SignupForm({ accountName, professions }: Props) {
  const router = useRouter();
  return (
    <Frame title="Join the Crafters" className={styles.window}>
      <div className={styles.topbar}>
        <p className={styles.muted}>Step 1 of 2: your profile. Step 2: your recipes.</p>
        <div className={styles.account}>
          <form action={signOut}>
            <button type="submit" className={styles.linkButton}>
              Sign out{accountName ? ` (${accountName})` : ""}
            </button>
          </form>
        </div>
      </div>
      <div className={styles.pane}>
        <ProfileForm
          heading="Set up your crafter profile"
          lead="Discord confirmed you as a guild member. Tell the guild which character to whisper and what you can craft. You can change all of this later."
          initial={{ ...EMPTY_PROFILE, characterName: "" }}
          professions={professions}
          submitLabel="Create my profile"
          onSubmit={signUpCrafter}
          onSaved={() => {
            // The next step is adding recipes; the page reloads with the new profile.
            router.replace("/admin?welcome=1");
            router.refresh();
          }}
        />
      </div>
    </Frame>
  );
}
