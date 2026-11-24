-- Both wrappers reuse JSON from a lower snapshot. Materialize each single-row
-- input so that PostgreSQL cannot recalculate a whole snapshot for each expense.
create or replace function private.menu_snapshot(w uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with base as materialized (select private.itinerary_snapshot(w) as snapshot),
       estimate as materialized (select private.menu_estimate(w) as price)
  select snapshot || jsonb_build_object(
    'menu_ready', true,
    'menu_estimate', price,
    'menu_courses', coalesce((select jsonb_agg(c order by sort_order, name, id)
      from public.menu_courses c where wedding_id = w and not deleted), '[]'::jsonb),
    'menu_options', coalesce((select jsonb_agg(o order by name, id)
      from public.menu_options o where wedding_id = w and not deleted), '[]'::jsonb),
    'guest_meals', coalesce((select jsonb_agg(m)
      from public.guest_meals m where wedding_id = w and not deleted), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(expense || case
        when expense->>'id' = snapshot->'wedding'->>'menu_expense_id'
        then jsonb_build_object('menu_linked', true, 'menu_estimate_cents', price->'cents')
        else '{}'::jsonb end)
      from jsonb_array_elements(snapshot->'expenses') expense), '[]'::jsonb)
  ) from base cross join estimate;
$$;

create or replace function public.budget_snapshot(w uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with base as materialized (select private.menu_snapshot(w) as snapshot)
  select snapshot || jsonb_build_object(
    'seating_ready', true,
    'seating_revisions', coalesce((select jsonb_object_agg(event, revision) from (
      select event, max(revision) as revision from public.seating_changes
      where wedding_id = w group by event) revisions), '{}'::jsonb),
    'seating_units', coalesce((select jsonb_agg(u order by position)
      from public.seating_units u where wedding_id = w), '[]'::jsonb),
    'seating_placements', coalesce((select jsonb_agg(p)
      from public.seating_placements p where wedding_id = w), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(guest || jsonb_build_object(
        'meal_table', coalesce(u.label, '')) order by ord)
      from jsonb_array_elements(snapshot->'guests') with ordinality as guests(guest, ord)
      left join public.seating_placements p
        on p.wedding_id = w and p.event = 'reception' and p.guest_id = (guest->>'id')::uuid
      left join public.seating_units u on u.id = p.unit_id), '[]'::jsonb)
  ) from base;
$$;
