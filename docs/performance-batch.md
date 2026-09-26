# Public performance batch — test evidence

Implemented 26 September 2026. Measurements, EXPLAIN output and cleanup records are retained in [performance-batch-evidence.json](performance-batch-evidence.json). No production deployment or production migration was performed.

## Changes and rollout

Deploy the additive public-backend history endpoints and owner-scoped achievement detail endpoint before the frontend. Existing endpoints remain available. The frontend loads histories when their tabs become active, through an authenticated private/no-store proxy; profile histories default to six results per page, and the status UI supplies its own page size.

History filtering, counts, visibility masking, sorting and pagination run in PostgreSQL. Activity history accepts optional `search_scope=name` for status-page name-only search; omitted or unsupported scopes preserve the profile’s broader name/description/visible-status search. Certificate snapshots remain in PostgreSQL; only owner-visible availability and the certificate code leave the database. Course reads select summaries and sidebar fields separately from the selected lesson body. Download authorization does not calculate progress.

Uploads validate without locks, process and PUT outside transactions, then finalize under a shared form lock and exclusive session lock. Attachment IDs remain retry identifiers; each attempt has its own storage UUID. Losing attempts delete only their unreferenced keys. Cleanup resolves the session transaction before deciding whether an uncertain commit left an orphan. The expired-upload job locks sessions and attachments and rechecks expiry/claims before storage deletion.

The new migration in `../kaderisasi-admin-be/database/migrations/1790422468337_add_public_users_lower_email_index.ts` can be released independently. Ace runs its concurrent index operations outside a migration transaction, checks existing definitions and repairs matching invalid builds. It does not change emails or uniqueness. Do not roll back earlier forward-only migrations. The Go snapshot and sqlc output were updated.

## Measurements

These are synthetic fixtures on the configured test PostgreSQL database, with uniquely owned schemas and no public search-path fallback. Wall timings include the test database connection and network; they are not production latency estimates or statistically controlled load-test percentiles.

| Read | Prior broad read | New bounded read |
| --- | ---: | ---: |
| 1,000 activities, substantial descriptions/answers | 24,313,680 serialized bytes | 1,671 bytes for six items plus totals |
| 100 lesson bodies, about 104 KB each | 10,420,677 serialized bytes | 6,176 bytes for all sidebar summaries |
| Case-insensitive email lookup, 10,002 accounts | 2.268 ms server execution, sequential scan, 74 buffer hits | 0.104 ms, bitmap index/heap scan, 3 buffer hits |

A passing history run measured the broad joined read at 31,087.7 ms and the new page query at 67.7 ms. The baseline intentionally transfers the old broad registration/activity fields; it is not a replay of the complete old HTTP endpoint. Response-byte measurements exclude HTTP headers and transport compression. The complete old activity service made three database queries; the new history service uses one statement for page, filtered total and unfiltered summary. Course tests capture emitted SQL and confirm that only one selected-lesson query reads a lesson description.

Controlled upload processing observed zero checked-out pool connections and zero pending pool acquisitions. During a blocked PUT, the form had zero row-locking transactions and another session on the same form finalized successfully (722 ms in one test run). No production pool-wait distribution was collected.

## Reproduction and coverage

From `kaderisasi-web-be`:

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
- `node scripts/test-google-auth.mjs`: six account-preservation and mixed-case tests; owned-schema cleanup recorded in output.
- `node scripts/test-public-performance.mjs`: creates an owned schema through current Ace migrations, tests paginated histories, hidden results, certificate parity, old achievement ownership, 100-body courses, duplicate/last-slot races, submission/removal/expiry/form-change races, member/guest/club/standalone uploads, failed PUT and lost commit acknowledgement. Storage is a controlled in-memory adapter. Logs and cleanup evidence are written under `tmp/public-performance/`.

From `kaderisasi-admin-be`:

- Lint, typecheck, build and `MIGRATION_TEST_ENV=../docs/.env.test.be npm test` passed (seven tests).
- The index test cancels a real concurrent index build, verifies the invalid catalog entry, then retries through Ace. It also covers rollback/reapply, a valid index left by lost acknowledgement, unrelated-index refusal and mixed-case duplicates. Representative `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` output is retained at `tmp/email-index/explain.json`.

From `kaderisasi-web-fe`:

- Lint, typecheck and 192 unit tests passed; production builds passed through the Playwright server harness.
- Profile/status suite: 68 browser checks passed across desktop/mobile, with deep links, browser history, persistent drafts/filters/pages, errors/retries, hidden announcements, certificate actions, keyboard/reflow and accessibility checks.
- Additional history/status run: 16 checks passed, including no history request before tab activation, stale-request cancellation and editing achievement ID 1001 directly.
- Screenshots in `test-results/` were reviewed at mobile and desktop widths. The concurrent status-page design work was preserved.

From `kaderisasi-admin-be-go`:

- `make check`, `make test-unit` and the affected `internal/jobs`, `internal/form`, `internal/course` integration packages passed. The cleanup test holds a session lock, claims the file concurrently, and confirms the cleaner never deletes it.
- Shared database suite: 95 checks passed against real Go and public APIs.
- Course workflow suite: 165 checks passed against real Go, AdonisJS, PostgreSQL and private S3 storage, including cross-user progress and download authorization. All three recorded course objects were deleted.
- `make clean-fixtures` completed; the three owned shared-suite schemas were removed and the cleanup manifest records `status: cleaned`.
- Shared fixture suites run serially; cleanup manifests live under `.artifacts/`. The course harness now checks denial for the retired Course Manager role and authorized access for the current Club Manager role.

The initial Go integration run was invalidated by source edits during execution and was rerun successfully against stable sources. Early benchmark failures were fixture setup/time-budget issues. The removal test initially asserted `undefined` for an absent row; Lucid returns `null`. After correcting that assertion, its focused rerun passed. The other eight database tests passed together.
