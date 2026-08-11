# Phase 12: disposable provider-backed Preview acceptance

`scripts/preview-acceptance.mjs` is a mutation-capable, fail-closed acceptance runner for an isolated Vercel Preview. It cannot target arbitrary hosts or the Production alias.

## Required operator inputs

Set runner credentials and target allowlists only in the launching process environment:

- `MESTO_ACCEPTANCE_ALLOWED_PREVIEW_ORIGIN` — the exact `https://*.vercel.app` Preview origin;
- `MESTO_ACCEPTANCE_ADMIN_LOGIN` — the isolated Preview administrator login;
- `MESTO_ACCEPTANCE_ADMIN_PASSWORD` — the isolated Preview administrator password;
- `MESTO_ACCEPTANCE_CRON_SECRET` — the protected media-reaper secret; required, at least 32 characters, and accepted only when the raw value is already trimmed;
- `MESTO_PREVIEW_BYPASS_SECRET` — optional Vercel protection bypass value;
- `MESTO_ACCEPTANCE_PRODUCTION_ORIGIN` — optional additional Vercel Production origin to deny;
- `MESTO_ACCEPTANCE_CHROME_EXECUTABLE_PATH` — absolute path to the pinned Chrome executable used by the stored-XSS browser oracle.

Set `MESTO_EXPECTED_PREVIEW_COMMIT_SHA` to the exact 40-hex commit expected in the immutable Preview deployment, or provide the equivalent `--expected-commit-sha` CLI input.

Set the exact provider expectations in the runner process. They are mandatory and have no fallback:

- `MESTO_EXPECTED_PREVIEW_SUPABASE_PROJECT_REF` — canonical isolated Preview Supabase ref;
- `MESTO_FORBIDDEN_PRODUCTION_SUPABASE_PROJECT_REF` — canonical Production Supabase ref, different from Preview;
- `MESTO_EXPECTED_PREVIEW_REDIS_PROVIDERS_FINGERPRINT` — SHA-256 base64url digest of the Preview rate-limit/revocation provider identities;
- `MESTO_FORBIDDEN_PRODUCTION_REDIS_PROVIDERS_FINGERPRINT` — corresponding Production digest, different from Preview;
- `MESTO_LOAD_EXPECTED_REDIS_NAMESPACE=preview` — exact logical Preview namespace.

`MESTO_RELEASE_TARGET` is deployment-environment scoped: it must be `preview` only in Preview and `production` only in Production, and must match `VERCEL_ENV`. Do not copy one scoped value into both environments.

Credentials, including `MESTO_ACCEPTANCE_CRON_SECRET`, are read only from the launching process environment, are never accepted as command-line arguments and are not included in reports or errors. Same-origin app requests use manual redirect handling, bounded response bodies and private in-memory cookie jars. Direct provider PUT and cron proof requests also use manual redirects and bounded responses where applicable, but deliberately send no cookies.

Run only against disposable Preview providers:

```text
node scripts/preview-acceptance.mjs --base-url https://IMMUTABLE-PREVIEW.vercel.app --deployment-id dpl_EXACT_ID --expected-commit-sha 0123456789abcdef0123456789abcdef01234567 --acknowledge-preview-mutations
```

`VERCEL_TOKEN` and the linked project team ID (or `MESTO_ACCEPTANCE_VERCEL_TEAM_ID`) are required. Before the first app request or mutation, the runner proves through the Vercel deployment API that the ID is `READY`, has `target=null`, and owns the exact immutable hostname. It then verifies the runtime release fingerprint against that deployment ID, Vercel project ID and hostname, `preview` Redis namespace, exact Preview Supabase ref, exact Preview Redis provider digest and recomputed fingerprint. Preview and forbidden Production Supabase refs and Redis provider digests must both be present and different. Mutable aliases, mismatched/shared providers and every Production deployment are rejected.

The only stdout payload is aggregate JSON. A failed workflow or failed supported cleanup sets a non-zero exit code.

## Covered flow

The runner verifies:

