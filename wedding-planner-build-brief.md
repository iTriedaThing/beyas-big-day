# A shared wedding planner for two

Feature inventory and engineering brief · November 12, 2026

On either phone, the opening screen should tell you what the wedding is likely to cost, how much you’ve paid, and which payment comes next. The guest list, RSVPs, checklist, and menu give those numbers context as the plans change.

## What the reel demonstrates

Times are approximate points in the 12.5-second ad. The middle column records visible behavior. The right column describes the proposed app. [Your Wedding Mate’s Instagram reel](https://www.instagram.com/p/DcZd9CjMPdv/)

| Scene | What appears in the Google Sheet | How the app would handle it |
| --- | --- | --- |
| 0:03 · Guest information | Each guest row has a name, a numeric plus-one dropdown, a gift checkbox, a color-coded guest tag, and a table assignment. | Group people by invitation. Add named or unnamed companions, mark gifts received, and filter by relationship or table. Each invited person gets one seat in the headcount. |
| 0:06 · Expense tracking | Sections such as Food and Decor contain line items, budget and actual amounts, and totals. Paired bars compare budget with actual by category. A doughnut shows the expense breakdown. | Enter each expense once. Group it by category and generate both charts from the same ledger. Tap a category to see the items behind its total. |
| 0:08 · RSVP tracking | The guest list includes address fields, phone, email, and a save-the-date checkbox. The chart changes as the percentages for yes, no, and no response change. | Store shared contact and mailing information on an invitation. Record each person’s reply and show counts alongside percentages. Both partners can find the households that still need a follow-up. |
| 0:09 · Planning checklist | Tasks sit in windows before the wedding, including 12+ months and 6–4 months. Checking a task changes completed and to-do counts and the percentage for that window. | Start with editable tasks grouped by the same windows. Either partner can check one off. When a wedding date is set, the app can show an upcoming list and support specific due dates. |
| 0:11 · Menu selection | Starter and main-course panels show photos and dish names. An options table has selection checkboxes, dish name, rating, quantity, cost, vendor, and notes. | Compare dishes by course and keep multiple selections. Show chosen dishes with their photos and give the couple a place to record dietary requests and the caterer’s answers. |

The ad calls its RSVP feature “integrated.” The visible evidence establishes that the guest list and chart work together. How replies enter the sheet and what the sheet counts as an “actual” expense are both unspecified.

## What the website adds

The public product page and preview images supply the details below. The last column specifies behavior for this app. The workbook’s formulas and guest reply process remain unverified. [Your Wedding Mate][ywm-home] · [Wedding Dashboard][ywm-product]

| Workflow | What the public site shows | How to build it here |
| --- | --- | --- |
| Budget and home screen | The dashboard brings together the countdown, currency selector, spending charts, invitation counts, checklist progress, today’s tasks, and selected menu. The budget preview highlights categories over target. One public preview also displays paid amounts, balances, and due dates. [Dashboard preview][ywm-dashboard] · [Budget preview][ywm-budget] | Lead with forecast, paid, owed, and the next payment. Show each category’s dollar difference from its target even when the wedding as a whole is under budget. Link each figure to its underlying records. Put the countdown and other planning summaries below the money. |
| Vendor comparison and booking | The site describes comparing vendors and tracking contacts, notes, and payments. The selected-vendor view draws from the comparison sheet and shows the chosen package, price, and contact details by service. [Vendor preview][ywm-vendors] | Compare packages for the same job side by side, including price, what is included, contact details, the couple’s rating, and notes. Mark a preferred quote to use in the forecast. Booking records the agreement on the existing expense. The vendor’s page then shows the deposits and balance from that expense. |
| Invitations and headcounts | The guest screen tracks save-the-dates and formal invitations separately, alongside replies, confirmed guests including companions, and dietary counts. [Guest and menu preview][ywm-guests] | Record each mailing once per household. Show the number of households sent each mailing and the number still to send. Count yes, no, and pending per invited person. A couple receiving one envelope can give two different answers. |
| Meals and dietary needs | The menu includes drinks and desserts alongside starters and mains. The guest sheet has multiple dietary flags, and the site describes recording preferences. [Guest and menu preview][ywm-guests] · [Feature descriptions][ywm-home] | Let each attending guest choose from the selected dishes when choices are offered. Keep their preference, stated allergy or restriction, and the caterer’s confirmation in distinct fields. Give the caterer counts by dish, guests still missing a choice, and a table-by-table list of requests. |
| Ceremony and reception seating | The ceremony view draws rows around an aisle and altar and lists wedding-party roles. The reception has a head table, numbered tables, seats, and guest lists. Its instructions say other tables populate from guest-list assignments, while the head table is filled separately. [Seating preview][ywm-seating] | Give each event its own plan. Support named rows or tables, capacity, and optional seat numbers, including the head table. Let either partner move someone from the guest list or the plan. On a phone, choosing a table or seat from a list should work as well as tapping the diagram. |
| Planning calendar | The month grid places dated entries on the calendar. The checklist includes windows for one week, two days, and the day before the wedding. The site names fittings, meetings, and payments as dated commitments. [Calendar and checklist preview][ywm-calendar] · [Feature descriptions][ywm-home] | Offer a month grid and a chronological phone view. Combine dated tasks, appointments, and outstanding installments. Tap a fitting to edit the appointment or a balance to record a payment. Both views read the same dates. |
| Wedding-day timeline | The preview lays out the day’s milestones and gives each partner a preparation schedule with times, activities, and locations. Both can be getting ready at the same time. [Timeline preview][ywm-timeline] | Make a day-of schedule with editable track names for each partner and shared events. Allow overlapping activities. Offer a combined time-ordered view and a printable copy with locations for the people helping that day. |

**First use.** Let the couple choose their currency, set a cap, and enter an expense even while the date is undecided. Offer editable categories such as rentals, food, décor, invitations, photography, music, favors, and attire. Start them with blank amounts. Setting the wedding date activates the countdown and relative checklist. [Dashboard preview][ywm-dashboard] · [Budget preview][ywm-budget]

**Optional ideas from the site.** The dashboard shows a couple photo, color swatches, and tabs for a moodboard and AI notes. The seller lists a vendor-question guide, a save-the-date template, an AI planning assistant, and honeymoon sheets for budget, bookings, and itinerary. A later version could attach questions and answers to each vendor or keep honeymoon costs in a separate plan. For example, the seller’s journal suggests checking a ceremony exit with the venue and photographer. [Dashboard preview][ywm-dashboard] · [Bonuses][ywm-home] · [Ceremony planning article][ywm-journal]

The printable binder, digital invitations with RSVP tracking, and signage kit are separate products. Keep partner-entered replies in the first guest release. Guest-entered RSVPs would be a later feature with access limited to the replying household. [Add-ons][ywm-home] · [Product catalog][ywm-catalog]

## How expenses would work

Make **Budget** the landing screen, with **Add expense** and **Record payment** within reach on a phone. Show forecast, paid, outstanding, and the next installment with its date and vendor. Put the category charts below those figures, with a list of the exact dollar amounts alongside them.

| Figure | Calculation in the app |
| --- | --- |
| Budget | Set one wedding cap. Give individual items targets, then sum those targets by category. The difference between the cap and allocated targets is still available to allocate. |
| Forecast | For each item use its agreed price when booked, its current quote when available, or its budgeted amount. Use exactly one of those values. Flag items awaiting an estimate and treat an explicit zero as a real value. |
| Paid | Sum vendor payments less refunds. Record the amount, date, and payer for each transaction. Either partner can enter a payment made by the other. |
| Still owed | For each booked item, subtract net payments from its agreed price. Sum positive balances. Show an overpayment as a vendor credit. |
| Budget room | Subtract forecast cost from the wedding cap. A negative result shows how far the current plan exceeds the cap. |

Use **Budget vs. paid** as the literal label on the cash-spending chart, with a **Forecast** comparison available while vendors are still being booked. For the spending breakdown, use each category’s share of payments net of refunds. Show a dollar table when net spending is zero or a category has a net credit.

Suppose you budget $4,000 for a caterer, agree to $3,600, and pay a $900 deposit. The catering line shows $3,600 forecast, $900 paid, $2,700 owed, and $400 below its item budget. A later $2,700 payment brings paid to $3,600 and owed to zero. The caterer’s forecast stays at $3,600 throughout.

A menu priced per person can use a planning headcount for an estimate. For example, increasing the count from 80 to 90 at $75 per person adds $750 to projected catering. After booking, show the revised estimate beside the agreed price and let either partner record a contract change explicitly. Link that menu estimate to one catering expense so selecting dishes cannot create a second bill.

**Choosing between quotes.** A catering line with a $4,000 target can hold a $3,800 offer and a $3,600 offer. Its forecast starts at $4,000, becomes $3,600 when the couple prefers the second offer, and stays there when they book at that price. Keep the $3,800 offer available for reference. If a vendor quotes per guest, show the headcount used beside the comparison total. After booking, use an explicit contract amendment to change the agreed price.

**Showing an overage.** Calculate a category’s variance as forecast minus allocated target and label the result in words. For example, $4,200 forecast against a $4,000 venue allocation reads **$200 over**. A $10,000 wedding cap and $8,700 total forecast still show **$1,300 of budget room**. Recording a deposit updates cash paid and the balance due. Changing the venue forecast or its allocation updates the overage.

## Shared data and hosting

Use a separate wedding-planner repository and Supabase project. GitHub Pages serves a small HTML, CSS, and JavaScript frontend. Supabase Auth signs in each partner, and Postgres holds the couple’s records. The repository contains the app and versioned schema. Guest addresses, vendor prices, and payment history belong in the database. [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

| Records | Main fields and relationships |
| --- | --- |
| Wedding and members | Wedding date, currency, budget cap. Each member row pairs this wedding with one approved Auth user ID. |
| Categories, expenses, installments, payments | Each expense belongs to one category and holds the vendor, item target, quote, and agreed amount. An installment holds its amount and due date. Payments belong to an expense and can reference an installment on that expense. Store money in integer cents. Keep payer and person who entered the record distinct. |
| Invitations, guests, tables | One invitation holds the household address, contact details, and mailing status. One guest row represents each invited seat, including an unnamed companion. It carries RSVP, tag, gift status, and optional table. |
| Tasks | Wedding, title, time window, optional fixed due date, completion state, and optional assignee. Changing the wedding date moves relative tasks and preserves fixed deadlines. |
| Menu options | Course, dish name, selected flag, rating, quantity and unit, price and pricing basis, vendor, notes, and optional photo. A chosen menu estimate can link to an existing catering expense. |

### Data needed for the website workflows

| Extend these records | Fields and rules |
| --- | --- |
| Vendors and quotes | One vendor can offer several packages or supply several expense items. Each quote belongs to a vendor and an expense and keeps its own price, pricing basis, package details, and notes. An unbooked expense can point to one preferred quote. At booking, save the chosen quote ID and agreed amount on the expense. Build the booked-vendor list from those links and read contact details from the vendor record. |
| Invitations, guest meals, and dietary requests | Store separate sent dates for save-the-dates and invitations. Link each meal choice to the guest, course, and menu option. Allow multiple restrictions and a free-text note per person. Summarize confirmed diners, allow an explicit “choice pending,” and count a guest with two restrictions once in the meal total and once under each applicable restriction. |
| Seating plans and placements | Each plan belongs to a wedding and an event. Each row or table defines its capacity. Keep one placement per guest per plan and at most one guest per numbered seat. Read the reception table in the guest list from this placement. Save a move as one operation. If a seated person declines the wedding, release their places and exclude them from the confirmed catering count. |
| Calendar and day-of events | Store the appointment title, date, optional time, location, related vendor, and completion status. The calendar reads tasks and installments by their existing IDs. When recording a payment, offer the expense’s open installments and flag any unallocated amount for reconciliation. Show the balance due on each installment after its linked payments and refunds. Day-of entries also have a track and local start time. Use the wedding’s time zone for timed events, the countdown, and “today.” |

**Access.** Provision the two partner accounts and grant them membership in the same wedding. Restrict each exposed table to the needed operations. Use row-level security to check the signed-in user’s wedding membership on every read and write, including the resulting row on an update. Keep membership changes administrative and enforce same-wedding foreign keys between related records. Ship only the Supabase project URL and publishable key in the frontend. Use a private bucket with matching membership policies for uploaded menu photos. [API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Private storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)

**Two phones.** Save individual records. Give each new payment a client-generated UUID that survives a retry. Include a version number when editing an existing record so simultaneous changes prompt a review. Refresh after saving and when a phone regains focus. For live updates on two open screens, subscribe to changes on the shared records and refetch the affected totals. [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes)

## Path to a usable first release

1. **Ship the shared budget.** Implement sign-in, wedding cap, categories, expense entry, deposits, refunds, remaining balances, installment dates, and the two category charts. Add a CSV export of expenses and payments so either partner can reconcile the figures.
2. **Add guests and replies.** Start with partner-entered RSVPs. Show household contact details, seating, gift flags, and per-person response counts. Let the couple choose a planning headcount for per-person estimates.
3. **Complete the planner.** Add the date-based checklist and selectable menu cards. Connect selected menu costs to the budget and surface approaching task deadlines on the home screen.

Fit the website additions into that order. In step 1, add vendor contacts, preferred quotes, and category overages alongside the ledger. In step 2, add the two mailing dates and dietary requests with the guest list. Add visual seating and guest meal choices once their guest and menu records exist. In step 3, use the existing tasks and installments to populate the calendar, then add appointments and the day-of timeline. The design extras and honeymoon tools can follow separately.

**Deploy.** Keep static files in `docs/` with `index.html` at its root and relative asset paths. Put database migrations outside that directory. Apply the schema and access policies, create the private wedding and its two memberships, then publish `main` → `/docs` under **Settings → Pages → Deploy from a branch**. Set the Supabase production site and allowed return URL to the exact Pages project URL, including the repository path. [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

**Checks before entering real wedding data**

- Log the example deposit from one phone. The other shows $900 paid and $2,700 outstanding. Retrying the save after a dropped connection creates one $900 payment.
- Open the published URL signed out, then as an unrelated signed-in test user. Attempts to read or change the wedding through the API must be denied or return zero accessible rows.
- Enter one household of three, including an unnamed companion. Mark two attending and one pending. The chart shows two yes, zero no, one pending, and three invited seats.
- Check a task, reload on the other phone, and confirm its time-window counts. Select two starters and confirm both appear on the menu while the budget still has a single catering expense.

**Checks for the website additions**

- Compare the two catering offers above and book the $3,600 package. Log the $900 deposit from the vendor screen. Budget and Vendors must each show one catering expense, $900 paid, and $2,700 owed. Opening or editing the unused $3,800 quote leaves those figures intact.
- Send one invitation to a household of three. Two attend and one declines. If one attendee chooses fish and lists two dietary restrictions while the other has yet to choose, show one mailing, two confirmed diners, one fish meal, one missing choice, and one person under each specified restriction.
- Move an attending guest from reception Table 2 to Table 4 on one phone. On the other, the guest list and table counts reflect the move, and the ceremony seat is unchanged. If both phones claim the same last seat, only one move succeeds and the other guest retains their previous placement.
- Put a $900 installment on the calendar and record $300 against it. The calendar and expense both show $600 remaining. Record the last $600 and the item leaves the upcoming payments list. Completing a fitting on the same day changes only the fitting.
- Schedule both partners’ preparations at 9:00 a.m. in different rooms and one shared ceremony at 11:00 a.m. The combined schedule and printout show both rooms at 9:00 and list the ceremony once.

[ywm-home]: https://yourweddingmate.com/
[ywm-product]: https://yourweddingmate.com/products/wedding-dashboard-g
[ywm-catalog]: https://yourweddingmate.com/collections/all
[ywm-journal]: https://yourweddingmate.com/blogs/the-mate-journal-%E2%9C%A8/the-real-meaning-behind-wedding-traditions-and-modern-ways-to-make-them-yours
[ywm-dashboard]: https://yourweddingmate.com/cdn/shop/files/142.png?v=1772728751&width=3840
[ywm-budget]: https://yourweddingmate.com/cdn/shop/files/144.jpg?v=1765986765&width=3840
[ywm-guests]: https://yourweddingmate.com/cdn/shop/files/145.jpg?v=1765986765&width=3840
[ywm-vendors]: https://yourweddingmate.com/cdn/shop/files/146.jpg?v=1765986765&width=3840
[ywm-seating]: https://yourweddingmate.com/cdn/shop/files/147.jpg?v=1765986765&width=3840
[ywm-timeline]: https://yourweddingmate.com/cdn/shop/files/148.jpg?v=1765986765&width=3840
[ywm-calendar]: https://yourweddingmate.com/cdn/shop/files/149.jpg?v=1765986765&width=3840


## Development record — November 14, 2026

This dated entry records implementation progress against the original brief and additions made during development. The original requirements above remain the planning history. Future progress updates should be appended as dated entries.

### Evidence and release snapshot

Reviewed the source and development records in **iTriedaThing/beyas-big-day**, through main commit `d4aec754a5cbb020fab21eca7576af2453c274c6`, which merged PR #6 on November 14. The app is named **Beya’s big day**, for Ben and Maya. The repository records GitHub Pages publication of the budget, guest/checklist work, and couple-feedback release. Its release source is main with the docs directory. [Repository snapshot](https://github.com/iTriedaThing/beyas-big-day/tree/d4aec754a5cbb020fab21eca7576af2453c274c6) · [App](https://itriedathing.github.io/beyas-big-day/)

This review inspected code and existing validation reports. Test outcomes below are the outcomes recorded by the developers. Live signed-in behavior and current hosted database migration state were not independently exercised during this documentation update.

### Functionality developed

| Area | Implemented behavior | Progress against the original brief |
| --- | --- | --- |
| Shared access and setup | Email/password sign-in, confirmation links, password recovery, two administratively provisioned members, wedding settings, currency, date, time zone, and planning headcount. Database membership checks, edit versions, stable retry IDs, Realtime refetches, foreground polling, and focus/online refresh support shared use. | Shared foundation implemented. Real two-account acceptance remains an explicit verification item. |
| Budget and expenses | Editable categories and budgeted amounts, planned expenses, preferred quotes, booked agreements, amendment history, forecast, paid, outstanding balances, vendor credits, category overages, and the next dated payment. Blank amounts and explicit zero have different meanings. | Step 1 budget implemented. |
| Vendor comparisons | Vendor contacts and packages, fixed or per-person prices, saved quote headcount, inclusions, ratings, notes, preferred offers, and booking against the existing expense. Agreed prices change through amendments. | Quote comparison and booking implemented. |
| Payments | Deposits, payments, refunds, partial installments, overdue flags, payer versus recorder attribution, and reconciliation of unallocated payments. Purchase paid in full saves an agreement and payment together. An explicit zero purchase creates an agreement without a payment. | Contract payments and everyday purchases implemented. |
| Budget presentation and export | Budget-versus-paid bars with a Forecast option, net-payment breakdown, exact amounts, and expense/payment CSV generation. Formula-like text is escaped in exports. | Charts and export code implemented. Actual delivery of the second budget CSV still needs verification. |
| Guests and households | Household contacts and addresses, separate mailing dates, named guests and unnamed companions, partner-entered yes/no/pending replies, relationship tags, gifts, dietary flags, guest requests, caterer confirmation, search/filtering, archive/restore, and guest CSV export. Mailings count households, responses count people, and dietary summaries count attending guests. | Step 2 guest and reply core implemented. Visual seating and meal choices remain pending. |
| Checklist | Editable tasks, 22 optional starter tasks, planning windows, assignees, completion summaries, fixed and relative dates, and upcoming/overdue tasks. Starter imports deduplicate. Changing the wedding date recalculates relative deadlines. | Checklist portion of Step 3 implemented. |
| Planning Schedule | A chronological agenda combining appointments, tours, tastings, open dated tasks, and outstanding booked installments. Events support dates, optional times, locations, vendor links, notes, completion, and Upcoming/Past/All filters. | Agenda implemented. The original month-grid calendar remains pending. |
| Day-of itinerary | Separate section 07 with activity start and optional end times, Ben/Maya/Together/custom tracks, simultaneous activities, shared milestones, locations, notes, vendor links, track filtering, following-day activities, overnight finishes, and print styles. Date changes preserve saved clock times. | Code and migration implemented and merged in PR #6. Hosted migration completion and usable live delivery remain unverified in the reviewed records. |
| Mood board | A saved public Pinterest board URL, an embedded official board preview in a sandboxed frame, and a direct link fallback. | A concrete moodboard implementation has been added. Preview availability depends on Pinterest and browser settings. |

Implementation evidence comes from the app entry point and the budget, planner, feature, and itinerary modules, with release context in the README. [App source](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/docs/app.js) · [Budget logic](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/docs/budget.js) · [Planner logic](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/docs/planner.js) · [Schedule and moodboard](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/docs/features.js) · [Itinerary](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/docs/itinerary.js)

### Additions and refinements made during development

- **Editable payments and refunds with history.** Amount, type, date, payer, notes, expense, and installment can be corrected. Optimistic versions detect conflicting edits. Original recorder attribution is retained and private history records before/after values and the editor.
- **Unbooking an agreement.** A reason is recorded, the expense returns to planning, quote selections clear, payments remain recorded, and installment reminders pause until explicit rebooking.
- **Confirmed deletion.** Categories, vendors, expenses, offers, installments, transactions, households, guests, tasks, events, and picture attachments support typed confirmation with an explanation of linked effects. Deleted records disappear from active totals and exports through tombstones and retained history. Deleted-record recovery has no user interface. Guest/task archive and restore remain separate available actions.
- **Guest attribution.** Guests can be attributed to Ben, Maya, or Together/unspecified, with attribution included in CSV exports.
- **Vendor and venue improvements.** Overall 1–5 ratings order the vendor cards independently of package ratings. Website links are clickable. Private JPEG, PNG, and WebP attachments support captions and a 5 MB per-image limit.
- **Presentation and usability.** A forest-green, eggplant, lilac, and sage palette, botanical artwork, responsive cards, RSVP/progress charts, and the countdown below the subtitle establish the app’s visual design. Expense forms say “Budgeted amount.” The whole Forecast card is clickable, chart selection survives polling, and settings offer a time-zone dropdown.
- **Browser fixes.** The recorded walkthrough led to fixes for clipped money cards, an incorrectly visible Save button in history, Pinterest widget loading, and decoration intercepting Forecast clicks.
- **Itinerary refinements.** Custom tracks, after-midnight handling, per-track printing, and preserving activities when a linked vendor is deleted extend the original timeline proposal.

These additions are documented in the feedback and itinerary acceptance records. [Feedback record](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/FEEDBACK-VALIDATION.md) · [Browser findings](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/BROWSER-ACCEPTANCE.md) · [Itinerary record](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/ITINERARY-VALIDATION.md)

### Development and release milestones

| Date | Milestone | Evidence recorded |
| --- | --- | --- |
| November 13 | Shared budget foundation | Repository setup records the base migration, shared wedding, two memberships, and starter categories. |
| November 13 | Guests and checklist | Repository records application of the additive guest/checklist migration. |
| November 14 | Couple-feedback release | PR #4 merged. The rollout record for PR #5 confirms migration version 20261114163318, member-role access, outsider isolation, private bucket configuration, unchanged existing row counts, and 16 signed-out API checks. |
| November 14 | Day-of itinerary | PR #6 merged at d4aec754. Its validation file still describes migration 20261114194639 as pending. Merge status establishes source integration. Hosted readiness requires a later rollout record or a direct check. |

[Setup and release documentation](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/README.md) · [Feedback rollout](https://github.com/iTriedaThing/beyas-big-day/pull/5) · [Itinerary merge](https://github.com/iTriedaThing/beyas-big-day/pull/6)

### Verification recorded and work still open

The itinerary validation records **52 passing Node tests**, static syntax/asset checks, four migrations and their access suites on a disposable PostgreSQL database, and local security advisors with no issues. Feedback validation records a mock browser walkthrough covering the new workflows and responsive layouts. The itinerary walkthrough covers parallel tracks, overnight events, editing, filtering, deletion, and a 375px layout. These reports are development evidence with the following remaining acceptance items.

- Confirm hosted itinerary migration readiness and run its real member/outsider and signed-out checks.
- Verify sign-in, synchronization, conflicts, and deletion with the two actual accounts.
- Verify hosted photo upload/download and access restrictions.
- Confirm payment CSV delivery when exporting both budget files, external vendor links opening correctly, and physical-phone keyboard behavior.
- Review actual itinerary print-preview pagination and PDF/printer output. The recorded print attempt entered a blocking native dialog and did not establish successful output.

[Recorded browser checks and limits](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/BROWSER-ACCEPTANCE.md) · [Recorded itinerary checks and limits](https://github.com/iTriedaThing/beyas-big-day/blob/d4aec754a5cbb020fab21eca7576af2453c274c6/ITINERARY-VALIDATION.md)

The following planned functionality is still outstanding in the reviewed source and release documentation.

| Planned area | Remaining work |
| --- | --- |
| Menu planning | Selectable dish cards, course options, guest meal choices, meal counts, and linking the menu estimate to one catering expense. Dietary notes and caterer confirmation are already available. |
| Visual seating | Ceremony and reception plans, capacities, numbered seats, head-table handling, guest placement, and conflicting-seat checks. |
| Month calendar | A month-grid view over the existing dated planning records. The chronological Schedule is available. |
| Guest-entered responses | Household-limited guest reply access and submission. Partner-entered RSVP handling is available. |
| Optional planning extras | AI planning assistance/notes, vendor-question guides, save-the-date and signage tools, and honeymoon planning. A public Pinterest board preview is available. |

For subsequent updates, append the date, reviewed commit, newly implemented behavior, release/migration evidence, and remaining verification. Use this record alongside the original acceptance examples when selecting the next development task.

