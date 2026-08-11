create table if not exists public.media_assets (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  submission_id uuid references public.venue_submissions(id) on delete restrict,
  status text not null default 'signed' check (status in ('signed','processing','processed','attached','publishing','published','cleanup_pending','failed')),
  declared_content_type text not null check (declared_content_type in ('image/jpeg','image/png','image/webp')),
  declared_size integer not null check (declared_size between 1 and 6291456),
  actual_content_type text check (actual_content_type is null or actual_content_type in ('image/jpeg','image/png','image/webp')),
  width integer check (width is null or width between 1 and 8192),
  height integer check (height is null or height between 1 and 8192),
  staging_path text not null unique,
  review_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(review_manifest) = 'object'),
  public_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(public_manifest) = 'object'),
  staging_cleanup_pending boolean not null default true,
  review_cleanup_pending boolean not null default false,
  public_cleanup_pending boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width is null or height is null or width::bigint * height::bigint <= 40000000)
);

alter table public.venue_submissions
  add column if not exists approved_venue_id uuid references public.venues(id) on delete set null;
create unique index if not exists venue_submissions_approved_venue_uidx
  on public.venue_submissions(approved_venue_id) where approved_venue_id is not null;

create index if not exists media_assets_owner_status_idx on public.media_assets(owner_id, status, created_at);
create index if not exists media_assets_submission_idx on public.media_assets(submission_id) where submission_id is not null;
create index if not exists media_assets_expiry_idx on public.media_assets(expires_at)
  where (submission_id is null and status in ('signed','processing','processed','failed')) or status = 'cleanup_pending';
create index if not exists media_assets_cleanup_idx on public.media_assets(status, created_at)
  where status in ('cleanup_pending','failed') or staging_cleanup_pending or review_cleanup_pending or public_cleanup_pending;

drop trigger if exists media_assets_touch_updated_at on public.media_assets;
create trigger media_assets_touch_updated_at before update on public.media_assets
for each row execute function public.touch_updated_at();

alter table public.media_assets enable row level security;
revoke all on table public.media_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.media_assets to service_role;

