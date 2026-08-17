create extension if not exists pgcrypto;

revoke all on schema public from public, anon, authenticated, service_role;
grant usage on schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  city text not null,
  category text not null,
  cuisine text default '',
  description text not null default '',
  address text default '',
  phone text default '',
  website text default '',
  hours text default '',
  average_check text default '',
  features jsonb not null default '[]'::jsonb,
  photos text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  source text not null default 'editorial' check (source in ('editorial','community','merchant')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venue_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  contact_name text not null,
  contact_email text not null,
  title text not null,
  city text not null,
  category text not null,
  cuisine text default '',
  description text not null,
  address text default '',
  phone text default '',
  website text default '',
  hours text default '',
  average_check text default '',
  features jsonb not null default '[]'::jsonb,
  photos text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderation_note text default '',
  moderated_by text,
  moderated_at timestamptz,
  approved_venue_id uuid references public.venues(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  staging_token_expires_at timestamptz not null default (now() + interval '2 hours'),
  review_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(review_manifest) = 'object'),
  public_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(public_manifest) = 'object'),
  publication_lease_id uuid,
  staging_cleanup_pending boolean not null default true,
  review_cleanup_pending boolean not null default false,
  public_cleanup_pending boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width is null or height is null or width::bigint * height::bigint <= 40000000),
  constraint media_assets_publication_lease_state_check
    check ((status = 'publishing') = (publication_lease_id is not null)),
  constraint media_assets_staging_token_expiry_check
    check (staging_token_expires_at >= created_at)
);

create index if not exists media_assets_owner_status_idx on public.media_assets(owner_id, status, created_at);
create unique index if not exists venue_submissions_approved_venue_uidx
  on public.venue_submissions(approved_venue_id) where approved_venue_id is not null;
create index if not exists media_assets_submission_idx on public.media_assets(submission_id) where submission_id is not null;
create index if not exists media_assets_expiry_idx on public.media_assets(expires_at)
  where (submission_id is null and status in ('signed','processing','processed','failed')) or status = 'cleanup_pending';
create index if not exists media_assets_cleanup_idx on public.media_assets(status, created_at)
  where status in ('cleanup_pending','failed') or staging_cleanup_pending or review_cleanup_pending or public_cleanup_pending;
create index if not exists media_assets_publication_lease_idx on public.media_assets(publication_lease_id)
  where status = 'publishing';
create index if not exists media_assets_staging_cleanup_due_idx on public.media_assets(staging_token_expires_at)
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

create table if not exists public.review_submissions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  external_venue_id text,
  venue_title text not null,
  submitted_by uuid references auth.users(id) on delete set null,
  author_name text not null default 'Гость',
  rating smallint not null check (rating between 1 and 5),
  body text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderation_note text default '',
  moderated_by text,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  external_venue_id text,
  venue_title text not null,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null,
  source_submission_id uuid unique references public.review_submissions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reviews add column if not exists author_id uuid references auth.users(id) on delete set null;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default '',
  email text not null,
  email_is_internal boolean not null default false,
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer','merchant','admin')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  must_change_password boolean not null default false,
  session_version integer not null default 0,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists session_version integer not null default 0;
alter table public.profiles add column if not exists email_is_internal boolean not null default false;

create table if not exists public.external_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('vk','yandex')),
  provider_subject text not null,
  created_at timestamptz not null default now(),
  unique (provider,provider_subject),
  unique (user_id,provider)
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_key text not null,
  venue_id uuid references public.venues(id) on delete cascade,
  external_venue_id text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_key)
);

create table if not exists public.venue_memberships (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'owner' check (membership_role in ('owner','manager','content_editor','analyst')),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (venue_id,user_id)
);

update public.venue_memberships
set permissions = case membership_role
  when 'analyst' then '["reviews","analytics"]'::jsonb
  when 'content_editor' then '["venue","menu","promotions"]'::jsonb
  else '["venue","menu","promotions","reviews","analytics"]'::jsonb
