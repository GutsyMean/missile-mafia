/**
 * Runs the game-data sync from the command line, writing through the Supabase
 * Management API. The site runs the same sync by itself every day and from
 * its "Check for game updates" button; this is for first-time setup.
 *
 *   SUPABASE_PROJECT_REF=<ref> pnpm db:sync
 */
import { loadLiveDataset } from "../src/lib/game-data/live";
import { managementApiStore } from "../src/lib/game-data/stores";
import { runSync } from "../src/lib/game-data/sync";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  console.error("Set SUPABASE_PROJECT_REF to the project's reference id.");
  process.exit(1);
}

async function main() {
  console.log("Downloading game data…");
  const result = await runSync({
    store: managementApiStore(ref!),
    trigger: "cli",
    load: () => loadLiveDataset(),
    batchSize: 250,
  });
  for (const warning of result.warnings) console.log(`  warning: ${warning}`);
  if (result.status !== "ok") {
    console.error(`Sync failed; nothing was changed: ${result.error}`);
    process.exit(1);
  }
  const { stats } = result;
  console.log(
    `Build ${stats.build}: ${stats.recipesTotal} recipes, ${stats.itemsTotal} items. ` +
      `Wrote ${stats.recipesWritten} recipes (${stats.newRecipes} new) and ${stats.itemsWritten} items; retired ${stats.removedRecipes}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
