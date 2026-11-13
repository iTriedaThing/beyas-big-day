# Verify with two accounts before real data

Use the same test wedding and two separately provisioned Auth accounts. Do not share a password. Setup and publishing instructions are in [README.md](README.md).

## Sign-in and shared access

1. Open the exact published GitHub Pages URL on phone/browser A while signed out. It must show sign-in, with no wedding names, vendors, or payment data. An incorrect password should show a useful error and allow another attempt.
2. Sign in as partner A. In **Wedding settings**, set USD, a $10,000 cap, and the intended time zone. Leave the date blank to verify that budgeting works before the wedding date is decided.
3. Open the same URL on phone B (or a separate browser/profile) and sign in as partner B. Both should see the same wedding, settings, and starter categories. The payer selector should list both partner names. A fresh tab requires its own sign-in.
4. Keep both screens open. Confirm **Live updates connected**. Change a category name on A; B should refetch automatically. If Realtime is unavailable, the app reports reconnection and polls every 20 seconds while visible. Switch B to another app and back; focus refresh should also show A’s change. Verify live delivery separately from the polling fallback by making a change and observing it arrive promptly.

## Password recovery and confirmation emails

1. After the recovery fix is published, choose **Forgot password?**, enter your account email, and send one reset request. A generic success message should avoid revealing whether an account exists. Sending an email does not itself change the password.
2. Open the newest email link. It must return to the exact Pages URL and show **Choose a new password**, rather than the usual login form. URL fragments containing tokens must disappear immediately. An expired/used link should give a useful error and let you request another email.
3. Choose and confirm a new password yourself; never send the password or reset link to anyone. Mismatched passwords must be rejected before a request. After successful submission, the app should return to sign-in with a success message. Sign in using the **new** password and verify your existing wedding data remains intact.
4. Reload a verified recovery tab before submitting the new password: the reset form should remain available in that tab. Cancel should clear the local recovery session. An offline/failed update should show a retryable error rather than claiming success.
5. A signup-confirmation link should validate the email session and open the assigned wedding. Supabase can update “last login” when a recovery/confirmation link creates a session; this does not prove that a password sign-in succeeded.

The browser fixture and automated tests use synthetic sessions and never change real account credentials. The account owner must complete the real recovery and password sign-in checks.

## Budget, vendors, and quotes

1. Add two vendor contacts (or two packages from one vendor). Add a planned **Catering** expense with a **$4,000** target in Food. Add fixed quotes for **$3,800** and **$3,600**, including package contents, contact information, rating, and notes.
2. Before a preferred quote is chosen, Catering forecasts **$4,000**. Prefer the $3,600 quote: both phones should show a **$3,600** forecast and **$400 under** the item/category target. Open/edit the unused $3,800 offer; forecast should remain $3,600.
3. Book the $3,600 package. There must still be exactly **one Catering expense**. Add a **$900 Deposit** installment and a **$2,700 Final balance** installment with appropriate due dates.
4. From **Vendors & quotes → Payment / refund**, record **$900** against Deposit. Choose B as payer while signed in as A. Both Budget and Vendors must show **$900 paid, $2,700 owed**, with **$3,600 forecast**. The ledger must distinguish **paid by B** from **entered by A**. Deposit should show zero remaining; Final balance should be the next payment.
5. Edit the unused quote again. Totals must stay unchanged. The booked quote should be preserved. **Amend agreement** should require an explanation and add history; editing contacts must not create another bill.
6. Record **$300** against Final balance: remaining becomes **$2,400**. Record the final **$2,400**: owed becomes zero and the installment leaves Next payment. Record a **$100 refund** linked to Final balance: paid becomes **$3,500**, owed and installment remaining become **$100**. Test an overpayment separately and confirm it appears as a vendor credit.
7. Add a Venue expense with a **$4,000** target and **$4,200** agreed price. Venue must say **$200 over** even while the total wedding forecast remains below the cap. Switch the chart between Paid and Forecast. The breakdown must use payments net of refunds, with a dollar table when net spending is zero or a category is negative.

## Single-entry purchase paid in full

1. On A choose **Add expense → Entry type → Purchase paid in full**. Enter **Wedding shoes**, Attire, **$120 target**, **$100 agreed/full purchase amount**, a payment date, and B as payer. Save once.
2. On both screens verify **one Wedding shoes expense**, **one $100 payment**, **$100 forecast**, **$100 paid**, and **$0 owed** for that purchase. No installment is necessary. Wedding paid increases by $100; Catering’s balance remains unchanged.
3. Try a planned expense with a blank target: it must be flagged **Awaiting estimate**, with the overall forecast marked incomplete. An explicit zero target or zero agreed price must remain zero. A free paid-in-full purchase must create no zero-dollar payment.

