# Open beta enrollment

**Start here.** On November 24, 2026, both features were live on Pages and Supabase recorded [guest CSV import](supabase/migrations/20261125004151_guest_csv_import.sql) followed by [private wedding enrollment](supabase/migrations/20261125004206_private_wedding_enrollment.sql). The hosted project is `beyas-big-day` (`nennjenlgfkblsmpkzfr`). Its public Auth settings showed signups enabled, email/password enabled and email confirmation required. There were zero beta operators and zero planner invitations. The database hook rejected a missing invitation when called directly. Its connection to hosted Auth and real email delivery still need the checks below.

1. **Close signup during setup.** In Supabase Authentication, switch off **Allow new users to sign up**. Existing members can still sign in. Under **Hooks → Before User Created**, select the Postgres function `public.before_beta_signup`, enable the hook and save. Keep the `private` schema outside the Data API’s exposed schemas. [Supabase hook guide](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
2. **Set up confirmation email.** Keep **Confirm email** on. Set the Site URL and allowed redirect to `https://itriedathing.github.io/beyas-big-day/`, including the trailing slash. Configure custom SMTP for recipients outside the Supabase project team and keep the default confirmation link in the signup template. [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
3. **Give yourself operator access.** In Authentication → Users, find your confirmed account by email. Substitute its UUID below and run this once in the project SQL Editor. Sign in to the planner and verify **Weddings & invitations → Invite someone → New beta wedding** appears.

   ```sql
   insert into private.beta_operators (user_id)
   select id from auth.users
   where id = '<verified-operator-uuid>'::uuid and email_confirmed_at is not null
   on conflict do nothing
   returning user_id;
   ```

4. **Rehearse with addresses you control.** With the hook active, switch signups on for the rehearsal. Verify signup without an invitation is rejected, then follow the [Aisle walkthrough](#rehearse-enrollment-and-aisle) to test a wrong email, real email confirmation, and a new wedding. If an invitation or email delivery check fails, switch signups off again.
5. **Open the pilot.** Confirm the support contact, post-wedding export and deletion options, recovery window and backup-expiry wording against the [pilot brief](wedding-planner-build-brief.md#invite-only-our-big-day-beta--november-24-2026). Verify the exit options you intend to offer with the test wedding. When ready, create a fresh **New beta wedding** link for the couple’s first participant and send it privately.

## Rehearse enrollment and Aisle

Run this on the hosted planner once the Aisle frontend is published and its migration has been applied to the same Supabase project. Before issuing the test invite, sign in to Beya’s Big Day and check that **Ask Aisle** appears beside **Wedding settings**. You can leave the original guide closed and do the walkthrough in a new wedding. [Aisle migration](supabase/migrations/20261125035631_aisle_guided_setup.sql)

### Invite yourself as a new user

1. In your regular browser, sign in with your operator account. Open **Weddings & invitations → Invite someone**, choose **New beta wedding**, and enter an email address you control that has never registered for Our Big Day. Use a different address from your operator login. Click **Create invitation link** and copy the link.
2. Paste the link into a different browser profile or open it on your phone while signed out of the planner. Click **Create invited account**. First try a different, unused email address you control. Expect an invitation error and no account confirmation. Retry with the exact invited address and a password. The app should ask you to check your email.
3. Open the confirmation link in the test browser or phone. If your email app normally opens your regular browser, copy the link and paste it into the test browser. After confirmation, the planner should show **Create your private wedding**. Enter a display name, name the wedding **Aisle rehearsal**, choose a time zone, and click **Create wedding**. Expect Aisle to open at **Set wedding details**. Beya’s Big Day should be absent from the test account’s wedding list.
4. Reopen the original planner invitation while signed in as the test account. It should open the same wedding. Check **Weddings & invitations** if you want to confirm there is a single rehearsal wedding.

### Exercise the guide

1. Click **Set wedding details**. Check that the wedding name and time zone match enrollment. Set a test currency before adding any prices. Leave the wedding date, budget, and guest estimate blank, then save. Aisle should offer **Follow up with a vendor** and **Bring in your guest list**. Use **Review wedding settings** to verify your saved details.
2. Click **Pause setup**. Sign in as the test account on a second device, or sign out and back in. The planner should open with Aisle closed. Select **Ask Aisle → Resume setup**. You should return to the same two choices with your saved details intact.
3. For the vendor path, select **Add a vendor**. Enter **Rehearsal Florist** and enter **Ask for a quote** under **What will you do next?**. Save. Aisle should recognize the follow-up. Open **View vendors** and confirm the card shows your next step. Open **Ask Aisle** again and leave setup unfinished so you can test the CSV path in the same wedding.
4. Select **Import guest CSV → Download the blank CSV template**. Fill it with one fake household and two guests, using the same household name for both rows. Try `maybe` in one RSVP cell first. Upload the file and confirm the preview identifies the row and field and blocks import. Change it to `pending`, reload the file, verify the preview shows **2 guests across 1 household**, and click **Import guests**. Aisle should show **2 guests are in your planner**. Open **View guest list** and confirm there is one household with both guests.
5. Open **Ask Aisle** and click **Finish setup**. Expect **What to do next**, with **Budget** suggested if you completed both paths and have entered no expenses. Sign out and back in. Aisle should stay closed until you open **Ask Aisle**. Use **Review wedding settings** to add a date or guest estimate. Verify the vendor follow-up and guest list are still there, with no duplicates.
6. From the test wedding’s **Weddings & invitations** screen, invite a second address you control to **Aisle rehearsal**. Open its link in a separate signed-out browser, verify the email, and join. The collaborator should see the same vendors and guests and find the finished guide under **Ask Aisle**. Change a wedding setting or vendor next step from one account and verify the other sees it. Neither test account should list Beya’s Big Day.

To test skipping on a clean start, invite a fresh address to a second test wedding. Save the details, then select **Skip this step and finish** before adding a vendor or guests. From the finished guide, follow its suggestion to **Vendors & quotes**, add a vendor with a **Next step** through the regular editor, and reopen **Ask Aisle**. The guide should recognize the follow-up and suggest the guest list.

## What to tell the couple

Open your private link, use the invited email address, and confirm it. If you already have an account, sign in. Enter your display name, wedding name and time zone. Aisle helps you finish your wedding details and choose your first task. Use **Ask Aisle** to resume or review the guide. To add your partner, open **Weddings & invitations**, select your wedding, and create a link for their email.

Links expire after seven days. The sender can revoke a pending link or create a fresh one after expiry. Reopening an accepted link returns the recipient to their wedding. To pause enrollment, turn off new signups and revoke outstanding links, including links for people who already have accounts. See the [verification guide](VERIFICATION.md) for the hosted two-device checks.

For the full invitation lifecycle, operator provisioning and verification instructions, see the [beta enrollment guide](BETA-ENROLLMENT.md).
