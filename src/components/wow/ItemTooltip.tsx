import type { TooltipLine } from "@/lib/game-data/types";
import { Money } from "./Money";
import styles from "./wow.module.css";

interface Props {
  lines: TooltipLine[];
  quality: number;
  sellPrice?: number;
  /** Shown when part of the tooltip could not be reproduced from the game data. */
  incomplete?: boolean;
}

/** An item tooltip laid out like the game's: one line per row, optional right-aligned half. */
export function ItemTooltip({ lines, quality, sellPrice, incomplete }: Props) {
  return (
    <div className={styles.tooltip}>
      {lines.map((line, index) => (
        <div
          key={index}
          className={styles.tooltipLine}
          data-color={line.color === "quality" ? `q${quality}` : line.color}
          data-name={index === 0 ? "" : undefined}
        >
          <span>{line.text}</span>
          {line.right ? <span>{line.right}</span> : null}
        </div>
      ))}
      {sellPrice && sellPrice > 0 ? (
        <div className={styles.tooltipLine} data-color="white">
          <span>
            Sell Price: <Money copper={sellPrice} />
          </span>
        </div>
      ) : null}
      {incomplete ? (
        <div className={styles.tooltipLine} data-color="grey">
          <span>Some effects of this item are not shown here.</span>
        </div>
      ) : null}
    </div>
  );
}
