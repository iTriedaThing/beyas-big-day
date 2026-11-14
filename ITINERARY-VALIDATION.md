# 07 · Day-of itinerary

Implements the wedding-day timeline in the original build brief: simultaneous preparations for each partner, shared milestones, locations, a combined time-ordered view, and a printable copy. This is a separate section from Schedule, which continues to hold planning appointments, tasks, and installment dates.

## Behavior

- Add an activity with a required name, start time, and track. End time, location, vendor/venue, and notes are optional.
- Track labels are editable per activity. Suggestions include Ben, Maya, Together, and existing labels; a custom Wedding party or Photographer track works too. The combined view keeps simultaneous entries and lists a shared activity once. Choose a track to view or print just that track.
- Activities follow the wedding date and wedding time zone. The date can remain undecided while planning. Changing it updates displayed dates without rewriting the activity times.
- Choose Wedding day or Following day for an activity starting after midnight. An end time earlier than the start means an overnight finish; the actual following date is shown. Equal start/end times are rejected; omit the end time when undecided. Times have minute precision.
- Editing uses optimistic versions. Deletion uses the existing typed confirmation and private audit/tombstone rules. Deleting a linked vendor detaches the link while preserving the activity, location, and notes.
- Print itinerary uses the browser's print/save-to-PDF dialog and current track filter. Print styles hide account/navigation/buttons and include wedding name, date, time zone, track, times, activities, locations, and notes.
- No expenses, payments, tasks, appointments, example activities, or notifications are created automatically. The three example activities appear only in the mock fixture.

## Verification

- `node scripts/check.mjs`: passed.
- `node --test tests/*.test.mjs`: 52 tests passed. New cases cover validation, parallel ordering, tracks, midnight/year/month/leap-day boundaries, wedding-date changes, escaping, empty/migration-pending states; the app fixture covers create/edit/filter/delete wiring.
- All four migrations and their access suites passed in a fresh disposable PostgreSQL 16.4 database. New SQL checks cover partner reads, outsider/signed-out denial, snapshot compatibility, same-wedding/active vendor links, immutable ownership, input boundaries, audited edits, stale edits/deletions, deletion retries, tombstone protection, and vendor detachment.
- Supabase CLI security advisors against that local database: **No issues found**.
- Browser mock acceptance: see the run record below. This does not prove hosted authentication, physical-phone keyboards, actual printer output, or Realtime between real accounts.

## Browser acceptance run

At `http://localhost:4174/`, confirmed section 07 appears separately and displays Ben and Maya getting ready at 9:00 AM in different rooms, followed by one 11:00 AM ceremony. Added a custom-track activity with vendor, location and notes; equal start/end validation preserved the form; a 11:30 PM–12:15 AM activity displayed the next date. Edited it to a following-day 12:30 AM activity and confirmed it sorts after the wedding-day entries. Changing the mock wedding date updated the following date and preserved local times. Filtering to the custom track, editing, long text, typed deletion, and returning to All tracks worked. At 375px content width, page scroll width equals viewport width and long activity/notes content remains inside the page. Maya's filter survived manual Refresh and 55 seconds of foreground polling, showing only her activity and the correct print metadata.

The automated Print itinerary click entered the blocking native print flow and timed out; the page remained behind it with the print action pending. The mock tab was closed to end that flow. Actual print-preview pagination and PDF/printer output are **not verified**; check those in a normal browser before relying on a handout. No physical print or PDF save was submitted.

## Repeat manually

- [ ] Open 07 · Day-of itinerary. Add Ben and Maya preparations at 9:00 in two locations, then a Together ceremony at 11:00. All tracks shows both preparations and one ceremony.
- [ ] Add an activity with a custom track, vendor, location and notes. Edit its time; filter by track; Refresh and wait 25 seconds. The selected track stays selected.
- [ ] Try a missing start time and equal start/end. The editor stays open with required-field or useful validation feedback.
- [ ] Enter 23:30–00:15 on Wedding day. The end is labeled with the following date. Add a Following day start of 00:30 and confirm order.
- [ ] Change the wedding date; relative dates move while clock times stay fixed. Clear the date; the itinerary remains editable with Date to be decided.
- [ ] Delete a test activity with typed DELETE. It disappears from the current view and printable copy. Delete its test vendor separately and confirm other linked activities survive without the vendor name.
- [ ] View at phone width with long names/notes; keyboard Tab and Escape work; no page-wide horizontal scrolling.
- [ ] Print All tracks, then a single track. Review page breaks, dates, rooms and notes in print preview. Account email/navigation/edit buttons should not print. Cancel unless a physical print/save is wanted.
- [ ] In an approved hosted environment, use two accounts to verify updates and stale-edit protection. Confirm unrelated users cannot read or mutate itinerary data and run `node scripts/check-public-access.mjs --itinerary` (17 signed-out checks).

## Hosted rollout — November 14, 2026

The user merged PR #6 and explicitly approved the [day-of migration](supabase/migrations/20261114202132_day_of_itinerary.sql) on `beyas-big-day` (`nennjenlgfkblsmpkzfr`). Supabase recorded version `20261114202132`; the file was renamed to match that history without changing its SQL. Do not apply it again to that project. Its additive schema has a membership-protected `itinerary_items` table, Realtime publication, the existing audit/version guards, and an additive snapshot wrapper; the previous snapshot stays as a non-exposed security-invoker helper.

Post-rollout verification passed: both member-role snapshots return `itinerary_ready=true` and preserve `feedback_ready` and wedding access; unrelated-user reads remain isolated; RLS is enabled; anonymous SELECT and authenticated physical DELETE/TRUNCATE are denied; the snapshot helper remains security invoker; Realtime includes the itinerary table. All 17 signed-out Data API checks pass. The published `app.js` and `itinerary.js` match PR #6. Existing record counts match preflight, and no sample activities were inserted. Security advisors report only the preexisting [disabled leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), with no new schema-policy warnings.

The section is now available after refreshing the live app. Actual two-account browser synchronization and print/PDF pagination are not established by role-level reads and remain manual checks. For future fresh-project deployments, obtain explicit target approval, apply the migration after its dependencies, verify access/security, and publish only with release authorization. `itinerary_ready` prevents unsupported writes if a frontend is published before its migration.

To repeat locally on a **fresh disposable database**, run the setup/access chain documented in FEEDBACK-VALIDATION.md, then:

```sh
psql -v ON_ERROR_STOP=1 -d YOUR_DISPOSABLE_DATABASE -f supabase/migrations/20261114202132_day_of_itinerary.sql -f tests/itinerary-access.sql
```

Never run test Auth/Storage bootstrap files against hosted Supabase.
