-- Signed upload URLs outlive early release/finalization cleanup. Preserve an
-- immutable receipt until the provider token is expired plus application grace,
-- so a late PUT is always found and deleted by the staging reaper.

alter table public.media_assets
  add column if not exists staging_token_expires_at timestamptz;

-- Older attached/published rows had expires_at repurposed by workflow RPCs.
-- created_at + the original two-hour token lifetime is the conservative source.
update public.media_assets
set staging_token_expires_at = greatest(expires_at, created_at + interval '2 hours')
where staging_token_expires_at is null;

-- Rolling deployments may already have cleared the old cleanup bit after an
-- early finalize/release even though its reusable signed token is still live.
-- Re-arm every conservative live-token receipt before installing the guard.
update public.media_assets
set staging_cleanup_pending = true
where not staging_cleanup_pending
  and clock_timestamp() < staging_token_expires_at + interval '5 minutes';

alter table public.media_assets
  alter column staging_token_expires_at set default (now() + interval '2 hours'),
  alter column staging_token_expires_at set not null;

alter table public.media_assets
  add constraint media_assets_staging_token_expiry_check
  check (staging_token_expires_at >= created_at) not valid;

alter table public.media_assets
  validate constraint media_assets_staging_token_expiry_check;

create index if not exists media_assets_staging_cleanup_due_idx
  on public.media_assets(staging_token_expires_at)
  where staging_cleanup_pending;

create or replace function public.guard_media_staging_tombstone() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.staging_cleanup_pending then
      raise exception 'Signed upload tombstone is still active';
    end if;
    return old;
  end if;
  if new.staging_token_expires_at is distinct from old.staging_token_expires_at then
    raise exception 'Signed upload expiry is immutable';
  end if;
  if old.staging_cleanup_pending and not new.staging_cleanup_pending
    and clock_timestamp() < old.staging_token_expires_at + interval '5 minutes' then
    raise exception 'Signed upload tombstone grace is still active';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_media_staging_tombstone() from public, anon, authenticated;

drop trigger if exists media_assets_guard_staging_tombstone_update on public.media_assets;
create trigger media_assets_guard_staging_tombstone_update
  before update of staging_token_expires_at, staging_cleanup_pending on public.media_assets
  for each row execute function public.guard_media_staging_tombstone();

drop trigger if exists media_assets_guard_staging_tombstone_delete on public.media_assets;
create trigger media_assets_guard_staging_tombstone_delete
  before delete on public.media_assets
  for each row execute function public.guard_media_staging_tombstone();

notify pgrst, 'reload schema';