1. provider-backed database and email authentication availability;
2. two independent admin sessions and selective shared revocation;
3. two temporary published venues;
4. customer registration, logout/login, session, favorite, review and venue submission;
5. pending moderation visibility;
6. merchant creation and assignment, forced password change, session and dashboard;
7. entity-tag cache isolation: both venue-content entries reach `HIT`, a mutation of A forces A through non-`HIT` revalidation, and B remains `HIT`;
8. one generated 1200×800 JPEG through the real direct-signed media flow: exact-provider signed URL, denied anonymous staging access before and after PUT, finalize contract, private review variants, submission approval, public WebP dimensions and `max-age=31536000, immutable`;
9. a second signed receipt for the same generated image, uploaded directly to private staging and intentionally left unfinalized as an isolated abandoned-media reaper probe;
10. menu/promotion stored-XSS probes through persisted dashboard/API reload, two public document reloads and the pinned-Chrome browser oracle with blocked cross-origin/probe requests;
11. the protected manual Preview media-reaper handler: unauthenticated rejection, authenticated provider-backed execution, exact isolated counts and owner-scoped receipt disappearance.

The runner never prints the signed upload URL or token. Direct PUT uses manual redirect handling and omits credentials. The media path must stay under the expected Preview Supabase hostname and the `mesto-media-staging`, `mesto-media-review` and `mesto-media-public` bucket contract.

## Cleanup contract

Cleanup always runs in `finally`, in dependency order:

1. delete promotions and menu items;
2. delete the favorite;
3. reject any still-pending review/submission, or resolve the approved media submission and remove its approved venue;
4. release ordinary unattached media, suspend the disposable merchant, delete all temporary venues, and poll every published media URL until CDN deletion is observable;
5. while the exact customer session is still retained, invoke the protected manual Preview media reaper and prove the abandoned receipt disappeared;
6. end merchant, customer and admin sessions.

Each of the exactly two signed receipts must include an exact millisecond ISO `expiresAt` whose observed horizon is between 110 and 130 minutes. The runner retains each deadline with its `mediaId` before relying on that receipt. Before the first protected media/submission/venue cleanup, it performs one shared wait until the latest receipt reaches `expiresAt + 5 minutes` of server tombstone grace plus a conservative 30-second clock/issuance buffer. A normal manual run can therefore take about 2 hours 6 minutes, not two such waits. The wait uses fail-closed evidence (`expiresAt`, `notBefore`, requested/observed wait and call count only); a missing, malformed, implausible, interrupted, duplicated or prematurely completed wait keeps protected cleanup blocked and makes the run red.

After that gate opens, submission/venue handlers own attached-media cleanup through their durable `completeStagingCleanup` fixed point. `media.release` is used only for unattached media. Both admin venue-delete paths must return exact HTTP 200 JSON with `ok === true` and must not return `mediaCleanupPending === true`; a missing/malformed/pending receipt fails cleanup even if the venue row and public URLs already disappeared.

Only after ordinary media and venue cleanup is complete does the runner invoke `GET /api/cron/media-reaper`. Runtime Preview provider-fingerprint proof must already have succeeded. The first request omits authorization and must return exact HTTP 401 `{ok:false,code:"MEDIA_REAPER_UNAUTHORIZED"}` plus `private, no-store, max-age=0`, `WWW-Authenticate: Bearer`, `Vary: Authorization` and `X-Robots-Tag: noindex`. The second request uses `Authorization: Bearer <MESTO_ACCEPTANCE_CRON_SECRET>`, manual redirects, no cookies or retry, a bounded body and a dedicated 135-second timeout below the platform ceiling.

A successful isolated response has exact counts `{recovered:0,public:0,staging:1,review:0,expired:1}`, `drained:true`, all five `hasMore` values false and `failures:[]`. Immediately before dispatch, the exact customer ID/username/email session must observe the abandoned `mediaId` as `{exists:true}` through owner-scoped `GET /api/uploads/status`; after the response the same identity must observe exact `{exists:false}`. All-zero counts, backlog, malformed/provider responses, identity mismatch or an inconclusive status oracle keep acceptance red and are never repaired by retrying the cron mutation. This evidence proves Preview handler/auth/provider reachability for the inspected deployment; it explicitly does not prove that the Production schedule is configured or running.