end;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  section text not null default 'Основное меню',
  title text not null,
  description text not null default '',
  price numeric(12,2),
  photo_url text not null default '',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null default '',
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists venues_public_catalog_idx on public.venues(status, city, category, created_at desc);
create index if not exists venue_submissions_status_idx on public.venue_submissions(status, created_at desc);
create index if not exists review_submissions_status_idx on public.review_submissions(status, created_at desc);
create index if not exists profiles_role_status_idx on public.profiles(role,status,created_at desc);
create index if not exists external_identities_user_idx on public.external_identities(user_id,provider);
create index if not exists favorites_user_idx on public.favorites(user_id,created_at desc);
create index if not exists venue_memberships_user_idx on public.venue_memberships(user_id,venue_id);
create index if not exists menu_items_venue_idx on public.menu_items(venue_id,section,sort_order);
create index if not exists promotions_venue_idx on public.promotions(venue_id,status,created_at desc);

create or replace function public.public_catalog_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with published as materialized (
    select city, category
    from public.venues
    where status = 'published'
  )
  select jsonb_build_object(
    'total', (select count(*) from published),
    'byCategory', (
      select coalesce(jsonb_object_agg(category_counts.category, category_counts.total), '{}'::jsonb)
      from (
        select category, count(*) as total
        from published
        where nullif(btrim(category), '') is not null
        group by category
      ) as category_counts
    ),
    'byCity', (
      select coalesce(jsonb_object_agg(city_counts.city, city_counts.total), '{}'::jsonb)
      from (
        select city, count(*) as total
        from published
        where nullif(btrim(city), '') is not null
        group by city
      ) as city_counts
    )
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venues_touch_updated_at on public.venues;
create trigger venues_touch_updated_at before update on public.venues for each row execute function public.touch_updated_at();
drop trigger if exists venue_submissions_touch_updated_at on public.venue_submissions;
create trigger venue_submissions_touch_updated_at before update on public.venue_submissions for each row execute function public.touch_updated_at();
drop trigger if exists media_assets_touch_updated_at on public.media_assets;
create trigger media_assets_touch_updated_at before update on public.media_assets for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists menu_items_touch_updated_at on public.menu_items;
create trigger menu_items_touch_updated_at before update on public.menu_items for each row execute function public.touch_updated_at();
drop trigger if exists promotions_touch_updated_at on public.promotions;
create trigger promotions_touch_updated_at before update on public.promotions for each row execute function public.touch_updated_at();

create or replace function public.create_venue_submission_with_media(
  p_payload jsonb,
  p_media_ids uuid[],
  p_owner uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  normalized_ids uuid[] := coalesce(p_media_ids, '{}'::uuid[]);
  media_count integer;
  new_submission_id uuid;
begin
  if p_owner is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid submission payload'; end if;
  if cardinality(normalized_ids) > 6 then raise exception 'At most six media assets are allowed'; end if;
  perform 1 from public.media_assets where id = any(normalized_ids) for update;
  select count(*) into media_count from public.media_assets
  where id = any(normalized_ids) and owner_id = p_owner and status = 'processed' and submission_id is null;
  if media_count <> cardinality(normalized_ids) then
    raise exception 'Media assets are missing, duplicated, expired, or already attached';
  end if;
  insert into public.venue_submissions (
    submitted_by,contact_name,contact_email,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,status
  ) values (
    p_owner,coalesce(p_payload->>'contact_name',''),coalesce(p_payload->>'contact_email',''),
    coalesce(p_payload->>'title',''),coalesce(p_payload->>'city',''),coalesce(p_payload->>'category',''),
    coalesce(p_payload->>'cuisine',''),coalesce(p_payload->>'description',''),coalesce(p_payload->>'address',''),
    coalesce(p_payload->>'phone',''),coalesce(p_payload->>'website',''),coalesce(p_payload->>'hours',''),
    coalesce(p_payload->>'average_check',''),coalesce(p_payload->'features','[]'::jsonb),'{}'::text[],'pending'
  ) returning id into new_submission_id;
  update public.media_assets set submission_id = new_submission_id, status = 'attached', expires_at = now()
  where id = any(normalized_ids);
  return jsonb_build_object('id', new_submission_id, 'status', 'pending');
end;
$$;

create or replace function public.moderate_venue_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item public.venue_submissions%rowtype;
  venue_id uuid;
  normalized_status text;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Unsupported moderation decision';
  end if;
  select * into item from public.venue_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if item.status <> 'pending' then raise exception 'Submission already moderated'; end if;
  normalized_status := p_decision;
  update public.venue_submissions set status = normalized_status, moderation_note = coalesce(p_note,''), moderated_by = p_moderator, moderated_at = now() where id = p_submission_id;
  if p_decision = 'approved' then
    insert into public.venues (slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,source,status,created_by)
    values (
      regexp_replace(lower(item.title), '[^a-zа-яё0-9]+', '-', 'gi') || '-' || left(item.id::text,8),
      item.title,item.city,item.category,item.cuisine,item.description,item.address,item.phone,item.website,item.hours,item.average_check,item.features,item.photos,'community','published',item.submitted_by
    ) returning id into venue_id;
  end if;
  return jsonb_build_object('submission_id', p_submission_id, 'status', normalized_status, 'venue_id', venue_id);
end;
$$;

drop function if exists public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb);
create or replace function public.moderate_venue_submission_with_media(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null,
  p_media_public_manifests jsonb default '{}'::jsonb,
  p_media_publication_lease_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item public.venue_submissions%rowtype;
  venue_id uuid;
  media_count integer;
  manifest_count integer;
  claimed_media_ids uuid[] := '{}'::uuid[];
  approved_photos text[] := '{}'::text[];
begin
  if p_decision not in ('approved','rejected') then raise exception 'Unsupported moderation decision'; end if;
  if jsonb_typeof(coalesce(p_media_public_manifests, '{}'::jsonb)) <> 'object' then raise exception 'Invalid public media manifest'; end if;
  select * into item from public.venue_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if item.status <> 'pending' then raise exception 'Submission already moderated'; end if;
  perform 1 from public.media_assets where submission_id = p_submission_id for update;
  select coalesce(array_agg(media.id order by media.id), '{}'::uuid[])
    into claimed_media_ids from public.media_assets media where media.submission_id = p_submission_id;
  media_count := cardinality(claimed_media_ids);
  if p_decision = 'approved' then
    select count(*) into manifest_count from jsonb_object_keys(coalesce(p_media_public_manifests, '{}'::jsonb));
    if (media_count > 0 and p_media_publication_lease_id is null) or manifest_count <> media_count or exists (
      select 1 from public.media_assets media where media.submission_id = p_submission_id and (
        media.status <> 'publishing'
        or media.publication_lease_id is distinct from p_media_publication_lease_id
        or not (p_media_public_manifests ? (media.id::text))
        or coalesce(((p_media_public_manifests -> (media.id::text)) -> 'hero') ->> 'url','') !~ '^https://'
      )
    ) then raise exception 'Approved media manifest is incomplete'; end if;
    update public.media_assets media
    set public_manifest = p_media_public_manifests -> (media.id::text), status = 'published', review_cleanup_pending = true,
      public_cleanup_pending = false, publication_lease_id = null
    where media.submission_id = p_submission_id;
    if media_count = 0 then
      approved_photos := item.photos;
    else
      select coalesce(array_agg(media.public_manifest->'hero'->>'url' order by media.created_at), '{}'::text[])
        into approved_photos from public.media_assets media where media.submission_id = p_submission_id;
    end if;
    update public.venue_submissions set photos = approved_photos, status = 'approved', moderation_note = coalesce(p_note,''),
      moderated_by = p_moderator, moderated_at = now() where id = p_submission_id;
    insert into public.venues (slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,source,status,created_by)
    values (
      regexp_replace(lower(item.title), '[^a-zа-яё0-9]+', '-', 'gi') || '-' || left(item.id::text,8),
      item.title,item.city,item.category,item.cuisine,item.description,item.address,item.phone,item.website,item.hours,
      item.average_check,item.features,approved_photos,'community','published',item.submitted_by
    ) returning id into venue_id;
    update public.venue_submissions set approved_venue_id = venue_id where id = p_submission_id;
  else
    if exists (select 1 from public.media_assets media where media.submission_id = p_submission_id and media.status = 'publishing') then
      raise exception 'Media publication is in progress';
    end if;
    update public.media_assets
    set status = 'cleanup_pending'
    where submission_id = p_submission_id and status = 'attached';
    update public.venue_submissions set status = 'rejected', moderation_note = coalesce(p_note,''),
      moderated_by = p_moderator, moderated_at = now() where id = p_submission_id;
  end if;
  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', p_decision,
    'venue_id', venue_id,
    'media_count', cardinality(claimed_media_ids),
    'media_ids', to_jsonb(claimed_media_ids)
  );
end;
$$;

create or replace function public.delete_venue_with_media(
  p_venue_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  claimed_media_ids uuid[] := '{}'::uuid[];
begin
  select id into target_id from public.venues where id = p_venue_id for update;
  if not found then
    return jsonb_build_object('deleted', false, 'media_count', 0, 'media_ids', to_jsonb('{}'::uuid[]));
  end if;

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

  with claimed as (
    update public.media_assets media
    set status = 'cleanup_pending', public_cleanup_pending = true, expires_at = now()
    where media.submission_id in (
      select submission.id from public.venue_submissions submission where submission.approved_venue_id = p_venue_id
    )
    returning media.id
  )
  select coalesce(array_agg(claimed.id order by claimed.id), '{}'::uuid[])
  into claimed_media_ids from claimed;
  update public.venue_submissions set photos = '{}'::text[] where approved_venue_id = p_venue_id;
  delete from public.venues where id = p_venue_id;
  return jsonb_build_object(
    'deleted', true,
    'media_count', cardinality(claimed_media_ids),
    'media_ids', to_jsonb(claimed_media_ids)
  );
end;
$$;

create or replace function public.moderate_review_submission(
  p_review_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item public.review_submissions%rowtype;
  published_review_id uuid;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Unsupported moderation decision'; end if;
  select * into item from public.review_submissions where id = p_review_id for update;
  if not found then raise exception 'Review not found'; end if;
  if item.status <> 'pending' then raise exception 'Review already moderated'; end if;
  update public.review_submissions set status = p_decision, moderation_note = coalesce(p_note,''), moderated_by = p_moderator, moderated_at = now() where id = p_review_id;
  if p_decision = 'approved' then
    insert into public.reviews (venue_id,external_venue_id,venue_title,author_name,rating,body,source_submission_id,author_id)
    values (item.venue_id,item.external_venue_id,item.venue_title,item.author_name,item.rating,item.body,item.id,item.submitted_by)
    returning id into published_review_id;
  end if;
  return jsonb_build_object('review_id', p_review_id, 'status', p_decision, 'published_review_id', published_review_id);
end;
$$;

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

drop policy if exists "Public can read published venues" on public.venues;
create policy "Public can read published venues" on public.venues for select using (status = 'published');
drop policy if exists "Public can read approved reviews" on public.reviews;
create policy "Public can read approved reviews" on public.reviews for select using (true);
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Merchants read own memberships" on public.venue_memberships;
create policy "Merchants read own memberships" on public.venue_memberships for select using (auth.uid() = user_id);
drop policy if exists "Public can read available menu" on public.menu_items;
create policy "Public can read available menu" on public.menu_items for select using (is_available = true);
drop policy if exists "Public can read active promotions" on public.promotions;
create policy "Public can read active promotions" on public.promotions for select using (status = 'active');

revoke execute on function public.touch_updated_at() from public, anon, authenticated, service_role;
revoke execute on function public.guard_media_staging_tombstone() from public, anon, authenticated, service_role;
revoke execute on function public.moderate_venue_submission(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) from public, anon, authenticated, service_role;
revoke execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.delete_venue_with_media(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.moderate_review_submission(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.public_catalog_summary() from public, anon, authenticated, service_role;
grant execute on function public.moderate_venue_submission(uuid,text,text,text) to service_role;
grant execute on function public.create_venue_submission_with_media(jsonb,uuid[],uuid) to service_role;
grant execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.delete_venue_with_media(uuid) to service_role;
grant execute on function public.moderate_review_submission(uuid,text,text,text) to service_role;
grant execute on function public.public_catalog_summary() to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('mesto-media-staging','mesto-media-staging',false,6291456,array['image/jpeg','image/png','image/webp']),
  ('mesto-media-review','mesto-media-review',false,6291456,array['image/webp']),
  ('mesto-media-public','mesto-media-public',true,6291456,array['image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
