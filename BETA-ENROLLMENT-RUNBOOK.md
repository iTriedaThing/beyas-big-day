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

4. **Rehearse with addresses you control.** Create a **New beta wedding** link for a test inbox. With the hook active, switch signups on. Verify an uninvited signup and the correct link with the wrong email are both rejected. Then use the invited address on a phone, open its confirmation email and create a test wedding. Invite a second tester, reopen the accepted link on another device and check both collaborators see the same edit. Check the test account cannot open Beya’s wedding. If a gate or delivery check fails, switch signups off again.
5. **Open the pilot.** Confirm the support contact, post-wedding export and deletion options, recovery window and backup-expiry wording against the [pilot brief](wedding-planner-build-brief.md#invite-only-our-big-day-beta--november-24-2026). Verify the exit options you intend to offer with the test wedding. When ready, create a fresh **New beta wedding** link for the couple’s first participant and send it privately.

## What to tell the couple

Open your private link, use the invited email address, and confirm it. If you already have an account, sign in. Enter your display name, wedding name and time zone. To add your partner, open **Weddings & invitations**, select your wedding, and create a link for their email.

Links expire after seven days. The sender can revoke a pending link or create a fresh one after expiry. Reopening an accepted link returns the recipient to their wedding. To pause enrollment, turn off new signups and revoke outstanding links, including links for people who already have accounts. See the [verification guide](VERIFICATION.md) for the hosted two-device checks.

For the full invitation lifecycle, operator provisioning and verification instructions, see the [beta enrollment guide](BETA-ENROLLMENT.md).
