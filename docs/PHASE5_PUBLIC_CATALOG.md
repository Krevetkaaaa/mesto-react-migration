# Phase 5: public catalog and venue routes

## Scope and ownership

Phase 5 moves the interactive public catalog from legacy DOM ownership to React Router while preserving the Phase 4 home and help contracts.

- React SSR and hydration own `/catalog`, `/city/:citySlug`, and `/venue/:venueSlug`.
- `/` remains SSR markup with `app.js` as its client owner. Catalog actions on the home page now navigate to canonical React routes; the old editorial dialog remains only for cards that do not have a safe stable slug.
- `/help` remains SSR without React hydration. Merchant, admin, auth callbacks, and the remaining API routes keep their existing owners.
- The standalone catalog shell omits hidden home/profile/legacy-dialog DOM so those routes do not preload unrelated images or create two client owners for the same interaction.

## Module boundary and data policy

`createPublicCatalogExperience` is the single application seam for public list loading. Routes depend on `VenueCatalog`, not on `fetch` or Supabase.

- The database is authoritative whenever the catalog API reports that it is configured, including a valid empty result.
- The fixed seven-record editorial set is used only when the database is unavailable or the request fails. It is not merged into a configured production result.
- Server pagination follows the returned `nextOffset`; it does not infer database offsets from rendered item counts.
- Page size is 50 and URL page depth is capped at 20 to prevent a crafted SSR URL from amplifying one request into an unbounded number of backend calls.
- Cuisine, pet-friendly, parking, and presentation sort are applied after server-backed query/city/category selection. Slugs are deduplicated before rendering.
- Abort signals cross the route/application/adapter boundary so superseded navigations do not keep stale work alive.

## URL contract

Catalog state is represented by compact search parameters:

- `q`: sanitized search text;
- `city`, `category`, `cuisine`: normalized selections, with `all` omitted;
- `sort`: `popular`, `new`, or `mixed`, with `popular` omitted;
- `pet=1` and `parking=1`: feature filters;
- `page`: cumulative page depth, omitted for page 1 and clamped to 20.

`/city/:citySlug` accepts only the explicit city-slug map. Unknown cities return HTTP 404. Form submissions normalize the URL, reload restores the same state, and browser back/forward is covered by Playwright.

## Venue contract

`GET /api/venues/:slug` is a published-only read endpoint.

- The slug is percent-decoded, NFKC-normalized, lower-cased, limited to 160 characters, and checked against the canonical Cyrillic/Latin-style hyphenated slug grammar used by the backend.
- Invalid slugs return 400 before database access.
- Missing, unpublished, or non-canonical rows return 404.
- An unconfigured database returns 503, the public rate limit returns 429, and unexpected store failures return a stable 500 response without leaking upstream details.
- The list endpoint now returns each stored stable slug; a missing database slug is never synthesized from a title.

`/venue/:venueSlug` renders indexable title, description, canonical URL, Open Graph metadata, and the venue content in SSR HTML. The native dialog is the enhanced client presentation. Its close action returns to a validated same-site `from` location or the catalog.

## Interaction states

- Loading, empty, database-error fallback, retry, pagination, and stale-navigation behavior have explicit UI states.
- Guests receive the existing authorization prompt and no favorite write is sent.
- Authenticated favorite changes are optimistic and roll back on API failure in both list cards and the full venue dialog.
- List images use intrinsic dimensions, responsive `sizes`, and lazy loading. The venue hero is the intentional eager/high-priority image.
- Light, graphite, and midnight catalog/venue views pass the Phase 5 serious-and-critical axe gate. Dark-theme brand and form contrast are locked by browser assertions.

## Verification

Local completion gates:

- `npm.cmd run check`: legacy syntax, React Router type generation, strict TypeScript, and ESLint pass.
- `npm.cmd test`: 39 server tests and 82 unit/contract/component tests pass.
- `npm.cmd run smoke`: production client/SSR build and coexistence smoke pass.
- Phase 5 functional E2E covers URL restore/history, cumulative pagination, city SEO/404, venue SSR/modal/return, guest and authenticated favorites, rollback, loading/error/retry, mobile menu ownership, and accessibility.
- Nineteen Phase 5 PNG baselines cover catalog, city, and venue at 360x800, 390x844, 768x1024, 1440x900, and 1920x1080, plus graphite and midnight catalog/venue at 1440x900. Every meaningful snapshot update was manually inspected; a subsequent no-update run is required to pass.
- The complete Phase 4 visual/interaction suite is rerun unchanged to prove that the existing public shell did not regress.

These are deterministic local/lab checks. They are not a claim about production Core Web Vitals or real production database latency.

## Operations and rollback

- No database migration is introduced.
- No production deployment or alias change is part of Phase 5.
- Revert the Phase 5 implementation commit to restore the Phase 4 catalog ownership. Legacy markup remains present for rollback until the later cutover phases.
- GenericAgent is installed at `C:\Users\kir21\GenericAgent`, but it cannot execute a real LLM task until the owner configures a supported provider locally with `C:\Users\kir21\GenericAgent\ga.cmd configure`. Secrets must not be pasted into chat or committed.