Mutation intent is armed before dispatch and is cleared only after the cleanup key/state is registered, so reconciliation also covers a successful 2xx response with an invalid ID or contract, not only transport/body failures. The run remains failed, but cleanup reconciles before building its action plan. Run-scoped venue title/slug, customer review/submission ownership and text, merchant username/email, and menu/promotion probes must produce at most one exact GET match. A unique committed row is registered for normal cleanup; an authoritative zero from the relevant collection means the create did not commit; multiple matches or an unavailable identity/read oracle fail closed. Customer registration is the sole read-oracle exception: if the response and `Set-Cookie` were lost, the runner may log in with that run's known disposable credentials and then requires an exact GET session match on ID, username and email. In particular, a lost successful submission response is reconciled by exact `Acceptance Submission <runId>` plus `submitted_by`, marked attached, then resolved only after the media deadline gate. It is never misclassified as unattached and sent to `media.release`.

For each published URL, deletion polling checks both the exact warmed immutable URL (without query/fragment) and a unique nonce cache-bypass URL on every attempt. Both must return the exact Supabase HTTP 404 JSON `NoSuchKey` contract. This proves CDN/origin invalidation; it cannot revoke bytes already retained by browser or other private caches under the one-year immutable policy. That retention tradeoff is acceptable only for owner-approved public venue photos and must not be represented as privacy deletion of user-private media.

The current public API has no hard-delete operation for customer or merchant identities and intentionally retains rejected moderation/audit rows. The report therefore exposes only run-salted hashes for those unavoidable residual records. A failure of any available cleanup action is different: it makes `cleanup.complete=false` and the whole run fails.

## Current Preview checkpoint — 2026-08-11

- Isolated Supabase ref: `foxqdoyqcfsqngfotayu`.
- Backup before migration: `C:\Users\kir21\AppData\Local\Temp\mesto-preview-backup-20260811\data-and-buckets.json` (outside the repository).
- Applied and remotely verified migrations remain exactly the historical three: `20260728_external_identities.sql`, `20260808_public_catalog_summary.sql`, `20260810222309_direct_signed_media_pipeline.sql`.
- Four additive migrations are code-ready but have **not** been applied to Preview or Production: `20260811160000_media_publication_fencing.sql`, `20260811163000_signed_upload_tombstones.sql`, `20260811185937_submission_media_cleanup_receipts.sql`, `20260811212027_venue_media_cleanup_receipts.sql`.
- Verified buckets: private `mesto-media-staging`, private `mesto-media-review`, public `mesto-media-public`, and existing public `venue-submissions`.
- Current local evidence after the latest changes: `git diff --check` PASS; `npm run check` PASS; `318/318` server tests and `203/203` Vitest PASS; production smoke PASS; the high-severity production audit gate PASS with three transitive moderate AJV findings and no available fix.
- Exact-Chrome E2E has **not** been rerun after the latest changes. Local attempts to download pinned Chrome for Testing `151.0.7922.72` from the official GCS URL and official `gvt1` mirror both returned HTTP 403, and no archive was retained. The `763.7 s` full E2E pass is historical evidence from the earlier working tree only and must not be reported as current; the pinned GitHub CI step remains required.
- Read-only derivation currently yields the same Redis provider fingerprint for Preview and Production. The namespace remains `preview`, but logical namespacing is not physical provider isolation; acceptance and load must fail closed until a distinct Preview Redis provider is provisioned and both digest variables differ.
- Production `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables exist with value length `0`. A canonical forbidden Production project ref cannot be derived from empty configuration, so Production is not ready and was not modified.
- Preview still needs the four additive migrations applied with backup/rollback before a new immutable deployment can exercise the current contract; provider isolation is also not complete. No current full E2E, green CI for the current tree, live media/reaper acceptance, remote load gate, merge, Production migration or Production promotion is claimed by this checkpoint.
