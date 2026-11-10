-- Review candidate. Not applied automatically.
-- Inspected project hkdblizadnkskxslyjyq, 2026-11-08.
-- No historical backfill, subscription defaults, outbound calls, or real message fixtures.
-- Requires existing 09 push jobs, devices, receipts and notification dedupe index.
begin;

alter table public.campus_subscriptions drop constraint if exists campus_subscriptions_kind_check;
alter table public.campus_subscriptions add constraint campus_subscriptions_kind_check
  check (kind in ('','construction','closure','water-power','crowd','notice','lost','found','repair','feedback','hall-message'));
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('lost-found','facility-review','feedback-review','hall-reply','campus-event','hall-message'));

-- Chat consent must be explicit. Empty kind/location are campus-only wildcards.
-- Preserve all existing campus subscription ownership and location validation.
drop policy if exists information_subscribe_own on public.campus_subscriptions;
create policy information_subscribe_own on public.campus_subscriptions for all to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()) and (
    (kind='hall-message' and exists (select 1 from public.campus_regions r
      where campus_subscriptions.location_id='hall-region:' || r.id))
    or (kind<>'hall-message' and (location_id='' or exists(select 1 from public.campus_locations l
      where l.id=campus_subscriptions.location_id)))
  ));
create index if not exists campus_hall_subscribers_idx on public.campus_subscriptions(location_id,user_id)
  where kind='hall-message';

-- Trusted internal trigger: users cannot insert recipient notifications themselves.
-- The subscription row lock serializes message creation against unsubscribe cleanup.
create or replace function campus_private.notify_hall_message()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.deleted_at is not null then return new; end if;
  insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
  select s.user_id,'hall-message','校园聊天有新消息',
    '你关注的地区有新聊天消息，打开查看。','message',new.id::text,'hall-message:' || new.id::text
  from public.campus_subscriptions s
  where s.kind='hall-message' and s.location_id='hall-region:' || new.region_id
    and s.user_id<>new.author_id and s.created_at<=new.created_at
  for share of s
  on conflict do nothing;
  return new;
end
$function$;
revoke all on function campus_private.notify_hall_message() from public,anon,authenticated;
drop trigger if exists hall_message_notifications on public.hall_messages;
create trigger hall_message_notifications after insert on public.hall_messages
  for each row execute function campus_private.notify_hall_message();

-- Source retraction/hard deletion removes message-center notifications and cancels
-- pending/retry/running push jobs. Already delivered OS notifications cannot be recalled.
create or replace function campus_private.cancel_hall_message_notifications()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op='UPDATE' and new.deleted_at is null then return new; end if;
  update campus_private.information_jobs j
  set status='cancelled',claim_token=null,lease_until=null
  where j.kind='push' and j.status in ('ready','retry','running')
    and exists(select 1 from public.notifications n where n.id=j.target_id
      and n.type='hall-message' and n.related_type='message' and n.related_id=old.id::text);
  delete from public.notifications n where n.type='hall-message'
    and n.related_type='message' and n.related_id=old.id::text;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;
revoke all on function campus_private.cancel_hall_message_notifications() from public,anon,authenticated;
drop trigger if exists hall_message_retract_notifications on public.hall_messages;
create trigger hall_message_retract_notifications after update of deleted_at on public.hall_messages
  for each row execute function campus_private.cancel_hall_message_notifications();
drop trigger if exists hall_message_delete_notifications on public.hall_messages;
create trigger hall_message_delete_notifications after delete on public.hall_messages
  for each row execute function campus_private.cancel_hall_message_notifications();

-- Removing a chat subscription never modifies ordinary campus subscriptions.
-- Removing its old notices also prevents replay if the same region is re-enabled.
create or replace function campus_private.cancel_unsubscribed_hall_notifications()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if old.kind<>'hall-message' then return old; end if;
  update campus_private.information_jobs j
  set status='cancelled',claim_token=null,lease_until=null
  where j.kind='push' and j.status in ('ready','retry','running')
    and exists(select 1 from public.notifications n join public.hall_messages m on m.id::text=n.related_id
      where n.id=j.target_id and n.recipient_id=old.user_id and n.type='hall-message'
        and n.related_type='message' and old.location_id='hall-region:' || m.region_id);
  delete from public.notifications n using public.hall_messages m
  where n.recipient_id=old.user_id and n.type='hall-message' and n.related_type='message'
    and m.id::text=n.related_id and old.location_id='hall-region:' || m.region_id;
  return old;
end
$function$;
revoke all on function campus_private.cancel_unsubscribed_hall_notifications() from public,anon,authenticated;
drop trigger if exists hall_subscription_remove_notifications on public.campus_subscriptions;
create trigger hall_subscription_remove_notifications after delete on public.campus_subscriptions
  for each row execute function campus_private.cancel_unsubscribed_hall_notifications();

-- Worker must call immediately before EACH provider send, including retries.
-- SECURITY INVOKER: service_role already has required table access. No client RPC access.
-- A revoked/deleted/read notice, own message or later re-subscription is ineligible.
create or replace function public.campus_hall_push_context(p_notification_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $function$
  select coalesce((
    select jsonb_build_object('deliverable',true,'region_id',m.region_id,'message_id',m.id)
    from public.notifications n
    join public.hall_messages m on m.id::text=n.related_id
    join public.campus_subscriptions s on s.user_id=n.recipient_id
      and s.kind='hall-message' and s.location_id='hall-region:' || m.region_id
    where n.id=p_notification_id and n.type='hall-message' and n.related_type='message'
      and n.read_at is null and m.deleted_at is null and n.recipient_id<>m.author_id
      and s.created_at<=m.created_at
  ),jsonb_build_object('deliverable',false));
$function$;
revoke all on function public.campus_hall_push_context(uuid) from public,anon,authenticated;
grant execute on function public.campus_hall_push_context(uuid) to service_role;

commit;
