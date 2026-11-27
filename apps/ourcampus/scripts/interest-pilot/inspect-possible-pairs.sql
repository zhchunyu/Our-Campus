-- Aggregate preview only. Existing all-user closures stay in the public path.
-- A result is a possible pair, not a consent/timing/delivery decision.
with closure_events as (
  select id, author_id, location_id, visible_to, start_at, end_at, information_scope
  from public.campus_events
  where not is_demo and source in ('manager','community-reviewed')
    and information_kind='closure' and location_id is not null
    and status in ('active','scheduled') and end_at > now()
),
possible_pairs as (
  select distinct e.id, s.user_id
  from closure_events e
  join public.campus_subscriptions s on s.location_id=e.location_id
    and s.kind in ('closure','')
  join public.campus_ai_reminder_preferences p on p.user_id=s.user_id and p.enabled
  left join campus_private.user_roles r on r.user_id=s.user_id
  where e.information_scope='subscribers'
    and s.user_id is distinct from e.author_id
    and coalesce(r.role,'student')=any(e.visible_to)
)
select now() as checked_at,
       (select count(*) from closure_events) as current_trusted_closures,
       (select count(*) from closure_events where information_scope='all') as existing_public_route_closures,
       (select count(*) from closure_events where information_scope='subscribers') as interest_source_closures,
       (select count(*) from possible_pairs) as preview_event_recipient_pairs,
       (select count(*) from public.campus_ai_reminder_preferences where enabled) as user_interest_opt_ins,
       (select count(*) from public.campus_push_devices
          where enabled and updated_at >= now()-interval '90 days') as registered_push_devices,
       (select count(*) from public.campus_push_receipts) as provider_acceptances;
