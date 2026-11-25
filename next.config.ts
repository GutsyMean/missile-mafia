import type { NextConfig } from "next";

/** What a link to the crafting list can carry. Links from before the site had sections put these on the front page. */
const CRAFTING_KEYS = ["crafter", "prof", "q", "slot", "type", "stat", "min", "max", "tradeable", "available", "sort", "recipe", "item"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Old links keep working: the front page once was the crafting list, and gear was chosen there too.
  // What the link carried goes along to the page it now belongs to.
  redirects: async () => [
    ...["/", "/crafting"].map((source) => ({
      source,
      has: [{ type: "query" as const, key: "class" }],
      destination: "/gear",
      permanent: false,
    })),
    ...CRAFTING_KEYS.map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/crafting",
      permanent: false,
    })),
  ],
};

export default nextConfig;
