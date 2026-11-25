"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUpCrafter, type SignUpResult } from "@/app/admin/actions";
import { listNames } from "@/lib/admin/directory";
import { signOut } from "@/app/login/actions";
import type { CatalogProfession } from "@/lib/admin/types";
import { Frame } from "@/components/wow/Frame";
import { EMPTY_PROFILE, ProfileForm } from "./ProfileForm";
import styles from "./admin.module.css";

interface Props {
  accountName: string | null;
  professions: CatalogProfession[];
  /** Characters already on the list that this member asked for and an admin has yet to hand over. */
  waitingFor: string[];
}

/** What a member is told when the character they named is already listed. */
export const heldNotice = (name: string) =>
  `${name} is already on the crafting list, so no second one was made. A site admin will hand it over to you; it shows up here once they have.`;

/** First visit of a member Discord confirmed: set up a profile, then on to the recipes. */
export function SignupForm({ accountName, professions, waitingFor }: Props) {
  const router = useRouter();
  const [held, setHeld] = useState<string | null>(null);
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
        {waitingFor.length > 0 ? (
          <p className={styles.welcome}>
            <strong>
              {listNames(waitingFor)} {waitingFor.length === 1 ? "is" : "are"} already on the crafting list.
            </strong>{" "}
            A site admin will hand {waitingFor.length === 1 ? "it" : "them"} over to you. There is nothing more to do:
            this page changes once they have. The form below is for a character that is not listed yet.
          </p>
        ) : null}
        <ProfileForm
          heading="Set up your crafter profile"
          lead="Discord confirmed you as a guild member. Tell the guild which character to whisper and what you can craft. You can change all of this later."
          initial={{ ...EMPTY_PROFILE, characterName: "" }}
          professions={professions}
          submitLabel="Create my profile"
          onSubmit={signUpCrafter}
          notice={held ? heldNotice(held) : null}
          onSaved={(result) => {
            const outcome = result as SignUpResult;
            if ("held" in outcome) {
              // Nothing was created: the character is being kept for them. The note at the top follows.
              setHeld(outcome.held);
              router.refresh();
              return;
            }
            // The next step is adding recipes; the page reloads with the new profile.
            router.replace("/admin?welcome=1");
            router.refresh();
          }}
        />
      </div>
    </Frame>
  );
}
