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

revoke execute on function public.public_catalog_summary() from public, anon, authenticated;
grant execute on function public.public_catalog_summary() to service_role;
