# Beya’s big day budgeting

Beya is Ben + Maya’s couple name. The individual partners are Ben and Maya.

A private wedding budget for two people: GitHub Pages serves `docs/`; a dedicated Supabase project provides Auth, Postgres, RLS, and Realtime. Step 1 of [the build brief](wedding-planner-build-brief.md) is implemented. Guests, menus, tasks, seating, and calendar views remain later releases.

## What ships

- Email/password sign-in for administrator-provisioned accounts, email-link confirmation and password recovery, shared wedding settings, editable categories and item targets, planned expenses, and booked agreements.
- Vendor contacts and side-by-side package quotes, including fixed/per-guest prices, saved headcount, inclusions, ratings, and notes. A preferred quote contributes once to forecast. Booking updates the existing expense; unused quotes stay available. Booked quotes are preserved; agreed-price changes require an amendment with history.
- Deposits, payments, refunds, dated installments, partial balances, overdue flags, vendor credits, separate payer/recorder attribution, category overages, and exact dollar tables.
- **Add expense → Purchase paid in full** records the agreed purchase and its payment in one database transaction. One save, no deposit workflow. Zero-cost purchases record an explicit zero agreement without a payment.
- Budget vs. paid bars (with Forecast comparison), net-payment breakdown, and separate expense/payment CSV downloads. Exports use integer cents and escape spreadsheet formulas in user-entered text.
- Version-filtered edits detect simultaneous changes. Payment UUIDs and unconfirmed save payloads survive reloads in the same tab. Realtime refetches, a 20-second foreground polling fallback, and focus/online refresh keep two open screens current.

## Local development

Node 22+ is sufficient. There are **no production or development package dependencies**, no install step, and no compile step.

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173/`. With unconfigured `docs/config.js`, the page shows setup instructions and makes no backend requests. Serve over HTTP locally; ES modules do not work reliably from `file://` URLs.

For a **mock-data UI preview**, use `node scripts/preview-fixture.mjs`, open `http://127.0.0.1:4174/`, and use any example email/password. This intercepts requests in memory and never authenticates with Supabase. Refreshing resets fixture records. The mock server is separate from the production server, and its fixtures are outside `docs/`, so Pages cannot publish them.

## Set up Supabase (administrative, review before applying)

1. Use a separate wedding-planner Supabase project. This repository is configured for **beyas-big-day** (`nennjenlgfkblsmpkzfr`, US East). The approved [migration](supabase/migrations/20261113132432_shared_budget.sql) was applied there on November 13, 2026. Do not apply it a second time to that project; these steps also describe setup for a fresh project.
2. For a fresh project, apply the migration once using your installed Supabase CLI’s migration workflow after reviewing its current `--help`, or a migration tool that records history. The file was created with CLI **v3.1.0**; its version now matches the history recorded by Supabase’s migration tool. Do not run `tests/bootstrap.sql` on Supabase: it is only a disposable plain-Postgres Auth/role stub.
3. In Auth, enable email/password sign-in. Create/confirm two partner users and give each their own password through a secure account setup process. Disable public signup for this private release. The frontend has no signup or invitation-management flow; account creation and membership changes remain administrative. It supports **Forgot password? → reset email → choose a new password → sign in**, using the default Supabase implicit email-link flow.
4. Copy [provision.example.sql](supabase/provision.example.sql) into the SQL editor, substitute the two Auth UUIDs, review names/currency/time zone, and run it once. It creates a private wedding, two memberships, and blank starter categories. Record the returned wedding UUID for access checks. Membership changes remain administrative; browser users cannot grant access or create weddings.

   The configured `beyas-big-day` project already has the shared wedding, Ben and Maya’s memberships, and nine starter categories, provisioned on November 13, 2026. Do not run provisioning again there. Each partner must confirm their own email before signing in.
5. Set `supabaseUrl` and `publishableKey` in [docs/config.js](docs/config.js). Only the project URL and `sb_publishable_…` key belong in the public repository. Never use a secret or service-role key. This frontend supports hosted `https://<ref>.supabase.co` projects; custom domains/self-hosted Auth require corresponding URL/CSP changes and verification.
6. Verify that `public` is exposed through the Data API. The migration explicitly grants only required table operations to `authenticated`, revokes anonymous and destructive access, and enables RLS on all nine tables. Its helper is in the non-exposed `private` schema; **do not expose that schema**. Ensure Realtime is enabled and that all nine tables are in the `supabase_realtime` publication (the migration adds them when that publication exists).
7. Run the project’s security advisors in Supabase before entering real data. Follow [the two-account verification guide](VERIFICATION.md).

