import styles from "./wow.module.css";

const QUALITY_FRAME: Record<number, string> = {
  2: "uncommon",
  3: "rare",
  4: "epic",
  5: "legendary",
};

interface Props {
  fileId: number;
  quality?: number;
  size?: number;
  /** Shown on the icon's corner, e.g. how many a craft makes. */
  count?: number;
}

/** A game icon in the quality-coloured frame the game draws around item slots. */
export function ItemIcon({ fileId, quality = 1, size = 36, count }: Props) {
  const frame = QUALITY_FRAME[quality] ?? "common";
  return (
    <span className={styles.icon} style={{ width: size, height: size }} data-frame={frame}>
      {/* Icons come from the site's own converter route; next/image would only re-encode them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/icons/${fileId > 0 ? fileId : 134400}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" />
      {count && count > 1 ? <span className={styles.iconCount}>{count}</span> : null}
    </span>
  );
}
