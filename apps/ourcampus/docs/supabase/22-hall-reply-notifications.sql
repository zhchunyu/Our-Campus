-- Requires 19-hall-message-notifications and 20-hall-proactive-analysis.
-- Only new inserts create reply notices. Existing function roles and triggers are retained.
begin;

create or replace function campus_private.notify_hall_message()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.deleted_at is not null then return new; end if;

  -- The reply wins the shared per-recipient key before region fan-out and AI matching.
  insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
  select parent.author_id,'hall-reply','校园聊天有新回复',
    '有人回复了你的校园聊天消息，打开查看。','message',new.id::text,'hall-message:' || new.id::text
  from public.hall_messages parent
  where parent.id=new.reply_to and parent.region_id=new.region_id
    and parent.deleted_at is null and parent.author_id<>new.author_id
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;

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

-- Recheck the live reply and its parent before every provider request or retry.
create or replace function public.campus_hall_push_context(p_notification_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $function$
  select coalesce((select jsonb_build_object('deliverable',true,'region_id',m.region_id,'message_id',m.id)
    from public.notifications n join public.hall_messages m on m.id::text=n.related_id
    where n.id=p_notification_id and n.related_type='message' and n.read_at is null
      and m.deleted_at is null and n.recipient_id<>m.author_id
      and (
        (n.type='hall-message' and exists(select 1 from public.campus_subscriptions s where s.user_id=n.recipient_id
          and s.kind='hall-message' and s.location_id='hall-region:'||m.region_id and s.created_at<=m.created_at))
        or (n.type='hall-match' and n.dedupe_key='hall-message:'||m.id::text and campus_private.hall_matches_user(m.id,n.recipient_id))
        or (n.type='hall-reply' and n.dedupe_key='hall-message:'||m.id::text and exists(
          select 1 from public.hall_messages parent
          where parent.id=m.reply_to and parent.region_id=m.region_id
            and parent.author_id=n.recipient_id and parent.deleted_at is null))
      )),jsonb_build_object('deliverable',false));
$function$;

-- Withdrawing the reply cancels its notice and pending jobs. Withdrawing the parent
-- blocks delivery through the context RPC while the existing reply remains visible.
create or replace function campus_private.cancel_hall_message_notifications()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op='UPDATE' and new.deleted_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  update campus_private.information_jobs j set status='cancelled',claim_token=null,lease_until=null
    where j.status in ('ready','retry','running') and (
      (j.kind='chat-analysis' and j.target_id=old.id) or (j.kind='push' and exists(
        select 1 from public.notifications n where n.id=j.target_id and n.type in ('hall-message','hall-match','hall-reply')
          and n.related_type='message' and n.related_id=old.id::text)));
  update campus_private.hall_message_analysis set status='cancelled',completed_at=now() where message_id=old.id;
  delete from public.notifications n where n.type in ('hall-message','hall-match','hall-reply')
    and n.related_type='message' and n.related_id=old.id::text;
  if tg_op='DELETE' then return old; else return new; end if;
end
$function$;

commit;
