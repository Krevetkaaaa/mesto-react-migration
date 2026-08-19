-- Close the remaining actionable Preview database advisor findings without
-- widening Data API access. Informational unused-index and intentionally
-- policy-free service-only table findings remain documented exceptions.

alter function public.touch_updated_at() set search_path = '';
alter function public.guard_media_staging_tombstone() set search_path = '';

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites"
  on public.favorites for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Merchants read own memberships" on public.venue_memberships;
create policy "Merchants read own memberships"
  on public.venue_memberships for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists audit_log_actor_id_idx
  on public.audit_log(actor_id) where actor_id is not null;
create index if not exists favorites_venue_id_idx
  on public.favorites(venue_id) where venue_id is not null;
create index if not exists review_submissions_submitted_by_idx
  on public.review_submissions(submitted_by) where submitted_by is not null;
create index if not exists review_submissions_venue_id_idx
  on public.review_submissions(venue_id) where venue_id is not null;
create index if not exists reviews_author_id_idx
  on public.reviews(author_id) where author_id is not null;
create index if not exists reviews_venue_id_idx
  on public.reviews(venue_id) where venue_id is not null;
create index if not exists venue_submissions_submitted_by_idx
  on public.venue_submissions(submitted_by) where submitted_by is not null;
create index if not exists venues_created_by_idx
  on public.venues(created_by) where created_by is not null;
create index if not exists venues_owner_id_idx
  on public.venues(owner_id) where owner_id is not null;

notify pgrst, 'reload schema';