## Retry and simultaneous edits

1. With test data, use browser network tools to interrupt a payment response after the request is sent. If you cannot time that accurately, use Offline before Save to verify the recoverable UI, and rely on the local retry tests for the lost-response case.
2. Restore the network. Use **Retry original save** in the dialog or **Retry pending save** on the page; do not enter a new payment. Reload the **same tab** before retrying to verify payload persistence. The ledger must contain one transaction for its UUID, not two. A paid-in-full retry must leave one expense and one full payment.
3. Open the same expense’s **Edit expense** form on both phones before either saves. Save a changed target on A, then save B’s old form. B must be told someone changed the record. Reopen B’s form, review A’s new value, and reapply the intended change. There must be no silent overwrite.
4. Turn the network off during a refresh. The page should retain its last figures with an out-of-date warning. Reconnect/focus and verify recovery. Sign out, then sign back in to check that private UI is cleared and session renewal works.

## Signed-out and unrelated-user API reads

Create a separate confirmed test Auth user **without membership**. Sign in with that user in a separate browser. The app must show **No single wedding assigned**. It must not create a wedding or grant itself membership.

For an actual Data API check, run the following in the developer console on the app’s page, first signed out and then signed in as the unrelated user. Replace only `WEDDING_UUID_FROM_PROVISIONING`. It reads the tab’s session without printing tokens; do not paste tokens into source files or share console session data.

```js
await (async () => {
  const { config } = await import('./config.js');
  const { Api } = await import('./api.js');
  const client = new Api(config);
  const headers = { apikey: config.publishableKey };
  if (client.session) headers.Authorization = `Bearer ${client.session.access_token}`;
  const wedding = 'WEDDING_UUID_FROM_PROVISIONING';
  const tables = ['weddings','wedding_members','categories','vendors','expenses',
    'quotes','installments','payments','contract_amendments'];
  const results = [];
  for (const table of tables) {
    const field = table === 'weddings' ? 'id' : 'wedding_id';
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?select=*&${field}=eq.${wedding}`, { headers });
    const body = await response.json();
    results.push({ table, status: response.status,
      rows: Array.isArray(body) ? body.length : 'denied',
      pass: response.status === 401 || response.status === 403 || (response.ok && Array.isArray(body) && body.length === 0) });
  }
  console.table(results);
})();
```

Every row must pass: signed-out access is denied; unrelated signed-in access returns no accessible records. If any row is visible, stop before entering private data and review membership/RLS. The local SQL suite additionally tests unauthorized mutations and cross-wedding references without requiring writes to your hosted project.

## Guest list, checklist, and tonight’s demo

Apply the approved guest/checklist migration before merging its frontend PR. Keep any real contact information out of Git and demo exports.

1. On A, add a household with two named guests and one unnamed companion. On B, verify one household and three invited seats. Mark two attending and leave one pending: the RSVP chart must show two yes, zero no, one pending. Give the people different replies to verify the household is not treated as one person.
2. Set one save-the-date sent date and one formal invitation sent date on that household. Each mailing count should increase once, independently. Add two dietary flags to one attending guest: the overall dietary guest count increases by one, and each relevant flag count increases by one. Record the caterer’s reply in its separate field.
3. Search by guest/household, filter replies and relationships, and export the active guest CSV. Archive a guest or household and verify totals decrease; restore from the Archived/All view and verify totals return.
4. Open **Our checklist** and add the starter checklist. Import it again on the other phone: tasks must not duplicate. Mark a task complete on A and verify B’s group totals and overall progress update. Add a custom task and an assignee.
5. Set the wedding date in settings. Check the countdown and relative task dates; give a task a fixed date, then change the wedding date and confirm that only relative dates move. Dates/countdown use the wedding time zone and calendar days, with no daylight-saving hour drift.
6. Edit the same guest or task on both phones before either saves. The second stale save should request review instead of overwriting. Sign in as an unrelated user and check that the new records remain inaccessible. Run `node scripts/check-public-access.mjs --planner` for signed-out API checks after migration.

A short demo sequence: show Budget and the countdown, add a three-person household, tap an RSVP, switch to the checklist, and complete one task while the other phone is open. The mock-data preview is for rehearsal only; live data starts blank until you enter it or choose the starter checklist.

## Export and final sign-off

Export both CSVs from either account. Your browser may request permission for the second download. Reconcile expenses by UUID and payments by expense/installment UUID; amounts are integer cents. Check deposits, refunds, credits, payer/recorder, and that paid-in-full appears exactly once. Keep exports private and outside Git.

The automated/local checks cannot establish that the chosen hosted project, redirect configuration, browser storage behavior, and two physical phones work together. Treat this guide’s completed checks as the release acceptance step before entering real wedding data.
