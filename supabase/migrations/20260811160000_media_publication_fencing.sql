-- Fence every public-media publication attempt with a database-owned UUID.
-- The earlier direct-media migration is already deployed in Preview, so this
-- upgrade is intentionally additive and preserves recorded cleanup manifests.

alter table public.media_assets
  add column if not exists publication_lease_id uuid;

-- Fence out any worker that started before this migration. Its recorded public
-- manifest and cleanup marker remain intact for the next claimed attempt.
update public.media_assets
set status = 'attached', publication_lease_id = null
where status = 'publishing';

alter table public.media_assets
  add constraint media_assets_publication_lease_state_check
  check ((status = 'publishing') = (publication_lease_id is not null)) not valid;

alter table public.media_assets
  validate constraint media_assets_publication_lease_state_check;

create index if not exists media_assets_publication_lease_idx
  on public.media_assets(publication_lease_id)
  where status = 'publishing';

drop function if exists public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb);

create or replace function public.moderate_venue_submission_with_media(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_moderator text default null,
  p_media_public_manifests jsonb default '{}'::jsonb,
  p_media_publication_lease_id uuid default null
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

  select * into item
  from public.venue_submissions
  where id = p_submission_id
  for update;
  if not found then raise exception 'Submission not found'; end if;
  if item.status <> 'pending' then raise exception 'Submission already moderated'; end if;

  perform 1 from public.media_assets where submission_id = p_submission_id for update;
  select count(*) into media_count from public.media_assets where submission_id = p_submission_id;

  if p_decision = 'approved' then
    select count(*) into manifest_count
    from jsonb_object_keys(coalesce(p_media_public_manifests, '{}'::jsonb));
    if (media_count > 0 and p_media_publication_lease_id is null)
      or manifest_count <> media_count
      or exists (
        select 1
        from public.media_assets media
        where media.submission_id = p_submission_id
          and (
            media.status <> 'publishing'
            or media.publication_lease_id is distinct from p_media_publication_lease_id
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
        public_cleanup_pending = false,
        publication_lease_id = null
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

    insert into public.venues (
      slug,title,city,category,cuisine,description,address,phone,website,hours,
      average_check,features,photos,source,status,created_by
    ) values (
      regexp_replace(lower(item.title), '[^a-zа-яё0-9]+', '-', 'gi') || '-' || left(item.id::text,8),
      item.title,item.city,item.category,item.cuisine,item.description,item.address,item.phone,item.website,item.hours,
      item.average_check,item.features,approved_photos,'community','published',item.submitted_by
    ) returning id into venue_id;
    update public.venue_submissions set approved_venue_id = venue_id where id = p_submission_id;
  else
    if exists (
      select 1 from public.media_assets media
      where media.submission_id = p_submission_id and media.status = 'publishing'
    ) then
      raise exception 'Media publication is in progress';
    end if;
    update public.media_assets
    set status = 'cleanup_pending'
    where submission_id = p_submission_id and status = 'attached';
    update public.venue_submissions
    set status = 'rejected',
        moderation_note = coalesce(p_note,''),
        moderated_by = p_moderator,
        moderated_at = now()
    where id = p_submission_id;
  end if;

  return jsonb_build_object(
    'submission_id', p_submission_id,
    'status', p_decision,
    'venue_id', venue_id
  );
end;
$$;

revoke execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid)
  to service_role;

notify pgrst, 'reload schema';
