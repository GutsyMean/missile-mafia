# Missile Mafia Crafting

A site for the Missile Mafia guild in **World of Warcraft: Forever**. Guild members browse what the guild's crafters can make, with in-game tooltips and the materials each item needs. Crafters sign in with Discord to manage their own recipe list.

- **Stack:** Next.js 16 on Vercel, Supabase (Postgres, Auth, Storage).
- **Look:** the game's trainer window, drawn with art extracted from the game's own files.

## How the game data stays current

Nothing about the game is compiled into the site. Recipes, items, tooltips, unlock levels and icons live in the database and are refreshed by a sync that is part of the site:

- it runs **once a day** on Vercel's schedule (`/api/sync`), and
- a site admin can run it at any time with **Check for game updates** on the admin page.

Each run downloads the current game tables, works out what changed, writes only the differences and refreshes the public page. New recipes show up marked **New** on the crafter's checklist. A failed or broken download changes nothing and is reported on the admin page.

### Where the data comes from

| Data | Source |
|---|---|
| Recipes, reagents, items, stats | The game's own data tables, as published by [wago.tools](https://wago.tools) for the `wowf` product |
| Trainer unlock levels | [wowforever.be](https://wowforever.be) and the [Warcraft Wiki](https://warcraft.wiki.gg) (CC BY-SA) |
| Icons and window art | The game's texture files, via wago.tools |

Trainer unlock levels are decided by the game server and are not in the game tables. A level is shown only when the two sources agree (or the level printed on the plans settles it). Otherwise the recipe is marked as not confirmed, and a site admin can enter what their trainer shows. Levels are never estimated.

## Setup

1. **Supabase.** Create a project, then apply the schema and load the game data:
   ```sh
   SUPABASE_PROJECT_REF=<project ref> SUPABASE_ACCESS_TOKEN=<personal access token> pnpm db:migrate
   SUPABASE_PROJECT_REF=<project ref> SUPABASE_ACCESS_TOKEN=<personal access token> pnpm db:sync
   ```
2. **Discord sign-in.** Create a Discord application, add `https://<project ref>.supabase.co/auth/v1/callback` as a redirect, and enter its client ID and secret under Supabase → Authentication → Providers → Discord. Add the site's address under Authentication → URL Configuration.
3. **Vercel.** Set these environment variables on the project:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | The project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable (anon) key |
   | `SUPABASE_SECRET_KEY` | The secret (service role) key. Server only: the sync writes with it |
   | `CRON_SECRET` | Any long random string. Vercel sends it to the daily sync |

4. **Link the first crafter.** After signing in once with Discord, link that account to a crafter and make it a site admin (SQL editor):
   ```sql
   insert into public.crafters (slug, character_name, user_id)
   select 'my-character', 'My Character', id from auth.users order by created_at limit 1;
   insert into public.app_admins (user_id) select id from auth.users order by created_at limit 1;
   ```
   This is the only time SQL is needed. From then on, crafters are managed on the site (see below).

## Adding guild members as crafters

1. The member opens the site, follows **Crafter sign-in** at the bottom and signs in with Discord.
2. A site admin opens the admin page's **Crafters** tab. The member is listed under *Waiting for you*; **Add as crafter** makes them one.
3. The member reloads the page and manages their own recipe list.

The same tab links or unlinks existing crafters, adds a crafter before the member has signed in, and hides a crafter from the public list. Changes take effect at once; nothing is redeployed. Signing in gives an account no rights until an admin links it.

## Working on it

```sh
pnpm install
CRAFTABLES_FIXTURE=1 pnpm dev   # runs on sample data, no database needed
```

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests, including tooltips checked line by line against in-game screenshots |
| `pnpm test:db` | Schema and row-level-security tests on a throwaway local Postgres |
| `pnpm test:e2e` | Browser tests of the crafting window on sample data |
| `pnpm game-data` | Dry run: builds the full dataset from the live game tables and prints a summary |
| `pnpm ui-textures` | Re-extracts the window art into `public/ui/` |

## Notes

- The game's fonts (Friz Quadrata, Arial Narrow) are commercially licensed and are not included. The site uses them when the visitor has them installed, and free look-alikes otherwise.
- Missile Mafia is a fan site, not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft and its art are trademarks and © Blizzard Entertainment.
