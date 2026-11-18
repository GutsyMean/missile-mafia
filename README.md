# Missile Mafia Crafting

A site for the Missile Mafia guild in **World of Warcraft: Forever**. Guild members browse what the guild's crafters can make, with in-game tooltips and the materials each item needs. Crafters sign in with Discord to manage their own recipe list.

Visitors can look at everyone's recipes, at one crafter (with their profile: character, level, class and profession skill) or at one profession. The choice is part of the link, so `/?crafter=name` can be shared.

Every item shows the profession skill it needs. Recipes a crafter has the profession for but has not learned yet are listed too, greyed out and marked *Not available yet*, with where the recipe comes from; **Available now only** hides them. They are fetched one profession at a time, when a visitor picks a crafter or a profession, so the front page stays small however many crafters join. A guild with a single profession sees them straight away.

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

Members open the site, press **Become a Crafter** at the top and sign in with Discord. (Once a browser has seen a sign-in, the button reads **Crafter sign-in** there.) What happens next depends on a setting on the admin page's **Crafters** tab.

**Automatic approval on.** The admin enters the guild's Discord server ID (and, to limit it, a role ID). A member of that server who signs in is asked to set up a profile (character, class, level, professions and skill) and is then taken to the recipe import. They are listed at once; nobody has to approve them.

The check is made by the site's server, which asks Discord with the token issued for that sign-in, so membership cannot be claimed by the visitor. It is repeated at every sign-in: someone who has left the server can no longer sign up, though a profile they already made stays until an admin hides it. It needs `SUPABASE_SECRET_KEY`, because only the server may record Discord's answer.

**Automatic approval off** (the default), or the account is not in the server. The account waits under *Waiting for you* until an admin presses **Add as crafter**.

**Trainer recipes add themselves.** The site knows the skill at which a trainer teaches each recipe. When a crafter's skill in a profession reaches that level (set on their Profile tab, or read from the addon import), the recipe joins their list; training costs little, so they are taken to have it. The same happens when a game update adds a trainer recipe or an admin settles a level. Only settled levels count, plans from vendors, drops and quests are never added this way, nothing is removed automatically, and a recipe a crafter unticks stays off.

**Several characters.** One Discord login can hold several characters (up to eight), each listed on its own with its own professions and recipes. A member adds them with **Add character** on their own page and switches between them there; a character can also have more than one profession.

The same tab links or unlinks existing crafters, adds a crafter before the member has signed in, and hides a crafter from the public list. Changes take effect at once; nothing is redeployed. Signing in alone gives an account no rights.

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
