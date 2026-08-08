create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists menu_items_touch_updated_at on public.menu_items;
create trigger menu_items_touch_updated_at before update on public.menu_items for each row execute function public.touch_updated_at();
drop trigger if exists promotions_touch_updated_at on public.promotions;
create trigger promotions_touch_updated_at before update on public.promotions for each row execute function public.touch_updated_at();

create or replace function public.moderate_venue_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

create or replace function public.moderate_review_submission(
  p_review_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
alter table public.review_submissions enable row level security;
alter table public.reviews enable row level security;
alter table public.profiles enable row level security;
alter table public.external_identities enable row level security;
alter table public.favorites enable row level security;
alter table public.venue_memberships enable row level security;
alter table public.menu_items enable row level security;
alter table public.promotions enable row level security;
alter table public.audit_log enable row level security;

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

revoke execute on function public.moderate_venue_submission(uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.moderate_review_submission(uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.public_catalog_summary() from public, anon, authenticated;
grant execute on function public.moderate_venue_submission(uuid,text,text,text) to service_role;
grant execute on function public.moderate_review_submission(uuid,text,text,text) to service_role;
grant execute on function public.public_catalog_summary() to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('venue-submissions','venue-submissions',true,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
