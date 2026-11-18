-- Trainer recipes join a crafter's list by themselves.
--
-- The site knows at which skill a trainer teaches each recipe. Training costs
-- little, so a crafter who reaches that skill is taken to have the recipe:
--
--   * when a crafter's skill in a profession is set or raised (profile, addon
--     import, sign-up), every trainer recipe up to that skill is added;
--   * when the game data adds a trainer recipe, or its level becomes known or
--     is corrected, it is added for every crafter already at that skill.
--
-- Only levels that are settled count: confirmed by the sources, or set by an
-- admin. Plans from vendors, drops and quests are never added this way.
-- Nothing is ever removed automatically, and a recipe a crafter takes off
-- their list stays off until they put it back.

alter table public.crafter_recipes drop constraint crafter_recipes_source_check;
alter table public.crafter_recipes
  add constraint crafter_recipes_source_check check (source in ('manual', 'bulk', 'import', 'auto'));

-- Recipes a crafter removed by hand, so that they are not added again.
create table public.crafter_recipe_skips (
  crafter_id uuid not null references public.crafters (id) on delete cascade,
  recipe_id integer not null references public.recipes (id) on delete cascade,
  primary key (crafter_id, recipe_id)
);
create index crafter_recipe_skips_recipe_id_idx on public.crafter_recipe_skips (recipe_id);

alter table public.crafter_recipe_skips enable row level security;
revoke all on public.crafter_recipe_skips from anon, authenticated;
grant select, insert, delete on public.crafter_recipe_skips to authenticated;
grant all on public.crafter_recipe_skips to service_role;

create policy "owners can see what they took off" on public.crafter_recipe_skips
  for select to authenticated
  using (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
create policy "owners can take recipes off" on public.crafter_recipe_skips
  for insert to authenticated
  with check (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));
create policy "owners can put recipes back" on public.crafter_recipe_skips
  for delete to authenticated
  using (exists (
    select 1 from public.crafters c where c.id = crafter_id and c.user_id = (select auth.uid())));

-- The skill at which a trainer teaches a recipe, when that is settled.
-- Null for anything else: other sources, unsettled levels, retired recipes.
create or replace function private.trainer_unlock_level(r public.recipes)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when r.status = 'ok'
      and r.acquisition ~ '(^| )(trainer|starter)( |$)'
      and (r.learn_skill_owner is not null or r.learn_skill_status = 'confirmed')
    then coalesce(r.learn_skill_owner, r.learn_skill)
  end
$$;

-- Adds every trainer recipe of a profession up to a skill to one crafter's list.
create or replace function private.add_trainer_unlocks(p_crafter_id uuid, p_profession_id integer, p_skill integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  with added as (
    insert into public.crafter_recipes (crafter_id, recipe_id, source)
    select p_crafter_id, r.id, 'auto'
    from public.recipes r
    where r.profession_id = p_profession_id
      and private.trainer_unlock_level(r) <= p_skill
      and not exists (
        select 1 from public.crafter_recipe_skips s where s.crafter_id = p_crafter_id and s.recipe_id = r.id
      )
    on conflict (crafter_id, recipe_id) do nothing
    returning 1
  )
  select count(*)::integer from added
$$;

create or replace function private.on_crafter_skill_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.skill > 0 then
    perform private.add_trainer_unlocks(new.crafter_id, new.profession_id, new.skill);
  end if;
  return null;
end;
$$;

create or replace function private.on_recipe_unlock_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level integer := private.trainer_unlock_level(new);
begin
  if v_level is not null then
    insert into public.crafter_recipes (crafter_id, recipe_id, source)
    select cp.crafter_id, new.id, 'auto'
    from public.crafter_professions cp
    where cp.profession_id = new.profession_id
      and cp.skill >= v_level
      and not exists (
        select 1 from public.crafter_recipe_skips s where s.crafter_id = cp.crafter_id and s.recipe_id = new.id
      )
    on conflict (crafter_id, recipe_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger crafter_professions_add_trainer_unlocks
  after insert or update of skill on public.crafter_professions
  for each row execute function private.on_crafter_skill_change();

create trigger recipes_add_trainer_unlocks
  after insert or update of learn_skill, learn_skill_owner, learn_skill_status, acquisition, status on public.recipes
  for each row execute function private.on_recipe_unlock_change();

revoke all on function private.trainer_unlock_level(public.recipes) from public, anon, authenticated;
revoke all on function private.add_trainer_unlocks(uuid, integer, integer) from public, anon, authenticated;
revoke all on function private.on_crafter_skill_change() from public, anon, authenticated;
revoke all on function private.on_recipe_unlock_change() from public, anon, authenticated;

-- Ticking and unticking by hand now also records what was taken off.
create or replace function public.set_crafter_recipes(
  p_crafter_id uuid,
  p_add integer[],
  p_remove integer[],
  p_source text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_added integer;
  v_removed integer;
begin
  if not exists (
    select 1 from public.crafters c
    where c.id = p_crafter_id and c.user_id = (select auth.uid())
  ) then
    raise exception 'You can only change your own crafter' using errcode = '42501';
  end if;

  delete from public.crafter_recipes cr
  where cr.crafter_id = p_crafter_id and cr.recipe_id = any (coalesce(p_remove, '{}'));
  get diagnostics v_removed = row_count;

  -- What is taken off stays off; what is put back is welcome again.
  insert into public.crafter_recipe_skips (crafter_id, recipe_id)
  select p_crafter_id, r.id
  from public.recipes r
  where r.id = any (coalesce(p_remove, '{}'))
  on conflict (crafter_id, recipe_id) do nothing;
  delete from public.crafter_recipe_skips s
  where s.crafter_id = p_crafter_id and s.recipe_id = any (coalesce(p_add, '{}'));

  insert into public.crafter_recipes (crafter_id, recipe_id, source)
  select p_crafter_id, r.id, p_source
  from public.recipes r
  where r.id = any (coalesce(p_add, '{}')) and r.status <> 'removed'
  on conflict (crafter_id, recipe_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('added', v_added, 'removed', v_removed);
end;
$$;

revoke all on function public.set_crafter_recipes(uuid, integer[], integer[], text) from public, anon;
grant execute on function public.set_crafter_recipes(uuid, integer[], integer[], text) to authenticated;

-- Crafters already here get the trainer recipes for the skill they have now.
select private.add_trainer_unlocks(cp.crafter_id, cp.profession_id, cp.skill)
from public.crafter_professions cp
where cp.skill > 0;
