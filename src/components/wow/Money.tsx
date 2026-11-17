import styles from "./wow.module.css";

/** An amount of copper shown the way the game does: gold, silver and copper coins. */
export function Money({ copper }: { copper: number }) {
  const parts: [number, string, string][] = [
    [Math.floor(copper / 10000), "gold", "gold"],
    [Math.floor((copper % 10000) / 100), "silver", "silver"],
    [copper % 100, "copper", "copper"],
  ];
  const shown = parts.filter(([amount]) => amount > 0);
  if (shown.length === 0) shown.push(parts[2]);
  return (
    <span className={styles.money}>
      {shown.map(([amount, coin, label]) => (
        <span key={coin} className={styles.coin} data-coin={coin}>
          {amount}
          <span className={styles.srOnly}> {label}</span>
        </span>
      ))}
    </span>
  );
}
