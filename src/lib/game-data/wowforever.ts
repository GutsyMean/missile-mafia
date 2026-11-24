/** Professions wowforever.be publishes a recipe table for. */
export const WOWFOREVER_RECIPE_PAGES = new Set([
  "alchemy",
  "blacksmithing",
  "cooking",
  "enchanting",
  "engineering",
  "first-aid",
  "leatherworking",
  "mining",
  "tailoring",
]);

/** The page listing a profession's recipes, with where each one is learned. */
export function wowForeverUrl(slug: string): string {
  return `https://wowforever.be/tradeskills/forever/${slug}/recipes/`;
}
