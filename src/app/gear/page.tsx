import { ProfessionWindow } from "@/components/profession-window/ProfessionWindow";
import { loadCraftables } from "@/lib/craftables/load";
import styles from "../page.module.css";

export const metadata = {
  title: "Best gear",
  description: "The best gear for your class, talent tree and level, slot by slot: what the guild can craft, and what drops or comes from quests.",
};

export default async function GearPage() {
  const doc = await loadCraftables();
  return (
    <main className={styles.workspace}>
      <ProfessionWindow doc={doc} view="gear" />
    </main>
  );
}
