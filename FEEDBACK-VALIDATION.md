# Couple-feedback acceptance

Scope: only the fourteen items Ben and Maya selected after their November 13 walkthrough. The earlier suggested backlog is deferred. Their checked-off validation document has not been changed.

## Ready for review

All 46 Node tests and static syntax/asset checks pass. The base and planner SQL suites passed at their original migration levels. The new feedback migration/access suite passed in a fresh disposable PostgreSQL 16.4 database with Auth/Storage stubs; local security advisors found no issues. App-level mock checks cover form/action wiring and the chart-polling regression, not real browser layout.

No hosted migration, live record edits, release merge, or Pages publication was performed. Browser testing was blocked by localhost timeout and a Windows computer-use URL verification failure. Perform the checks below before releasing.

## Validate in the mock preview first

Run `node scripts/preview-fixture.mjs`, open `http://127.0.0.1:4174/`, and use example credentials. Reload resets all sample records. No request is sent to the real Supabase project.

1. **Time zone:** Wedding settings has a dropdown, including the existing zone. Select another zone, save, and verify. Saved aliases and UTC remain selectable.
2. **Edit payment/refund:** edit the $900 deposit to $1,000. Catering shows $1,000 paid and $2,600 owed; one ledger row remains. Change type/date/payer/notes/allocation and inspect History. Correct it back before other checks.
3. **Expense wording:** creation, editing, category tables, charts, and detail actions use “Budgeted amount.” The CSV/API field remains `target_cents` for compatibility.
4. **Delete records:** type DELETE in the confirmation. Test a guest, household, task, quote, installment, payment, expense, vendor, category, event, and picture attachment. Confirm linked effects match the explanation. Use mock data for financial deletion tests.
5. **Countdown:** appears immediately below “A little planning. A lot of love.” on each section, with sensible undecided/today/past states and no duplicate countdown lower down.
6. **Forecast card:** click its amount and empty space, not only the word Forecast; each scrolls to expenses. Keyboard focus still provides a normal link.
7. **Vendor website:** safely opens the vendor site in a new tab from vendor and quote details; invalid/executable URLs never become links.
8. **Unbook:** enter a reason on Catering. It returns to planning/$4,000 budgeted forecast, with payments preserved and installment reminders paused. History shows the unbooking. Rebook explicitly to resume schedules; no real contract is canceled.
9. **Chart reset:** select Forecast, wait at least 25 seconds, switch sections and back, then Refresh. Forecast stays selected. Repeat with Paid.
10. **Guest attribution:** create a household from Ben; its people show From Ben. Edit one to Maya, another to Together/unspecified. Export the guest CSV and inspect the attribution column. This is an invitation-side label, independent of who entered the record.
11. **Pictures:** attach a JPEG, PNG, or WebP to a vendor/venue, with caption. Check gallery, refresh, and deletion. Empty, SVG, and >5 MB files are rejected. Browser sign-out clears pictures. Actual Storage behavior needs the hosted checks below.
12. **Relevant dates:** Schedule has tours, tastings, appointments, open dated tasks, and outstanding installments. Add/edit/complete/delete an event, optionally link a vendor, and verify chronological order and local times. Try Upcoming, Past, and All. Task/payment actions edit the original record.
13. **Rank vendors/venues:** give several vendors/venues different overall 1–5 ratings. Cards sort highest first, then by name for ties; offer ratings stay independent.
14. **Pinterest:** link a full public `https://www.pinterest.com/username/board/` URL. Check the in-app board preview and fallback link. Save blank to unlink. Shortened pin/profile links are rejected. Secret boards cannot be embedded; Pinterest’s widget is a limited preview and may depend on browser privacy settings. The mock can still contact Pinterest when you choose to link a board.

For every section, check phone width, keyboard operation, focus, dialogs with the keyboard open, long names, and useful errors. Add no real credentials or private photos to Git or test fixtures.

## Deletion and financial rules

| Record deleted | Result |
| --- | --- |
| Category | Related expenses, quotes, schedules, and payments disappear from active totals. The category name can be reused. |
| Vendor/venue | Its linked expenses and their financial records, its offers, and its pictures disappear; visits remain without that vendor link. |
| Expense | Its quotes, installments, and payments/refunds disappear from active totals. |
| Household | Its guests disappear from active counts. |
| Installment | Payments stay but become unallocated. |
| Preferred quote | Preference is cleared and the expense falls back to its budgeted amount. Unbook before deleting a booked quote. |
| Payment/refund | Balances recalculate; real money is unaffected. |
| Guest/task/event/picture | Removed from its active view, counts, and applicable exports. |

Deletion uses retained private tombstones/history, not physical erasure. Deleted records cannot be restored through the app. Existing guest/task archive/restore remains a separate reversible option. Deleted starter tasks stay deleted when the starter list is reimported. Unbooking keeps payments and existing schedules for reference; rebooking can reactivate those schedules, so review them.

## Approved hosted rollout — still pending

The user's Git/database instructions require separate authorization before applying shared database migrations or merging a PR that publishes Pages.

1. Confirm the intended target is `beyas-big-day` (`nennjenlgfkblsmpkzfr`) and review `20261114153958_couple_feedback.sql`, especially audited payment updates, tombstones, cascades, and private Storage policies.
2. With explicit authorization, apply the migration once using the recorded migration workflow. Do not run the Auth/Storage bootstrap stubs there. No preexisting wedding rows need to be deleted or bulk-updated.
3. Check hosted security advisors and run `node scripts/check-public-access.mjs --feedback` (16 signed-out checks). Inspect the private bucket's 5 MB/MIME restrictions and membership-only policies.
4. Verify actual authenticated photo upload/download, cross-wedding and signed-out denial, two-account changes/deletion/conflicts, and Realtime for events/photo metadata. A Storage stub cannot prove these service behaviors.
5. With separate release authorization, merge the verified PR to main, which publishes GitHub Pages. Confirm the new assets and `feedback_ready` views on the published URL, then repeat the fourteen acceptance steps with deliberately chosen test records. Financial edits/deletions change shared records, so choose those examples explicitly.

To reproduce the new SQL checks, create a fresh disposable database and run:

```sh
psql -v ON_ERROR_STOP=1 -d YOUR_DISPOSABLE_DATABASE -f tests/bootstrap.sql -f supabase/migrations/20261113132432_shared_budget.sql -f tests/access.sql -f supabase/migrations/20261113203508_guests_and_checklist.sql -f tests/planner-access.sql -f tests/storage-bootstrap.sql -f supabase/migrations/20261114153958_couple_feedback.sql -f tests/feedback-access.sql
```

The two original access suites run before the new migration because they intentionally test the old immutable-payment/no-unbooking contract. The new suite tests its replacement and the continuing membership boundaries.
