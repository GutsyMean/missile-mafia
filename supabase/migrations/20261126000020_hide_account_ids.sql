-- The account behind a crafter is no longer readable through the API.
--
-- Listed crafters stay public, without the column that says who manages
-- them. The row level security rules on this table still use it, which they
-- may; everything else was moved off it in the migration before this one.

revoke select on public.crafters from anon, authenticated;
grant select (id, slug, character_name, realm, faction, class, level, note, is_listed, created_at)
  on public.crafters to anon, authenticated;
