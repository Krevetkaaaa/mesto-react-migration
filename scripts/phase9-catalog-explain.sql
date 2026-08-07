-- Run against a non-production Supabase database restored from a representative
-- anonymized snapshot. Keep BUFFERS enabled so index and heap work are visible.
-- This file intentionally creates no indexes: compare measured plans before
-- proposing a separate reversible migration.

explain (analyze, buffers, settings)
select id, slug, title, city, category, cuisine, description, address, phone,
       website, hours, average_check, features, photos, latitude, longitude,
       source
from public.venues
where status = 'published'
order by created_at desc, id desc
limit 50 offset 0;

explain (analyze, buffers, settings)
select id, slug, title, city, category, cuisine, description, address, phone,
       website, hours, average_check, features, photos, latitude, longitude,
       source
from public.venues
where status = 'published'
  and city = :'catalog_city'
  and category = :'catalog_category'
order by created_at desc, id desc
limit 50 offset 0;

explain (analyze, buffers, settings)
select id, slug, title, city, category, cuisine, description, address, phone,
       website, hours, average_check, features, photos, latitude, longitude,
       source
from public.venues
where status = 'published'
  and (
    title ilike '%' || :'catalog_search' || '%'
    or description ilike '%' || :'catalog_search' || '%'
    or address ilike '%' || :'catalog_search' || '%'
    or cuisine ilike '%' || :'catalog_search' || '%'
    or category ilike '%' || :'catalog_search' || '%'
  )
order by created_at desc, id desc
limit 50 offset 0;

-- Compare shallow and currently reachable deep offsets before considering a
-- cursor migration. The React route caps the addressable catalog at page 20
-- (offset 950); the HTTP handler separately validates its input.
explain (analyze, buffers, settings)
select id
from public.venues
where status = 'published'
order by created_at desc, id desc
limit 50 offset 950;

-- The current UI promises an exact "visible out of total" value, so PostgREST
-- requests count=exact. Measure that contract separately before replacing it
-- with an estimate or a has-more-only response.
explain (analyze, buffers, settings)
select count(*)
from public.venues
where status = 'published'
  and city = :'catalog_city'
  and category = :'catalog_category';
