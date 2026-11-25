# Invite-only beta enrollment

An operator can invite a first participant to create a named, private wedding. A wedding member can invite collaborators to that wedding. Each collaborator can view and edit the whole planner and invite others. Adding a guest or household to the guest list grants no account access. Operator status alone grants no access to another couple’s planner.

For the existing production planner, follow the [short opening runbook](BETA-ENROLLMENT-RUNBOOK.md). The November 24 rollout already applied the migrations there. The steps below also cover provisioning a fresh project.

## Hosted rollout

These steps change the selected Supabase project and require release approval. Keep new-user signups disabled during setup. Existing memberships work with the new frontend even before the migration.

1. Verify the target project and apply the [enrollment migration](supabase/migrations/20261125004206_private_wedding_enrollment.sql) through migration history. It adds two private tables and invitation functions. Original weddings and memberships keep their IDs and data.
2. In Authentication → Hooks, configure **Before User Created** to use Postgres function `public.before_beta_signup`. Keep the `private` schema outside the Data API’s exposed schemas. The hook checks a server-issued invitation, its email, its expiry and its status. [Supabase hook documentation](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
3. Enable the email/password provider and **Confirm email**. Use the canonical Pages URL (including its project path and trailing slash) for the site and allowed redirects. Keep the default implicit confirmation link in the signup email template. Configure SMTP for delivery to participants outside the Supabase project team. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
4. Identify the operator’s existing, confirmed Auth user by UUID and email in the project dashboard. In an administrative SQL session substitute that UUID below. Confirm the returned ID matches the designated operator. An existing operator produces no new row.

   ```sql
   insert into private.beta_operators (user_id)
   select id from auth.users
   where id = '<verified-operator-uuid>'::uuid and email_confirmed_at is not null
   on conflict do nothing
   returning user_id;
   ```

5. With the hook active, publish the frontend and enable new-user signups. Use controlled test accounts to verify that signup without an invitation and signup with a different address are rejected. Verify a real confirmation email returns to the correct site. If the gate or delivery fails, disable new-user signups while investigating. Existing members can continue to sign in.

## Invite the first couple

Open **Weddings & invitations → Invite someone**, select **New beta wedding**, enter the first participant’s email and create the link. An operator with no wedding lands directly on this screen. Copy the link and send it privately. Supabase sends the subsequent account confirmation email.

The participant opens the link, creates an account with the invited email and confirms it. An existing account can sign in directly. A pending invitation also appears when the participant signs in on another device. They enter their display name, wedding name and time zone. Accepting creates the wedding and its first membership together. Reopening an accepted link returns the same member to that wedding.

From their planner the participant opens **Weddings & invitations**, selects their wedding, and creates a link for their partner’s email. The partner accepts with their own display name. People with multiple memberships choose a wedding when signing in and can switch from the account menu.

Links expire after seven days. Create another link after expiry or revocation. Reissuing an active invitation for the same address and wedding returns the existing link. **Revoke link** cancels a pending invitation. Removing an existing member is an administrative operation in this milestone.

## Verification before the first real invitation

Use synthetic weddings and accounts. Sign in on a phone and finish a confirmation on another device. Verify one founder acceptance produces one wedding, two collaborators see the same edit, and an unrelated member cannot read, edit, export, or load photos for that wedding. Switch weddings while a refresh is pending, then sign out and check the previous planner has cleared. Verify synchronization with two hosted browser sessions using the [verification guide](VERIFICATION.md).

The local PostgreSQL suite exercises the hook, invitation lifecycle, memberships and data boundaries. Run it on a fresh disposable database with `psql -X -v ON_ERROR_STOP=1 -d <test-db> -f tests/all.sql`. Hosted Auth delivery and Realtime require the configured services.
