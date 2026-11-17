-- Row level security and least-privilege grants.
--
-- Visitors (anon) can read everything public and write nothing.
-- A signed-in crafter can change only rows of crafters they own.
-- Game data is written only by the sync, which runs as the service role.

alter table public.sync_runs enable row level security;
alter table public.professions enable row level security;
alter table public.items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_reagents enable row level security;
alter table public.crafters enable row level security;
alter table public.crafter_professions enable row level security;
alter table public.crafter_recipes enable row level security;
alter table public.app_admins enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on
  public.sync_runs, public.professions, public.items, public.recipes, public.recipe_reagents,
  public.crafters, public.crafter_professions, public.crafter_recipes, public.app_admins
from anon, authenticated;

grant select on
  public.sync_runs, public.professions, public.items, public.recipes, public.recipe_reagents,
  public.crafters, public.crafter_professions, public.crafter_recipes
to anon, authenticated;
grant select on public.app_admins to authenticated;

grant update (character_name, realm, faction, class, level, note) on public.crafters to authenticated;
grant insert, update, delete on public.crafter_professions, public.crafter_recipes to authenticated;
grant update (learn_skill_owner) on public.recipes to authenticated;

grant all on
  public.sync_runs, public.professions, public.items, public.recipes, public.recipe_reagents,
  public.crafters, public.crafter_professions, public.crafter_recipes, public.app_admins
to service_role;

-- Game data and sync history: readable by everyone.
create policy "anyone can read sync runs" on public.sync_runs
  for select to anon, authenticated using (true);
create policy "anyone can read professions" on public.professions
  for select to anon, authenticated using (true);
create policy "anyone can read items" on public.items
  for select to anon, authenticated using (true);
create policy "anyone can read recipes" on public.recipes
  for select to anon, authenticated using (true);
create policy "anyone can read reagents" on public.recipe_reagents
  for select to anon, authenticated using (true);

-- Admins may correct an unlock level (the column grant limits what they can touch).
create policy "admins can correct unlock levels" on public.recipes
  for update to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())));

create policy "users can see their own admin row" on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Crafters: listed ones are public; owners always see and may edit their own.
create policy "listed crafters are public" on public.crafters
  for select to anon, authenticated
  using (is_listed or user_id = (select auth.uid()));
create policy "owners can edit their crafter" on public.crafters
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "anyone can read crafter professions" on public.crafter_professions
  for select to anon, authenticated using (true);
create policy "owners can add crafter professions" on public.crafter_professions
  for insert to authenticated
  with check (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
create policy "owners can change crafter professions" on public.crafter_professions
  for update to authenticated
  using (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
create policy "owners can remove crafter professions" on public.crafter_professions
  for delete to authenticated
  using (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));

create policy "anyone can read crafter recipes" on public.crafter_recipes
  for select to anon, authenticated using (true);
create policy "owners can add crafter recipes" on public.crafter_recipes
  for insert to authenticated
  with check (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
create policy "owners can remove crafter recipes" on public.crafter_recipes
  for delete to authenticated
  using (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
