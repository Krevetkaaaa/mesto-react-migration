-- Return the exact media cleanup claim from the venue deletion transaction.
-- The API must not infer this set from a pre-transaction read because a
-- concurrent change or an upgrade mismatch would otherwise false-complete.

create or replace function public.delete_venue_with_media(
  p_venue_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

revoke execute on function public.delete_venue_with_media(uuid) from public, anon, authenticated;
grant execute on function public.delete_venue_with_media(uuid) to service_role;
