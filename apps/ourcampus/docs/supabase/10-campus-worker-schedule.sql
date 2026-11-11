-- 在 09 号 SQL、Edge Function、Secrets 和 Vault 就绪后执行。
-- Vault 只需 campus_worker_url 和 campus_worker_token；不要把真实令牌写入此文件。
begin;
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists campus_private.information_wake_state (
  singleton boolean primary key default true check(singleton),
  last_wake timestamptz not null default '-infinity'
);
insert into campus_private.information_wake_state(singleton) values(true) on conflict do nothing;
alter table campus_private.information_wake_state enable row level security;
revoke all on campus_private.information_wake_state from public,anon,authenticated;

-- 队列 HTTP 请求头含调度令牌，禁止普通业务角色读取 pg_net 内部队列与响应。
-- 保留 postgres、扩展自身及 service_role 的执行能力。
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
grant all on net.http_request_queue,net._http_response to service_role;

create or replace function public.campus_wake_information_worker(p_force boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text; worker_token text; request_id bigint; updated boolean;
begin
  if not exists(select 1 from campus_private.information_jobs where
    (status in ('ready','retry') and available_at<=now()) or (status='running' and lease_until<now())) then return null; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='campus_worker_url' limit 1;
  select decrypted_secret into worker_token from vault.decrypted_secrets where name='campus_worker_token' limit 1;
  if endpoint is null or endpoint not like 'https://%.supabase.co/functions/v1/campus-information-worker'
    or worker_token is null or char_length(worker_token)<32 then return null; end if;
  -- 一次批量全员通知只唤醒一批；工作函数完成后主动续批，定时任务补偿异常。
  update campus_private.information_wake_state set last_wake=clock_timestamp()
    where singleton and (p_force or last_wake<clock_timestamp()-interval '2 seconds') returning singleton into updated;
  if not coalesce(updated,false) then return null; end if;
  select net.http_post(url:=endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','x-campus-worker-token',worker_token),
    body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
  return request_id;
end $$;
revoke all on function public.campus_wake_information_worker(boolean) from public,anon,authenticated;
grant execute on function public.campus_wake_information_worker(boolean) to service_role;

create or replace function campus_private.wake_new_information_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- 调度故障不能回滚用户发布；数据与任务仍入库，由定时任务补发。
  begin perform public.campus_wake_information_worker(false);
  exception when others then null; end;
  return new;
end $$;
revoke all on function campus_private.wake_new_information_job() from public,anon,authenticated;
drop trigger if exists information_job_wake on campus_private.information_jobs;
create trigger information_job_wake after insert or update of status on campus_private.information_jobs
  for each row when (new.status='ready') execute function campus_private.wake_new_information_job();
select cron.schedule('campus-information-worker','* * * * *','select public.campus_wake_information_worker(false);');
-- 如果 09 执行后已经有待处理任务，部署此脚本后立即尝试唤醒。
select public.campus_wake_information_worker(true);
commit;
