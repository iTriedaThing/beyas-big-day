# Beya’s big day budgeting

Beya is Ben + Maya’s couple name. The individual partners are Ben and Maya.

Our Big Day is a private wedding planner. Beya’s Big Day is the original couple’s wedding. GitHub Pages serves the browser app from `docs/`. Supabase provides authentication, Postgres, row-level security, live updates, and private photo storage. The planner covers budgeting, vendors, guests and RSVPs, checklists, scheduling, inspiration, the day-of itinerary, menus, and seating. See the [build brief](wedding-planner-build-brief.md) and [invite-only beta setup](BETA-ENROLLMENT.md).

## What ships

- A forest-green, eggplant, lilac, and sage theme based on the couple’s palette, with original botanical SVG artwork, responsive cards, RSVP/progress charts, and a wedding countdown directly below the page subtitle on every section. No external fonts or new package dependencies.
- Household contacts and mailing addresses; separate save-the-date and invitation sent dates; individual guests and unnamed companions; partner-entered yes/no/pending replies; relationship tags, gifts, dietary flags, guest requests, and separate caterer confirmation. Counts are per person, mailing progress per household, and dietary counts include attending guests only. Guests can be attributed to Ben, Maya, or Together/unspecified. Archive/restore remains available alongside confirmed deletion. Active guests can be exported to CSV, including attribution.
- An editable shared checklist with 22 optional starter tasks, planning windows, completion progress, assignees, relative deadlines, fixed dates, and upcoming/overdue summaries. Starter imports deduplicate by wedding and template key. Calendar-month offsets clamp to the last valid day; final-month/week/day windows use explicit day offsets. Setting/changing the wedding date updates relative dates and the countdown, while fixed deadlines stay fixed.
- Email/password sign-in for administrator-provisioned accounts, email-link confirmation and password recovery, shared wedding settings, editable categories and item targets, planned expenses, and booked agreements.
- Vendor contacts and side-by-side package quotes, including fixed/per-guest prices, saved headcount, inclusions, ratings, and notes. A preferred quote contributes once to forecast. Booking updates the existing expense; unused quotes stay available. Booked quotes are preserved; agreed-price changes require an amendment with history.
- Deposits, payments, refunds, dated installments, partial balances, overdue flags, vendor credits, separate payer/recorder attribution, category overages, and exact dollar tables.
- **Add expense → Purchase paid in full** records the agreed purchase and its payment in one database transaction. One save, no deposit workflow. Zero-cost purchases record an explicit zero agreement without a payment.
- Budget vs. paid bars (with Forecast comparison), net-payment breakdown, and separate expense/payment CSV downloads. Exports use integer cents and escape spreadsheet formulas in user-entered text.
- “Budgeted amount” replaces the user-facing expense “target” label; API/CSV `target_cents` remains backward compatible. Forecast is clickable across the whole card, and the chart retains its Paid/Forecast choice through polling and partner updates. Wedding settings use a time-zone dropdown, retaining saved aliases.
- Payment/refund edits update amounts, type, date, payer, notes, expense, and installment, with optimistic versions and private before/after history. Unbooking returns an agreement to planning, clears quote selections, keeps payments/history, and pauses installment reminders until rebooking.
- Confirmed deletion covers categories, vendors, expenses, quotes, installments, payment/refund records, households, guests, tasks, events, and picture attachments. Related deletion effects are explained before confirmation. Records are tombstoned rather than physically purged, excluded from snapshots/exports, and retained behind membership RLS for accountability. There is no user-facing deleted-record restore; archive/restore is separate.
- Vendors/venues have overall 1–5 ratings, displayed highest first independently of offer ratings, clickable website links, and private JPEG/PNG/WebP attachments up to 5 MB each. Below the rating, each card lists its upcoming tours from Schedule with the date, wedding-local time, and location.
- **Schedule** combines tours, tastings, appointments, open dated tasks, and outstanding booked installments in one chronological agenda. Events have a local date, optional local time, location, vendor link, notes, and completion state. Editing a task/payment uses its original record.
- **Mood board** stores a public Pinterest board URL and displays Pinterest’s official board widget in a sandboxed frame. Pinterest shows a limited preview (up to 50 Pins), not an unrestricted Pinterest browser. Secret boards, blocked third-party content, or cookie/login requirements may prevent a preview; a direct link remains available. See [Pinterest widget documentation](https://developers.pinterest.com/docs/web-features/widgets/).
- Version-filtered edits detect simultaneous changes. Payment UUIDs and unconfirmed save payloads survive reloads in the same tab. Realtime refetches, a 20-second foreground polling fallback, and focus/online refresh keep two open screens current.

## Local development

### Aisle guided setup

Use **Ask Aisle** from the planner to start, resume, or review setup. Newly created weddings open at the wedding details step. Aisle uses the same wedding settings, vendors, schedule, and CSV import as the planner. It recognizes existing guests and a vendor with a next step or open scheduled visit. Setup progress is shared across wedding members and devices. After setup, Aisle suggests a next action based on the planner’s data.

The [Aisle migration](supabase/migrations/20261125035631_aisle_guided_setup.sql) adds setup progress to weddings and an optional next step to vendors. Existing weddings can open the guide when ready. Before the migration is applied, the app leaves the Aisle controls hidden.

### Where to make a change

- The `plannerSections` object in `docs/app.js` connects each section's navigation label, view, and primary action. The same file coordinates editors, polling, and snapshot updates.
- `docs/budget.js`, `docs/planner.js`, `docs/menu.js`, `docs/seating.js`, and `docs/itinerary.js` hold feature rules. Their corresponding tests in `tests/` exercise those rules with synthetic data.
- `docs/api.js` owns sessions, authenticated requests, live subscriptions, and pending saves. `supabase/migrations/` contains the corresponding database contracts in application order.
- `scripts/` contains the local preview servers and checks. `tests/fixture.js` supplies the in-memory wedding shared by the mock preview and the app wiring test.

### Visual seating

**09 · Seating chart** opens on the reception. Add circular, rectangular or square tables individually or in batches of up to 200. Select a table in the diagram or the list to rename it (including a head table), change its shape, capacity or position, and assign guests. Repeat batches to extend either plan. The room overview follows display order and wraps to the available width.

Assigning or moving a household includes all active attending and pending guests, including unnamed companions. **Split household** moves one person. Guests can take any seat at their table or receive a specific number. Choose a chair in the diagram or use the guest’s seat-number control. Large rows (over 20 seats) and tables (over 32) use a simplified diagram with the full capacity and numbered roster available in the detail view.

The ceremony can stay empty, include only reserved family rows, or cover the full guest list. Each row has its own capacity and can have a name and reserved designation. Each event has separate assignments. Declining or archiving a guest releases their places. Removing a row or table releases its occupants and keeps their invitations. The reception assignment also supplies the guest-list table filter and the caterer’s table label.

The [seating migration](supabase/migrations/20261123234251_visual_seating.sql) converts active guests’ existing caterer labels into named circular reception tables, initially sized to the number already assigned. Review shape and actual venue capacity after rollout. Each seating command checks membership and plan revision. A failed move preserves the prior assignments, and retrying a confirmed request cannot duplicate a batch. Supabase recorded the approved migration as version `20261123234251` on November 23, 2026. Both partner roles can load the seating snapshot, and the published seating assets match PR #12. The wedding had no existing table assignments to import.

For a fixture preview, run the mock server below. To exercise the [SQL regression suite](tests/seating-access.sql), start a disposable local PostgreSQL database with the existing Auth and Storage test stubs and migrations through the interactive menu. Run `psql -X -v ON_ERROR_STOP=1 -d <local-test-db> -f tests/seating-access.sql`. The suite seeds synthetic legacy labels, applies the seating migration inside a transaction and rolls back.

The `--planner-columns` property in `docs/styles.css` controls how many sections appear in each navigation row. The bottom-right arrow returns keyboard focus to the active planner section after the navigation has scrolled out of view.

### Interactive menu — prepared November 17, 2026

**08 · Our menu** adds courses, selectable dish/photo cards, vendor links/grouping, ratings, and fixed, shared per-person, confirmed-choice, or planned-quantity pricing. Active attending guests can receive a meal per course from the guest list or menu. The table-sorted caterer manifest keeps meal choices, dietary requests and caterer confirmation separate, with dish counts, missing-choice review, CSV export and print styles. One linked expense supplies the budget forecast without duplicating catering; booked agreements and payments remain unchanged. See [pricing rules, verification and rollout](MENU-VALIDATION.md).

The additive `20261117141256_interactive_menu_planning.sql` migration adds three membership-protected tables, the private `menu-photos` bucket, optional guest table labels and one catering expense link. It was **applied with explicit approval to `beyas-big-day` on November 17, 2026**, recorded as version `20261117141256`. The SQL filename matches hosted history. The menu frontend was merged in PR #9. See the [menu acceptance record](MENU-VALIDATION.md) for the hosted checks and outstanding two-account, photo, and print scenarios.

### Day-of itinerary — deployed November 14, 2026

The new **07 · Day-of itinerary** implements the original brief's wedding-day timeline as a separate section. Activities have start/optional end times, editable track labels (Ben, Maya, Together, or custom), location, notes, and an optional vendor link. The combined plan allows parallel activities and shared milestones, supports after-midnight starts/finishes, and follows the wedding date without changing saved clock times. A track filter and print layout provide combined or individual-track copies. Entries use membership RLS, Realtime, optimistic versions, and the existing confirmed deletion/audit workflow. No sample rows are inserted into the live wedding.

See [itinerary validation](ITINERARY-VALIDATION.md) for checks and rollout details. PR #6 is published, and the separately approved migration was applied to `beyas-big-day` as version `20261114202132`. The SQL file was renamed to match hosted history without changing its content; do not apply it again there. Both member-role snapshots enable `itinerary_ready`, the existing snapshot contract remains available, RLS and Realtime are enabled, outsider reads are isolated, and all 17 signed-out API checks pass. Existing record counts are unchanged; the live itinerary starts empty. Security advisors report only the preexisting disabled leaked-password-protection warning.

The existing Schedule remains the planning agenda and does not duplicate itinerary rows. Local validation includes 52 Node tests, static checks, the full SQL access chain and security advisors. Actual two-account browser delivery and print/PDF pagination remain separate checks. Future shared migrations and publication still require explicit approval.

### Beta guest import

Once the guest import migration is applied, open **03 · Guest list → Import guest CSV** and download the blank template. Fill one row per person. Use the same household label for people on one invitation and distinguish separate invitations with similar names. The required headers are `household` and `guest_name`. For an unnamed plus-one, leave the guest name empty and set `companion` to `yes`. Optional columns include RSVP, household email, phone and mailing address, and a person’s dietary notes. Leave unknown values blank. Save the file as comma-separated CSV UTF-8.

Review the household and guest counts before confirming. Validation identifies errors by line and field. Imports add new households only. Existing or archived household names and repeated named guests within one household require review. Each file supports 1,000 people and 1 MiB, with up to 50 people per invitation. The whole import commits together. A retried save reuses its receipt. For verification, run the Node tests and `tests/guest-import-access.sql` against a disposable local database after the migrations. See the [beta plan](wedding-planner-build-brief.md#invite-only-our-big-day-beta--november-24-2026).

### Run locally

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
3. For an administratively provisioned wedding, enable email/password sign-in, provision the partner accounts, and keep signup disabled. For invite-only beta enrollment, configure the signup hook and verified email flow in [the rollout guide](BETA-ENROLLMENT.md). Password recovery uses the default Supabase implicit email-link flow.
4. For manual provisioning on a fresh project, substitute the two Auth UUIDs in [provision.example.sql](supabase/provision.example.sql), review the names, currency and time zone, and run it once. It creates a wedding, two memberships and blank starter categories. Record the returned wedding UUID for access checks. Beta participants create their wedding by accepting an operator invitation.

   The configured `beyas-big-day` project already has the shared wedding, Ben and Maya’s memberships, and nine starter categories, provisioned on November 13, 2026. Do not run provisioning again there. Each partner must confirm their own email before signing in.
5. Set `supabaseUrl` and `publishableKey` in [docs/config.js](docs/config.js). Only the project URL and `sb_publishable_…` key belong in the public repository. Never use a secret or service-role key. This frontend supports hosted `https://<ref>.supabase.co` projects; custom domains/self-hosted Auth require corresponding URL/CSP changes and verification.
6. Verify that `public` is exposed through the Data API. The migration explicitly grants only required table operations to `authenticated`, revokes anonymous and destructive access, and enables RLS on all nine tables. Its helper is in the non-exposed `private` schema; **do not expose that schema**. Ensure Realtime is enabled and that all nine tables are in the `supabase_realtime` publication (the migration adds them when that publication exists).
7. Run the project’s security advisors in Supabase before entering real data. Follow [the two-account verification guide](VERIFICATION.md).

### Guest list and checklist migration

The additive [guest/checklist migration](supabase/migrations/20261113203508_guests_and_checklist.sql) creates `invitations`, `guests`, and `tasks`, adds an optional planning headcount, and extends the existing snapshot/Realtime subscription data. It enables membership RLS, explicit grants, composite same-wedding references, and optimistic edit versions on every new table. `create_household` saves a household and all its initial guest seats in one transaction using stable client IDs for retries. No real guests, sample prices, or starter tasks are inserted automatically.

This migration was approved and applied to `beyas-big-day` on November 13, 2026; its filename matches the recorded hosted migration version. Do not apply it again there. For a fresh project, apply it after the base schema with explicit target approval. Then merge the frontend PR. If frontend publication happens first, the new pages show a preparation state while the existing budget continues to work. Planning headcount supplies the default for **new** per-person quotes; it never changes an existing quote or agreement automatically.

Email/password setup follows [Supabase Auth documentation](https://supabase.com/docs/guides/auth/passwords); access controls follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). The dependency-free client uses the documented [Realtime JSON protocol](https://supabase.com/docs/guides/realtime/protocol), with polling if subscription delivery fails.

## Couple-feedback migration (applied November 14, 2026)

The [feedback migration](supabase/migrations/20261114163318_couple_feedback.sql) follows the two existing migrations. It adds event/photo/history tables and membership policies, private `vendor-photos` Storage, guest attribution, vendor ratings, tombstones, audited edits, deletion cascades, and explicit unbooking. It changes the previous append-only payment behavior to editable records with immutable history. No existing wedding records are deleted by applying the migration.

This migration was approved and applied to `beyas-big-day` (`nennjenlgfkblsmpkzfr`) on November 14, 2026. Its filename matches the recorded hosted version; do not apply it again there. Post-rollout checks confirmed `feedback_ready=true` under both member roles, outsider isolation, unchanged existing record counts, membership RLS and restricted grants on all three new tables, event/photo Realtime publication, a private 5 MB image bucket, and all 16 signed-out API denials. Security advisors reported only the existing disabled leaked-password-protection warning, with no schema-policy warnings.

For a fresh project, apply it after the existing migrations only with target approval. The local suite used PostgreSQL 16.4 with test-only Auth/Storage stubs. Never run `tests/bootstrap.sql` or `tests/storage-bootstrap.sql` on Supabase. Actual hosted photo upload/download and real two-account browser synchronization remain acceptance checks; role-level reads are not proof of those behaviors. If a future frontend is published before its migration, `feedback_ready` prevents unsupported writes.

Private photos upload through authenticated Storage, then save metadata using the existing pending-save mechanism. An interrupted upload can leave an unreferenced private object; retry the attachment before adding another. Deleting an attachment removes its metadata from the gallery; retained objects are not a physical-erasure feature. Deleting the vendor denies access to its Storage paths. Picture URLs are local authenticated blobs and are revoked on sign-out. The main app does not load Pinterest scripts; the sandboxed preview cannot access its session storage.

## GitHub Pages

The repository remote is [iTriedaThing/beyas-big-day](https://github.com/iTriedaThing/beyas-big-day). The release source is **main → /docs**, and the app URL is [Beya’s big day](https://itriedathing.github.io/beyas-big-day/). Continue normal development on feature branches; promotion to `main` publishes the Pages frontend and requires release authorization.

After reviewing the feature branch and authorizing its promotion to `main` and Pages publishing:

1. Start a meaningful typed branch from current `main`, commit verified units there, push related commits together, and open a PR into `main`. Do not commit or push implementation directly to `main`. Merge only with approval; merging into `main` triggers Pages publication. Do not publish private wedding data, exports, or credentials in Git.
2. Under **Settings → Pages → Deploy from a branch**, select **main → /docs**. All entry assets use relative paths; there is no SPA route rewrite or build action to configure.
3. Set Supabase’s production Site URL and allowed redirect URL to the exact Pages project URL, including repository path and trailing slash: `https://itriedathing.github.io/beyas-big-day/`. Email links return to this page. The app validates the returned session with Supabase before using it, immediately removes tokens from the URL, and shows a new-password form for recovery/invite links. Confirmation links restore a normal session. Expired, malformed, or unsupported PKCE-code links show an actionable error; use the default implicit-flow email templates. Consult [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. Open the published URL in a signed-out browser before signing in. Run the checks in [VERIFICATION.md](VERIFICATION.md) with test data before entering real prices or payments.

Routine completed units of work are committed and related commits are pushed together under the user’s standing Git workflow preference. No hosted migration, account provisioning, release promotion, or deployment is implied by a commit or push; those actions need separate authorization.

### Install on a phone

- **Android Chrome** opens the install action from its browser menu.
- **iPhone Safari** offers **Share → Add to Home Screen**. Turn on **Open as Web App** if shown and tap **Add**. iPhone Chrome also offers **Add to Home Screen** from Share.

Open **Our Big Day** from the home screen and sign in with your existing account. The planner uses its existing online connection.

## Data and calculation rules

- All money is integer cents, with strict decimal parsing. The release supports USD, CAD, GBP, EUR, AUD, and NZD (two decimal places). Each amount is limited to 1,000,000,000 cents. Currency changes are blocked once expenses exist; there is no currency conversion.
- Forecast uses the agreed price for a booked expense. For an unbooked expense linked to catering, it uses the menu estimate, including an unknown estimate. Other unbooked expenses use the preferred quote total or, failing that, the item target. Zero is an explicit amount. An unknown item makes the forecast incomplete. Category allocations sum their item targets.
- Paid is payments less refunds. Owed sums positive booked balances; credits are shown separately rather than hiding another vendor’s bill. A quote edit never changes a booked agreement.
- An installment is settled only by its linked transactions. Unallocated payments are flagged for reconciliation; they still reduce the expense balance. Refunds may reopen an installment. Scheduling does not create additional expenses or payments. The app shows the installment schedule alongside the agreement so discrepancies can be reconciled.
- After the feedback migration, payments/refunds are editable with optimistic version checks. Original recorder/creation attribution stays immutable; private `record_history` stores before/after rows and the editor. Deletion removes the record from totals and exports while retaining history. Unbooking/deleting a record only changes this planner: it does not cancel a vendor contract, refund money, or transfer funds. Before that migration, the original append-only payment rules still apply.
- Dates are calendar dates (`YYYY-MM-DD`), interpreted in the wedding’s IANA time zone. Transactions preserve the selected date, not a UTC timestamp converted on another phone. Audit timestamps use `timestamptz`.
- Database membership and composite foreign keys protect every relationship. Browser configuration is public; wedding records stay in Postgres behind RLS. Data snapshots use one database statement to avoid mixed totals during concurrent writes.
- Sessions and unconfirmed saves use **sessionStorage**, scoped to this browser tab and project/account. Reloading preserves them, but closing the tab may discard them. After a network failure, use **Retry pending save** in the same tab before entering that transaction again. There is no offline editing queue or cross-device unsaved draft recovery. Sign-in is required again in a new tab/browser session.

## Verification performed

- The maintainability review passed all 73 Node tests, including pending-save recovery, paused installment allocation, conflicting partner edits, photo eviction, and menu calculations. The app wiring test uses an in-memory DOM adapter. A separate Chrome fixture check exercised all nine sections and a checklist edit at 1280 × 900 and 390 × 844.
- `node scripts/check.mjs`: syntax, entry assets, and relative asset checks passed. There is no separate lint/typecheck/build toolchain configured.
- Migration applied successfully to isolated **PostgreSQL 16.4** with test-only Auth stubs. [tests/access.sql](tests/access.sql) passed: two-member reads, outsider isolation across every table, signed-out denial, administrative memberships, same-wedding/expense references, immutable ledger, actor checks, retry deduplication, atomic purchase rollback, version conflicts, preserved quotes, and amendment history.
- Supabase CLI v3.1.0 security advisors against that local test database: **No issues found**.
- Hosted `beyas-big-day` after the approved migration: all nine tables have RLS enabled, no anonymous SELECT or authenticated TRUNCATE grants, all nine tables are published to Realtime, and security advisors returned no issues. All ten signed-out Data API checks passed with database permission denials. The wedding and two memberships are provisioned; hosted RLS checks under each member’s database role see the same wedding, both members, and all nine categories, while an unrelated simulated user sees no records. Real two-account sign-in/sync verification remains outstanding.
- Browser fixture checks: sign-in form, deposit totals, single-entry paid-in-full purchase, vendor/quote display, no console warnings/errors, and phone-width document geometry. These are **mocked UI checks**, not proof of hosted Auth, email delivery, or Realtime. Complete the hosted checks separately.
- Recovery browser fixtures: email-link tokens disappear from the URL, recovery survives reload, mismatched passwords are rejected, a synthetic password update returns to sign-in, and reset requests show a generic success message. These checks use no real account credentials and send no email.
- Guest/checklist migration and [planner access suite](tests/planner-access.sql) passed in isolated Postgres: atomic household rollback/retries, individual seat counts, same-wedding links, restricted assignees, seed deduplication, version conflicts, member reads and outsider/signed-out denials. Local security advisors returned no issues.
- After the approved hosted planner migration, all three added tables have RLS enabled, anonymous reads and authenticated truncation are denied, all twelve tables are published to Realtime, and all 13 signed-out API checks passed. The new tables remain empty until the couple enters data or imports the starter checklist. Hosted advisors reported an Auth warning for disabled leaked-password protection; review [the password-security setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) separately. No schema-policy warnings were reported.
- Desktop/390-pixel browser fixtures verified household creation, RSVP changes, search, multiple dietary flags, task completion and progress, repeated starter imports, and responsive layout with no horizontal page overflow or console errors. The fixture uses sample people and dates; none are copied into the live wedding.
- Feedback migration plus [feedback access tests](tests/feedback-access.sql) passed in a fresh disposable PostgreSQL database: audited payment edits, stale edits/deletions, recorder protection, unbooking, deletion cascades/retries, deleted-parent guards, household attribution, event isolation, private photo-path policies, and signed-out/outsider denial. Supabase CLI security advisors returned **No issues found** against that local database. Existing base/planner SQL tests were rerun at their original schema versions and passed before the feedback migration changed their contracts.
- The [feedback browser acceptance run](BROWSER-ACCEPTANCE.md) succeeded against the mock preview at `localhost`, covering all fourteen items with documented limits. It found and fixed clipped intermediate-width money cards, CSS overriding a hidden history button, a missing Pinterest JSONP origin in the isolated frame's CSP, and a decorative star intercepting Forecast clicks. Retests included a visibly rendered public Pinterest board, every deletion type, payment corrections/history, guest attribution CSV, picture validation/gallery/sign-out, schedule/ranking flows, polling retention, keyboard operation, and phone-width geometry. Actual hosted Storage and two-device sync, physical-phone behavior, external popup navigation, and delivery of the second Budget CSV remain outstanding.

### Run the complete database suite locally

Point `psql` at a **fresh, disposable local PostgreSQL database**. Use a local administrator account that can create test roles and schemas and enable function statistics. The suite installs Auth and Storage stubs, then runs the access tests at the migration versions they cover.

```sh
psql -X -d YOUR_DISPOSABLE_DATABASE -f tests/all.sql
```

The [snapshot regression](tests/snapshot-access.sql) compares the full planner response before and after the [snapshot optimization](supabase/migrations/20261124041840_materialize_budget_snapshot.sql). It verifies that each underlying snapshot and the menu estimate are computed once per refresh. Supabase recorded the approved rollout to `beyas-big-day` as version `20261124041840`. The full hosted snapshot checksum matched before and after rollout. Both partner roles could read the planner, the outsider role received no wedding data, and the signed-out role lacked snapshot execution privileges.

Run `node scripts/check-public-access.mjs` to verify that the configured hosted project's nine tables and budget-snapshot RPC deny signed-out Data API requests. This uses only the publishable key, writes no records, and does not replace the member/outsider checks in `VERIFICATION.md`.

After the planner migration is applied, add `--planner` to check all twelve tables and the snapshot RPC (13 signed-out access checks).
