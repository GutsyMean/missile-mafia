import type { ReactNode } from "react";
import { MAX_SKILL } from "@/lib/craftables/types";
import styles from "./wow.module.css";

interface Props {
  skill: number;
  /** What a full bar stands for. */
  max?: number;
  /** What the bar measures, for those who cannot see it: "Damien: Blacksmithing 145". */
  label: string;
  /** What is written on the bar. */
  children: ReactNode;
  className?: string;
}

/** The game's profession skill bar: how far along a skill is, filled from the left. */
export function SkillBar({ skill, max = MAX_SKILL, label, children, className }: Props) {
  return (
    <div
      className={`${styles.skillBar} ${className ?? ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(skill, max)}
    >
      <div className={styles.skillBarFill} style={{ width: `${Math.min(100, (skill / max) * 100)}%` }} />
      <span className={styles.skillBarText}>{children}</span>
    </div>
  );
}