Email/password setup follows [Supabase Auth documentation](https://supabase.com/docs/guides/auth/passwords); access controls follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). The dependency-free client uses the documented [Realtime JSON protocol](https://supabase.com/docs/guides/realtime/protocol), with polling if subscription delivery fails.

## GitHub Pages

The repository remote is [iTriedaThing/beyas-big-day](https://github.com/iTriedaThing/beyas-big-day). The release source is **main → /docs**, and the app URL is [Beya’s big day](https://itriedathing.github.io/beyas-big-day/). Continue normal development on feature branches; promotion to `main` publishes the Pages frontend and requires release authorization.

After reviewing the feature branch and authorizing its promotion to `main` and Pages publishing:

1. Start a meaningful typed branch from current `main`, commit verified units there, push related commits together, and open a PR into `main`. Do not commit or push implementation directly to `main`. Merge only with approval; merging into `main` triggers Pages publication. Do not publish private wedding data, exports, or credentials in Git.
2. Under **Settings → Pages → Deploy from a branch**, select **main → /docs**. All entry assets use relative paths; there is no SPA route rewrite or build action to configure.
3. Set Supabase’s production Site URL and allowed redirect URL to the exact Pages project URL, including repository path and trailing slash: `https://itriedathing.github.io/beyas-big-day/`. Email links return to this page. The app validates the returned session with Supabase before using it, immediately removes tokens from the URL, and shows a new-password form for recovery/invite links. Confirmation links restore a normal session. Expired, malformed, or unsupported PKCE-code links show an actionable error; use the default implicit-flow email templates. Consult [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Open the published URL in a signed-out browser before signing in. Run the checks in [VERIFICATION.md](VERIFICATION.md) with test data before entering real prices or payments.

Routine completed units of work are committed and related commits are pushed together under the user’s standing Git workflow preference. No hosted migration, account provisioning, release promotion, or deployment is implied by a commit or push; those actions need separate authorization.

## Data and calculation rules

- All money is integer cents, with strict decimal parsing. The release supports USD, CAD, GBP, EUR, AUD, and NZD (two decimal places). Each amount is limited to 1,000,000,000 cents. Currency changes are blocked once expenses exist; there is no currency conversion.
- Forecast uses **agreed price → preferred quote total → item target**, choosing exactly one. Blank is unknown; zero is explicit. Unknown items flag forecast as incomplete. Allocated category targets sum the item targets, rather than duplicating a second category budget.
- Paid is payments less refunds. Owed sums positive booked balances; credits are shown separately rather than hiding another vendor’s bill. A quote edit never changes a booked agreement.
- An installment is settled only by its linked transactions. Unallocated payments are flagged for reconciliation; they still reduce the expense balance. Refunds may reopen an installment. Scheduling does not create additional expenses or payments. The app shows the installment schedule alongside the agreement so discrepancies can be reconciled.
- Payments are append-only. Correct an amount, payer, date, or allocation by recording an offsetting transaction and then the corrected one, with explanatory notes. There is no destructive ledger editing/deletion in this release.
- Dates are calendar dates (`YYYY-MM-DD`), interpreted in the wedding’s IANA time zone. Transactions preserve the selected date, not a UTC timestamp converted on another phone. Audit timestamps use `timestamptz`.
- Database membership and composite foreign keys protect every relationship. Browser configuration is public; wedding records stay in Postgres behind RLS. Data snapshots use one database statement to avoid mixed totals during concurrent writes.
- Sessions and unconfirmed saves use **sessionStorage**, scoped to this browser tab and project/account. Reloading preserves them, but closing the tab may discard them. After a network failure, use **Retry pending save** in the same tab before entering that transaction again. There is no offline editing queue or cross-device unsaved draft recovery. Sign-in is required again in a new tab/browser session.

## Verification performed

- `node --test tests/*.test.mjs`: 26 tests passed, covering budget calculations, retry persistence, conflicts, refresh/sign-out behavior, native browser fetch binding, and email-link/password-recovery handling. Recovery checks cover URL cleanup, server validation, expired/invalid links, session persistence, authenticated password updates, failures, sign-out races, and reset-email request payloads.
- `node scripts/check.mjs`: syntax, entry assets, and relative asset checks passed. There is no separate lint/typecheck/build toolchain configured.
- Migration applied successfully to isolated **PostgreSQL 16.4** with test-only Auth stubs. [tests/access.sql](tests/access.sql) passed: two-member reads, outsider isolation across every table, signed-out denial, administrative memberships, same-wedding/expense references, immutable ledger, actor checks, retry deduplication, atomic purchase rollback, version conflicts, preserved quotes, and amendment history.
- Supabase CLI v3.1.0 security advisors against that local test database: **No issues found**.
- Hosted `beyas-big-day` after the approved migration: all nine tables have RLS enabled, no anonymous SELECT or authenticated TRUNCATE grants, all nine tables are published to Realtime, and security advisors returned no issues. All ten signed-out Data API checks passed with database permission denials. The wedding and two memberships are provisioned; hosted RLS checks under each member’s database role see the same wedding, both members, and all nine categories, while an unrelated simulated user sees no records. Real two-account sign-in/sync verification remains outstanding.
- Browser fixture checks: sign-in form, deposit totals, single-entry paid-in-full purchase, vendor/quote display, no console warnings/errors, and phone-width document geometry. These are **mocked UI checks**, not proof of hosted Auth, email delivery, or Realtime. Complete the hosted checks separately.
- Recovery browser fixtures: email-link tokens disappear from the URL, recovery survives reload, mismatched passwords are rejected, a synthetic password update returns to sign-in, and reset requests show a generic success message. These checks use no real account credentials and send no email.

To repeat SQL tests on a **new disposable database** with `psql`:

```sh
psql -v ON_ERROR_STOP=1 -d YOUR_DISPOSABLE_DATABASE -f tests/bootstrap.sql -f supabase/migrations/20261113132432_shared_budget.sql -f tests/access.sql
```

Bootstrap creates test roles if absent and creates the Auth stub schema that a normal Supabase project already has. Access-test fixtures run in a transaction and roll back. Do not run bootstrap against a shared or production database. Use a fresh disposable database for each full migration run.

Run `node scripts/check-public-access.mjs` to verify that the configured hosted project's nine tables and budget-snapshot RPC deny signed-out Data API requests. This uses only the publishable key, writes no records, and does not replace the member/outsider checks in `VERIFICATION.md`.
