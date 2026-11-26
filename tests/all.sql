-- Run with psql -X -d <fresh-disposable-local-database> -f tests/all.sql.
-- The bootstrap scripts create test-only Auth and Storage schemas.
\set ON_ERROR_STOP on

-- Run each suite at its original schema version. Later migrations change
-- some of the contracts, including the original append-only payment ledger.
\ir bootstrap.sql
\ir ../supabase/migrations/20261113132432_shared_budget.sql
\ir access.sql
\ir ../supabase/migrations/20261113203508_guests_and_checklist.sql
\ir planner-access.sql
\ir storage-bootstrap.sql
\ir ../supabase/migrations/20261114163318_couple_feedback.sql
\ir feedback-access.sql
\ir ../supabase/migrations/20261114202132_day_of_itinerary.sql
\ir itinerary-access.sql
\ir ../supabase/migrations/20261117141256_interactive_menu_planning.sql
\ir menu-access.sql

-- Seating seeds legacy table labels before applying its migration in a transaction.
\ir seating-access.sql
\ir ../supabase/migrations/20261123234251_visual_seating.sql

-- This suite compares the full snapshot before and after replacing the two wrappers.
\ir snapshot-access.sql
\ir ../supabase/migrations/20261124041840_materialize_budget_snapshot.sql
\ir ../supabase/migrations/20261125004151_guest_csv_import.sql
\ir guest-import-access.sql
\ir ../supabase/migrations/20261125004206_private_wedding_enrollment.sql
\ir enrollment-access.sql
\ir aisle-access.sql
\ir ../supabase/migrations/20261125044138_aisle_guided_setup.sql
\ir ../supabase/migrations/20261125201731_vendor_comparison.sql
\ir ../supabase/migrations/20261126015517_delete_comparison_checklist.sql
\ir comparison-access.sql
