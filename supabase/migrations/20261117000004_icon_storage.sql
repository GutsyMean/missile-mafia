-- Public bucket for item icons. The site converts each icon from the game's own
-- file the first time it is needed and keeps it here. Anyone can read; only the
-- service role (the site's server) can write.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('icons', 'icons', true)
    on conflict (id) do update set public = true;
  end if;
end
$$;
