# Browser acceptance — November 14, 2026

Followed FEEDBACK-VALIDATION.md in the actual in-app Chromium browser at `http://localhost:4174/`. The mock server intercepted Auth/data/photo requests; no live wedding records or hosted schema were changed. Pinterest was tested using the public example board from its documentation, not the couple's board.

Using `localhost` succeeded where the earlier `127.0.0.1` browser attempt timed out. The initial branch was `b5483c9`; the fixes below were applied and retested during this walkthrough.

## Bugs found and fixed

1. **Money cards clipped at intermediate widths.** The four-column layout persisted too long. Use two columns through 1050px and allow amounts to wrap. Retest: full values visible at the default intermediate width; effective content widths 1265px, 805px, and 375px had no page overflow or amount-content overflow.
2. **History displayed a Save button.** Author CSS `display:inline-flex` overrode the HTML `hidden` attribute. Add a global `[hidden]{display:none!important}` rule. Retest: the history Save button is no longer visible; normal create/edit dialogs still show Save, and paid-in-full fields show only after choosing that mode.
3. **Pinterest stayed on its fallback link.** The widget injects a board-data JSONP script from `widgets.pinterest.com`, which was absent from the sandboxed preview's CSP. Permit that exact script origin only in the preview and remove the hard-coded 1000px board width. Retest: the official widget visibly rendered the public Anapin Skywalker / Style board and its pins. The main planner still permits only same-origin scripts; the frame still lacks `allow-same-origin`.
4. **The decorative star blocked Forecast clicks.** The card's decoration painted above the stretched link in its lower-right area. Disable pointer events on the decoration and place the link overlay above it. Retest: clicking that previously blocked area changes the anchor to `#expenses` and the expense section settles 24px from the viewport top. Amount-area clicks and Enter activation also work.

## Acceptance results

| Item | Result | Observed evidence |
| --- | --- | --- |
| Time-zone dropdown | Pass in mock | Selected America/Chicago, saved, reopened and read the saved value; restored America/New_York. UTC is selectable. |
| Payment/refund edits | Pass in mock | $900 → $1,000 leaves one ledger row and shows $1,000 paid/$2,600 owed. History shows before/after. Edited type to refund, amount to $100, date, payer, notes and allocation; totals become -$100 net paid/$3,700 owed. |
| Budgeted amount wording | Pass | Expense create/edit fields, charts, and category/expense tables use the new wording. API/CSV fields keep their established names. |
| Deletion | Pass in mock | Tested guest, household with remaining seats, custom task, event, picture, quote, installment, payment, paid-in-full expense, category with paid purchase, and vendor with linked expense. Each confirmation explains effects; lowercase `delete` is rejected. |
| Countdown placement/states | Pass | Immediately after subtitle. Blank date → Date to come; November 14 → Today is our day; November 13 → 1 day married; June 19, 2027 → 217 days to go. Restored the fixture date. |
| Whole Forecast card | Pass after fix | Amount and decorative blank area activate the expense anchor; keyboard Enter also activates it. |
| Vendor URLs | Partial browser evidence | Safe anchors exist in vendor and offer details with `_blank` and `noopener noreferrer`; activation was exercised against example.com. A new external page was not observable in IAB's tab list, so new-window navigation is not claimed as verified. |
| Unbook agreement | Pass in mock | Requires reason; returns Catering to $4,000 planning forecast with the $900 payment retained and reminders absent. History contains reason. Explicit rebooking restores the installment schedule. |
| Chart comparison reset | Pass | Forecast remains selected through more than 60 seconds, polling, manual Refresh, and tab changes. Paid also remains selected while using other workflows. |
| Guest attribution/export | Pass in mock | Two named guests and a companion inherit Ben; changed one to Maya and another to Together/unspecified. Downloaded guest CSV was read from disk and has those three correct attribution values. |
| Pictures | Pass in mock | SVG, empty, and >5 MB files reject. Synthetic PNG displays at natural 240×140 dimensions through a blob URL, survives Refresh, disappears on sign-out, and gets a new blob URL after sign-in. Gallery deletion removes it. |
| Unified schedule | Pass in mock | Tours, open dated tasks and an outstanding installment appear once in date order. Created a tasting with date/time, location, vendor and notes; completed it, found it under All, edited to a past date, found it under Past, then deleted it. |
| Vendor/venue ranking | Pass in mock | Created a 5/5 venue and changed the existing contact to a 3/5 venue. Cards show the 5 first; offer ratings stay 4/5 and 5/5 independently. |
| Pinterest | Pass with public example board | Short link rejected; full board renders after CSP fix; fallback link remains available; saving blank removes the preview. Secret-board/login behavior was not tested. |

Deletion effects were checked explicitly: installment deletion keeps the $900 payment unallocated; payment deletion leaves $0 paid/$3,600 owed; deleting a paid purchase removes both expense and payment; category deletion removes its paid purchase; vendor deletion removes its linked expense/offers/schedules and retains a visit with no vendor name. These are fixture behaviors, backed separately by the previously completed SQL access/cascade tests.

## Layout, keyboard, and downloads

- All six sections were checked at a phone-width layout (375px content width) with no page-wide horizontal overflow. Cards were also measured at intermediate and desktop widths; each amount's content width matched its available width after the fix. Wide tables stay inside their scrolling containers.
- A long custom task title and repeated notes wrapped without page overflow. Its editor had equal client/scroll widths of 337px on the phone viewport. Tab from its title moved to the planning-window control. Escape closed settings. These are desktop browser keyboard tests with viewport resizing, not a physical phone or on-screen keyboard test.
- Guest CSV passed attribution inspection. Expense CSV downloaded and contains Catering forecast `360000`, net paid `90000`, and owed `270000` cents.
- **The second Budget CSV (payments) did not arrive in IAB.** Its source action attempts two downloads, and README already notes that multiple-download permission may be needed. Do not count payments CSV delivery as passed; verify it in a normal browser with the site's download permission. No general export redesign was added to the fourteen-item scope.
- No warning/error console entries were captured in the final parent-tab check. This is not a full accessibility audit, exhaustive event-log capture, or performance benchmark.

## Still required before release

Actual hosted Storage uploads/downloads and MIME/size enforcement, unrelated-user/signed-out photo access, real two-account sign-in and Realtime/conflict behavior, physical-phone/on-screen-keyboard checks, new-window website navigation, and payments CSV delivery remain unverified in the deployed environment. The approved hosted migration and release merge/publication are still pending authorization. No database migration changed during this browser pass.

The couple's original checked-off checklist was not modified. This report records the new acceptance run separately.
