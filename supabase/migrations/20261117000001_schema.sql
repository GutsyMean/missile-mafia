-- Missile Mafia crafting site: tables.
--
-- Game data (professions, items, recipes, reagents) is written only by the
-- game-data sync. Crafter data is written by signed-in crafters under RLS.

create table public.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron', 'manual', 'cli')),
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  build text,
  stats jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text
);

create table public.professions (
  id integer primary key, -- the game's skill line id (164 = Blacksmithing)
  slug text not null unique,
  name text not null,
  icon_file_id integer not null default 0,
  -- other skill lines that belong to this profession (addon exports use them)
  child_skill_line_ids integer[] not null default '{}'
);

create table public.items (
  id integer primary key,
  name text not null,
  quality smallint not null,
  icon_file_id integer not null default 0,
  class_id smallint not null,
  subclass_id smallint not null,
  inventory_type smallint not null,
  item_level integer not null,
  required_level integer not null,
  bonding smallint not null,
  -- Bind on Pickup (1) and quest (4) items bind to whoever makes them.
  is_tradeable boolean generated always as (bonding not in (1, 4)) stored,
  sell_price integer not null default 0,
  slot_name text,
  type_name text,
  armor integer,
  damage jsonb,
  stats jsonb not null default '[]'::jsonb,
  tooltip jsonb not null,
  tooltip_complete boolean not null default true,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id integer primary key, -- the recipe's spell id
  profession_id integer not null references public.professions (id),
  name text not null,
  icon_file_id integer not null default 0,
  -- No foreign key: the game lists some recipes whose item it does not describe.
  crafted_item_id integer,
  crafted_count integer not null default 1,
  effect_text text,
  skill_yellow integer not null,
  skill_green integer not null,
  skill_grey integer not null,
  recipe_item_id integer,
  -- Unlock level from the sources; null unless they agree. Never estimated.
  learn_skill integer,
  learn_skill_status text not null default 'unconfirmed'
    check (learn_skill_status in ('confirmed', 'single_source', 'disputed', 'unconfirmed')),
  learn_skill_candidates jsonb not null default '{}'::jsonb,
  -- A site admin's correction from what the trainer shows. The sync never touches it.
  learn_skill_owner integer check (learn_skill_owner between 1 and 450),
  acquisition text not null default 'unknown',
  acquisition_text text,
  training_cost integer,
  category text not null,
  category_order integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'no_item_data', 'removed')),
  content_hash text not null,
  first_seen_run_id bigint references public.sync_runs (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_profession_id_idx on public.recipes (profession_id);
create index recipes_crafted_item_id_idx on public.recipes (crafted_item_id);
create index recipes_first_seen_run_id_idx on public.recipes (first_seen_run_id);

create table public.recipe_reagents (
  recipe_id integer not null references public.recipes (id) on delete cascade,
  sort smallint not null,
  item_id integer not null,
  quantity integer not null check (quantity > 0),
  primary key (recipe_id, sort)
);
create index recipe_reagents_item_id_idx on public.recipe_reagents (item_id);

-- A crafter is one character. One account may own several (alts), so user_id
-- is deliberately not unique.
create table public.crafters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  slug text not null unique,
  character_name text not null check (char_length(character_name) between 1 and 40),
  realm text check (char_length(realm) <= 40),
  faction text check (faction in ('Alliance', 'Horde')),
  class text check (char_length(class) <= 20),
  level integer check (level between 1 and 80),
  note text check (char_length(note) <= 500),
  is_listed boolean not null default true,
  created_at timestamptz not null default now()
);
create index crafters_user_id_idx on public.crafters (user_id);

create table public.crafter_professions (
  crafter_id uuid not null references public.crafters (id) on delete cascade,
  profession_id integer not null references public.professions (id),
  skill integer not null default 0 check (skill between 0 and 450),
  primary key (crafter_id, profession_id)
);
create index crafter_professions_profession_id_idx on public.crafter_professions (profession_id);

create table public.crafter_recipes (
  crafter_id uuid not null references public.crafters (id) on delete cascade,
  recipe_id integer not null references public.recipes (id),
  source text not null default 'manual' check (source in ('manual', 'bulk', 'import')),
  added_at timestamptz not null default now(),
  primary key (crafter_id, recipe_id)
);
create index crafter_recipes_recipe_id_idx on public.crafter_recipes (recipe_id);

-- Who may run the game-data sync from the site and correct unlock levels.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
