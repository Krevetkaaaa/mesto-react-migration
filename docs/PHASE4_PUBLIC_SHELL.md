# Phase 4: public React shell

## Scope

Phase 4 moves `/` and `/help` from legacy HTML-file routing to React Router SSR while preserving the frozen DOM, CSS, content, breakpoints and motion contract.

- `/` renders the complete public home document from literal JSX.
- `/help` renders the complete help document from literal JSX.
- `/merchant`, `/admin` and `/api/*` remain on the legacy runtime.
- `/index.html`, `/help.html` and trailing-slash aliases keep canonical `308` redirects.

The legacy source documents remain in the repository as rollback inputs and structural-test fixtures, but `index.html` and `help.html` are removed from `build/client` so they cannot shadow the React SSR function.

## Client ownership seam

React owns server rendering for both migrated routes. The root layout intentionally omits React Router hydration scripts and scroll restoration during this transition.

- The home page loads the existing `app.js?v=ui-motion-2`, which is the sole client-side owner of the frozen home DOM until the catalog and session flows move in Phases 5 and 6.
- The help page does not load `app.js`; it only loads the small synchronous theme bootstrap required to prevent a theme flash and operate the existing theme control.
- There is no shared React/legacy mutation ownership and no `dangerouslySetInnerHTML` escape hatch.

Route modules still form independent build chunks, so later hydrated route cutovers can remain route-scoped.

## SEO, caching and origin policy

Both routes return indexable HTML before JavaScript and provide title, description, canonical and Open Graph metadata.

Canonical and Open Graph URLs use `MESTO_PUBLIC_ORIGIN` only when it is a valid HTTP(S) URL; otherwise they use the already-parsed incoming request URL. Forwarded headers are not trusted. Only the origin portion is retained.

The static SSR documents return:

```text
Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=120
X-Content-Type-Options: nosniff
```

No session or personalized data is included in these responses.

## Verification

- Structural parity renders the route views and compares the ordered body element, attribute, direct-text and landmark inventories with `index.html` and `help.html`.
- Production smoke verifies SSR markers, absence of hydration modules, exact home `app.js` ownership, help isolation, legacy merchant/admin routing, API routing and unknown-route status codes.
- Phase 4 Playwright consumes the frozen Phase 1 snapshots without updating them at `360x800`, `390x844`, `768x1024`, `1440x900` and `1920x1080`.
- Alternate graphite/midnight themes are compared at `1440x900`; the mobile menu is compared at `390x844`.

## Rollback

Reverting the Phase 4 implementation commit restores the Vercel and Vite legacy destinations for `/` and `/help`, restores the staged legacy documents, and removes the React public routes. No database migration or destructive data change is involved.

The legacy HTML, CSS, JavaScript and image assets are intentionally retained until Phase 12 cutover approval.
