import { factionNote, sourceParts } from "@/lib/craftables/pending";
import type { Faction } from "@/lib/craftables/types";
import styles from "./wow.module.css";

interface Props {
  recipe: { acquisition?: string; acquisitionText?: string | null; questFaction?: Faction | null };
}

/** Where a recipe comes from, with a coloured mark when its quest is for one faction only. */
export function SourceText({ recipe }: Props) {
  const { kind, detail } = sourceParts(recipe);
  const note = factionNote(recipe);
  return (
    <>
      {kind}
      {note ? (
        <>
          {" "}
          <span className={styles.faction} data-faction={note.faction}>
            ({note.text})
          </span>
        </>
      ) : null}
      {detail ? ` · ${detail}` : null}
    </>
  );
}
