-- Supabase Data API grants are opt-in on new projects and will become opt-in
-- for all projects. Mesto uses the service role only from trusted server code;
-- browser roles must not reach application relations or RPCs directly.

revoke all on schema public from public, anon, authenticated, service_role;
grant usage on schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter table public.venues enable row level security;
alter table public.venue_submissions enable row level security;
alter table public.media_assets enable row level security;
alter table public.review_submissions enable row level security;
alter table public.reviews enable row level security;
alter table public.profiles enable row level security;
alter table public.external_identities enable row level security;
alter table public.favorites enable row level security;
alter table public.venue_memberships enable row level security;
alter table public.menu_items enable row level security;
alter table public.promotions enable row level security;
alter table public.audit_log enable row level security;

revoke all on table public.venues from public, anon, authenticated, service_role;
revoke all on table public.venue_submissions from public, anon, authenticated, service_role;
revoke all on table public.media_assets from public, anon, authenticated, service_role;
revoke all on table public.review_submissions from public, anon, authenticated, service_role;
revoke all on table public.reviews from public, anon, authenticated, service_role;
revoke all on table public.profiles from public, anon, authenticated, service_role;
revoke all on table public.external_identities from public, anon, authenticated, service_role;
revoke all on table public.favorites from public, anon, authenticated, service_role;
revoke all on table public.venue_memberships from public, anon, authenticated, service_role;
revoke all on table public.menu_items from public, anon, authenticated, service_role;
revoke all on table public.promotions from public, anon, authenticated, service_role;
revoke all on table public.audit_log from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.venues to service_role;
grant select, insert on table public.venue_submissions to service_role;
grant select, insert, update, delete on table public.media_assets to service_role;
grant select, insert on table public.review_submissions to service_role;
grant select on table public.reviews to service_role;
grant select, insert, update on table public.profiles to service_role;
grant select, insert on table public.external_identities to service_role;
grant select, insert, update, delete on table public.favorites to service_role;
grant select, insert, update, delete on table public.venue_memberships to service_role;
grant select, insert, update, delete on table public.menu_items to service_role;
grant select, insert, update, delete on table public.promotions to service_role;
grant insert on table public.audit_log to service_role;

revoke all on sequence public.audit_log_id_seq from public, anon, authenticated, service_role;
grant usage on sequence public.audit_log_id_seq to service_role;

-- These functions already qualify every application relation. Pinning an empty
-- search_path removes public-schema name resolution from privileged execution.
alter function public.moderate_venue_submission(uuid,text,text,text) set search_path = '';
alter function public.create_venue_submission_with_media(jsonb,uuid[],uuid) set search_path = '';
alter function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid) set search_path = '';
alter function public.delete_venue_with_media(uuid) set search_path = '';
alter function public.moderate_review_submission(uuid,text,text,text) set search_path = '';

revoke execute on function public.touch_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.guard_media_staging_tombstone() from public, anon, authenticated, service_role;
revoke execute on function public.public_catalog_summary() from public, anon, authenticated, service_role;
revoke execute on function public.moderate_venue_submission(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) from public, anon, authenticated, service_role;
revoke execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.delete_venue_with_media(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.moderate_review_submission(uuid,text,text,text) from public, anon, authenticated, service_role;

grant execute on function public.public_catalog_summary() to service_role;
grant execute on function public.moderate_venue_submission(uuid,text,text,text) to service_role;
grant execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) to service_role;
grant execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.delete_venue_with_media(uuid) to service_role;
grant execute on function public.moderate_review_submission(uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';