create or replace function public.create_venue_submission_with_media(
  p_payload jsonb,
  p_media_ids uuid[],
  p_owner uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  normalized_ids uuid[] := coalesce(p_media_ids, '{}'::uuid[]);
  media_count integer;
  new_submission_id uuid;
begin
  if p_owner is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid submission payload';
  end if;
  if cardinality(normalized_ids) > 6 then
    raise exception 'At most six media assets are allowed';
  end if;

  perform 1 from public.media_assets where id = any(normalized_ids) for update;
  select count(*) into media_count
  from public.media_assets
  where id = any(normalized_ids)
    and owner_id = p_owner
    and status = 'processed'
    and submission_id is null;
  if media_count <> cardinality(normalized_ids) then
    raise exception 'Media assets are missing, duplicated, expired, or already attached';
  end if;

  insert into public.venue_submissions (
    submitted_by, contact_name, contact_email, title, city, category, cuisine,
    description, address, phone, website, hours, average_check, features, photos, status
  ) values (
    p_owner,
    coalesce(p_payload->>'contact_name',''), coalesce(p_payload->>'contact_email',''),
    coalesce(p_payload->>'title',''), coalesce(p_payload->>'city',''), coalesce(p_payload->>'category',''),
    coalesce(p_payload->>'cuisine',''), coalesce(p_payload->>'description',''), coalesce(p_payload->>'address',''),
    coalesce(p_payload->>'phone',''), coalesce(p_payload->>'website',''), coalesce(p_payload->>'hours',''),
    coalesce(p_payload->>'average_check',''), coalesce(p_payload->'features','[]'::jsonb), '{}'::text[], 'pending'
  ) returning id into new_submission_id;

  update public.media_assets
  set submission_id = new_submission_id,
      status = 'attached',
      expires_at = now()
  where id = any(normalized_ids);

  return jsonb_build_object('id', new_submission_id, 'status', 'pending');
end;
$$;

create or replace function public.moderate_venue_submission_with_media(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null,
  p_media_public_manifests jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item public.venue_submissions%rowtype;
  venue_id uuid;
  media_count integer;
  manifest_count integer;
  approved_photos text[] := '{}'::text[];
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Unsupported moderation decision';
  end if;
  if jsonb_typeof(coalesce(p_media_public_manifests, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid public media manifest';
  end if;

  select * into item from public.venue_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if item.status <> 'pending' then raise exception 'Submission already moderated'; end if;
  perform 1 from public.media_assets where submission_id = p_submission_id for update;
  select count(*) into media_count from public.media_assets where submission_id = p_submission_id;

  if p_decision = 'approved' then
    select count(*) into manifest_count from jsonb_object_keys(coalesce(p_media_public_manifests, '{}'::jsonb));
    if manifest_count <> media_count or exists (
      select 1 from public.media_assets media
      where media.submission_id = p_submission_id
        and (
          media.status <> 'publishing'
          or not (p_media_public_manifests ? (media.id::text))
          or coalesce(((p_media_public_manifests -> (media.id::text)) -> 'hero') ->> 'url','') !~ '^https://'
        )
    ) then
      raise exception 'Approved media manifest is incomplete';
    end if;

    update public.media_assets media
    set public_manifest = p_media_public_manifests -> (media.id::text),
        status = 'published',
        review_cleanup_pending = true,
        public_cleanup_pending = false
    where media.submission_id = p_submission_id;

    if media_count = 0 then
      approved_photos := item.photos;
    else
      select coalesce(array_agg(media.public_manifest->'hero'->>'url' order by media.created_at), '{}'::text[])
        into approved_photos
      from public.media_assets media
      where media.submission_id = p_submission_id;
    end if;

    update public.venue_submissions
    set photos = approved_photos,
        status = 'approved',
        moderation_note = coalesce(p_note,''),
        moderated_by = p_moderator,
        moderated_at = now()
    where id = p_submission_id;

    insert into public.venues (slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,source,status,created_by)
    values (
      regexp_replace(lower(item.title), '[^a-zа-яё0-9]+', '-', 'gi') || '-' || left(item.id::text,8),
      item.title,item.city,item.category,item.cuisine,item.description,item.address,item.phone,item.website,item.hours,item.average_check,item.features,approved_photos,'community','published',item.submitted_by
    ) returning id into venue_id;
    update public.venue_submissions set approved_venue_id = venue_id where id = p_submission_id;
  else
    if exists (select 1 from public.media_assets media where media.submission_id = p_submission_id and media.status = 'publishing') then
      raise exception 'Media publication is in progress';
    end if;
    update public.media_assets
    set status = 'cleanup_pending'
    where submission_id = p_submission_id and status = 'attached';
    update public.venue_submissions
    set status = 'rejected', moderation_note = coalesce(p_note,''), moderated_by = p_moderator, moderated_at = now()
    where id = p_submission_id;
  end if;

  return jsonb_build_object('submission_id', p_submission_id, 'status', p_decision, 'venue_id', venue_id);
end;
$$;

create or replace function public.delete_venue_with_media(
  p_venue_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
  claimed_media integer := 0;
begin
  select id into target_id from public.venues where id = p_venue_id for update;
  if not found then return jsonb_build_object('deleted', false, 'media_count', 0); end if;

  perform 1 from public.venue_submissions where approved_venue_id = p_venue_id for update;
  perform 1 from public.media_assets media
  where media.submission_id in (
    select submission.id from public.venue_submissions submission where submission.approved_venue_id = p_venue_id
  ) for update;
  if exists (
    select 1 from public.media_assets media
    where media.submission_id in (
      select submission.id from public.venue_submissions submission where submission.approved_venue_id = p_venue_id
    ) and media.status <> 'published'
  ) then raise exception 'Venue media is not deletable'; end if;

  update public.media_assets media
  set status = 'cleanup_pending', public_cleanup_pending = true, expires_at = now()
  where media.submission_id in (
    select submission.id from public.venue_submissions submission where submission.approved_venue_id = p_venue_id
  );
  get diagnostics claimed_media = row_count;
  update public.venue_submissions set photos = '{}'::text[] where approved_venue_id = p_venue_id;
  delete from public.venues where id = p_venue_id;
  return jsonb_build_object('deleted', true, 'media_count', claimed_media);
end;
$$;

revoke execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) from public, anon, authenticated;
revoke execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.delete_venue_with_media(uuid) from public, anon, authenticated;
grant execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) to service_role;
grant execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.delete_venue_with_media(uuid) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('mesto-media-staging','mesto-media-staging',false,6291456,array['image/jpeg','image/png','image/webp']),
  ('mesto-media-review','mesto-media-review',false,6291456,array['image/webp']),
  ('mesto-media-public','mesto-media-public',true,6291456,array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
