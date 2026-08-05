create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists email_is_internal boolean not null default false;

create table if not exists public.external_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('vk','yandex')),
  provider_subject text not null,
  created_at timestamptz not null default now(),
  unique (provider,provider_subject),
  unique (user_id,provider)
);

create index if not exists external_identities_user_idx
  on public.external_identities(user_id,provider);

alter table public.external_identities enable row level security;

-- No client policy is intentional. OAuth callbacks use the service role; browser
-- clients never receive provider subject identifiers or provider access tokens.
