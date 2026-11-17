import type { ReactNode } from "react";
import styles from "./wow.module.css";

interface Props {
  title: string;
  /** Icon shown in the round portrait at the top left, like an NPC's face in game. */
  portraitFileId?: number;
  children: ReactNode;
  className?: string;
}

/** The game's standard window: bronze frame, dark title bar, round portrait. */
export function Frame({ title, portraitFileId, children, className }: Props) {
  return (
    <section className={`${styles.frame} ${className ?? ""}`} aria-label={title}>
      {portraitFileId ? (
        <span className={styles.portrait} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/icons/${portraitFileId}.webp`} alt="" width={40} height={40} />
        </span>
      ) : null}
      <header className={styles.titleBar}>
        <h1 className={styles.title}>{title}</h1>
      </header>
      {children}
    </section>
  );
}
