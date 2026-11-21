import type { Faction } from "@/lib/craftables/types";
import type { CatalogRecipe, QuestFactionChoice } from "./types";

const NAME: Record<Faction, string> = { horde: "Horde", alliance: "Alliance" };

/** Whether a quest is one of the ways to get this recipe, so its faction is worth recording. */
export function hasQuestSource(recipe: Pick<CatalogRecipe, "acquisition">): boolean {
  return recipe.acquisition.split(" ").includes("quest");
}

/** The faction shown for a recipe: the admin's choice when there is one, else the wiki's. */
export function shownQuestFaction(
  recipe: Pick<CatalogRecipe, "questFactionWiki" | "questFactionOwner">,
): Faction | null {
  if (recipe.questFactionOwner === "none") return null;
  return recipe.questFactionOwner ?? recipe.questFactionWiki ?? null;
}

/** The choices an admin has, the first being "leave it to the wiki". */
export function questFactionChoices(
  recipe: Pick<CatalogRecipe, "questFactionWiki">,
): { value: QuestFactionChoice | ""; label: string }[] {
  const wiki = recipe.questFactionWiki ? `${NAME[recipe.questFactionWiki]} only` : "not stated";
  return [
    { value: "", label: `Wiki: ${wiki}` },
    { value: "horde", label: "Horde only" },
    { value: "alliance", label: "Alliance only" },
    { value: "none", label: "Both factions" },
  ];
}
