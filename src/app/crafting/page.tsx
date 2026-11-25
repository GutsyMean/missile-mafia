import { ProfessionWindow } from "@/components/profession-window/ProfessionWindow";
import { unlearnedWithPage } from "@/lib/craftables/filter";
import { loadCraftables, loadUnlearned } from "@/lib/craftables/load";
import type { UnlearnedDoc } from "@/lib/craftables/types";
import styles from "../page.module.css";

export const metadata = {
  title: "Crafting",
  description: "Everything Missile Mafia's crafters can make, with in-game tooltips, the materials each item needs and who to ask.",
};

export default async function CraftingPage() {
  const doc = await loadCraftables();
  // A guild with one profession gets its recipes still to learn with the page; otherwise they are fetched once it is up.
  const unlearned: Record<number, UnlearnedDoc> = Object.fromEntries(
    await Promise.all(unlearnedWithPage(doc).map(async (id) => [id, await loadUnlearned(id)] as const)),
  );
  return (
    <main className={styles.workspace}>
      <ProfessionWindow doc={doc} initialUnlearned={unlearned} view="crafting" />
    </main>
  );
}
