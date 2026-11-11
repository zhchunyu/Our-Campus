// Isolated in-memory PostgreSQL regression. No production credentials or network calls.
// Optional runtime: node tools/verifyHallProactiveSql.mjs <absolute PGlite dist/index.js>
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '@electric-sql/pglite')
const db = new PGlite()
const baseline = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema campus_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table auth.users(id uuid primary key,aud text,role text,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz);
create table public.campus_locations(id text primary key,name text,aliases text[] not null default '{}');
insert into public.campus_locations values('library','图书馆',array['校图书馆','主图书馆']),('apartment-1','1号公寓楼',array['1号公寓']),('apartment-11','11号公寓楼',array['11号公寓']);
create table public.campus_regions(id text primary key); insert into public.campus_regions values('teaching'),('living'),('sports'),('dorm'),('gate');
create table public.campus_events(id uuid primary key default gen_random_uuid());
create function public.campus_is_manager() returns boolean language sql stable as $$select false$$;
create table public.hall_messages(id uuid primary key default gen_random_uuid(),author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,region_id text not null references public.campus_regions(id),content text not null,client_message_id uuid not null,reply_to uuid references public.hall_messages(id),deleted_at timestamptz,created_at timestamptz not null default now(),image_paths text[] not null default '{}',unique(author_id,client_message_id));
create table public.campus_reports(id uuid primary key default gen_random_uuid(),author_id uuid not null default auth.uid() references auth.users(id),client_id uuid not null,kind text not null,title text not null,body text not null,location_id text references public.campus_locations(id),status text not null default 'submitted',analysis_status text not null default 'pending',analysis jsonb not null default '{}',updated_at timestamptz not null default now(),created_at timestamptz not null default now());
create table public.campus_subscriptions(user_id uuid not null default auth.uid() references auth.users(id),location_id text not null default '',kind text not null default '' constraint campus_subscriptions_kind_check check(kind in ('','construction','closure','water-power','crowd','notice','lost','found','repair','feedback')),created_at timestamptz not null default now(),primary key(user_id,location_id,kind));
create table public.campus_user_preferences(user_id uuid primary key references auth.users(id),favorite_ids text[] not null default '{}',favorite_routes jsonb not null default '[]',updated_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references auth.users(id),type text not null constraint notifications_type_check check(type in ('lost-found','facility-review','feedback-review','hall-reply','campus-event')),title text not null,body text not null default '',related_type text,related_id text,read_at timestamptz,created_at timestamptz not null default now(),dedupe_key text);
create unique index campus_notification_dedupe_idx on public.notifications(recipient_id,dedupe_key) where dedupe_key is not null;
create table campus_private.information_jobs(id uuid primary key default gen_random_uuid(),kind text not null constraint information_jobs_kind_check check(kind in ('analysis','push')),target_id uuid not null,status text not null default 'ready',attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,claim_token uuid,last_error text,created_at timestamptz not null default now(),unique(kind,target_id));
create function campus_private.enqueue_notification_push() returns trigger language plpgsql security definer set search_path='' as $$begin insert into campus_private.information_jobs(kind,target_id) values('push',new.id) on conflict do nothing; return new; end$$;
create trigger information_push_enqueue after insert on public.notifications for each row execute function campus_private.enqueue_notification_push();
create function campus_private.enqueue_report_analysis() returns trigger language plpgsql security definer set search_path='' as $$begin insert into campus_private.information_jobs(kind,target_id) values('analysis',new.id) on conflict do nothing; return new; end$$;
create trigger information_analysis_enqueue after insert on public.campus_reports for each row execute function campus_private.enqueue_report_analysis();
create function campus_private.wake_new_information_job() returns trigger language plpgsql as $$begin return new; end$$;
create trigger information_job_wake after insert or update on campus_private.information_jobs for each row execute function campus_private.wake_new_information_job();
grant all on all tables in schema public,auth,campus_private to service_role;
grant usage on schema campus_private to service_role;
alter table public.campus_subscriptions enable row level security;
grant select,delete on public.campus_subscriptions to authenticated; grant insert(location_id,kind) on public.campus_subscriptions to authenticated;
grant select on public.campus_locations,public.campus_regions to authenticated;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values('00000000-0000-4000-8000-000000000001','authenticated','authenticated','pre-migration@example.invalid','{}','{}',now(),now());
insert into public.hall_messages(author_id,region_id,content,client_message_id,created_at)
  values('00000000-0000-4000-8000-000000000001','teaching','合成的迁移前消息，不应补处理',gen_random_uuid(),now()-interval '1 day');
`
try {
  await db.exec(baseline)
  await db.exec(await readFile(new URL('../docs/supabase/19-hall-message-notifications.sql', import.meta.url), 'utf8'))
  for (const fixture of JSON.parse(await readFile(new URL('./fixtures/hall-legacy-rpc-baseline.json', import.meta.url), 'utf8'))) await db.exec(fixture.definition)
  await db.exec(await readFile(new URL('../docs/supabase/20-hall-proactive-analysis.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../docs/supabase/20-hall-proactive-analysis.sql', import.meta.url), 'utf8'))
  // Assert the invariant needed for deletion/cascade/queue races in fresh
  // transactions. PGlite is single-session: this is lock-order evidence,
  // not a multi-session concurrency stress test.
  await db.exec(`
    create function campus_private.hall_lock_order_probe() returns trigger language plpgsql as $$
    begin
      if not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
        and granted and objid::bigint=(hashtext('campus-hall-matches')::bigint & 4294967295)) then
        raise exception 'Hall match gate missing before % %',tg_table_name,tg_op;
      end if;
      if tg_op='DELETE' then return old; else return new; end if;
    end $$;
    create trigger zzz_hall_cascade_lock_probe before delete on campus_private.hall_message_analysis
      for each row execute function campus_private.hall_lock_order_probe();
    create trigger zzz_hall_source_lock_probe before update or delete on public.hall_messages
      for each row execute function campus_private.hall_lock_order_probe();
    create trigger zzz_hall_preference_lock_probe before update or delete on public.campus_ai_reminder_preferences
      for each row execute function campus_private.hall_lock_order_probe();
    create trigger zzz_hall_auth_lock_probe before delete on auth.users
      for each row execute function campus_private.hall_lock_order_probe();
    create trigger zzz_hall_queue_lock_probe before update on campus_private.information_jobs
      for each row execute function campus_private.hall_lock_order_probe();
  `)
  const setup = `
    insert into auth.users(id) values('00000000-0000-4000-8000-000000000010');
    insert into public.campus_ai_reminder_preferences(user_id) values('00000000-0000-4000-8000-000000000010');
  `
  const message = `insert into public.hall_messages(id,author_id,region_id,content,client_message_id)
    values('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','teaching','合成锁顺序探针',gen_random_uuid());`
  const jobs = `update campus_private.information_jobs set status='running',claim_token='00000000-0000-4000-8000-000000000030',lease_until=now()+interval '3 minutes'
    where target_id='00000000-0000-4000-8000-000000000020';`
  const cases = [
    ['hard-delete cascade',setup+message+`delete from public.hall_messages where id='00000000-0000-4000-8000-000000000020';`],
    ['content update',setup+message+`update public.hall_messages set content='改过的合成文本' where id='00000000-0000-4000-8000-000000000020';`],
    ['retraction',setup+message+`update public.hall_messages set deleted_at=now() where id='00000000-0000-4000-8000-000000000020';`],
    ['preference update',setup+`update public.campus_ai_reminder_preferences set enabled=true where user_id='00000000-0000-4000-8000-000000000010';`],
    ['auth deletion cascade',setup+message+`delete from auth.users where id='00000000-0000-4000-8000-000000000010';`],
    ['queue claim',setup+message+`select public.campus_claim_information_jobs(1);`],
    ['analysis reservation',setup+message+`alter table campus_private.information_jobs disable trigger zzz_hall_queue_lock_probe;`+jobs+`alter table campus_private.information_jobs enable trigger zzz_hall_queue_lock_probe;
       select public.campus_begin_hall_analysis(id,claim_token) from campus_private.information_jobs where target_id='00000000-0000-4000-8000-000000000020';`],
    ['job finish',setup+message+`alter table campus_private.information_jobs disable trigger zzz_hall_queue_lock_probe;`+jobs+`alter table campus_private.information_jobs enable trigger zzz_hall_queue_lock_probe;
       select public.campus_finish_information_job(id,claim_token,'processing_failed') from campus_private.information_jobs where target_id='00000000-0000-4000-8000-000000000020';`],
  ]
  for (const [name, sql] of cases) {
    try { await db.exec('begin;'+sql+'rollback;') }
    catch (error) { await db.exec('rollback;'); throw new Error(`Lock order ${name}: ${error.message}`) }
  }
  await db.exec(`
    drop trigger zzz_hall_cascade_lock_probe on campus_private.hall_message_analysis;
    drop trigger zzz_hall_source_lock_probe on public.hall_messages;
    drop trigger zzz_hall_preference_lock_probe on public.campus_ai_reminder_preferences;
    drop trigger zzz_hall_auth_lock_probe on auth.users;
    drop trigger zzz_hall_queue_lock_probe on campus_private.information_jobs;
    drop function campus_private.hall_lock_order_probe();
  `)
  // Each preserved legacy body must reach the gate before its original first
  // statement, including authorization failures (no row mutations required).
  for (const call of [
    "select public.campus_change_preferences('remove_favorite','\"library\"'::jsonb)",
    "select public.campus_review_report(null,false)",
    "select public.campus_set_report_status(null,'withdrawn')",
    "select public.campus_process_repair(null,'completed')",
    "select public.campus_retry_information_report(null)",
    "select public.campus_complete_information_analysis(null,null,'{}'::jsonb)",
  ]) {
    await db.exec('begin;')
    // Catch inside a savepoint-free PL/pgSQL exception block would release
    // its advisory xact lock on error. Check stored order instead for these
    // unchanged authorization/error paths, and exercise success below.
    const signature = call.match(/public\.(\w+)/)[1]
    const result = await db.query("select prosrc from pg_proc where proname=$1", [signature])
    if (!/^\s*declare[\s\S]*?\bbegin\s+perform pg_advisory_xact_lock|^\s*begin\s+perform pg_advisory_xact_lock/i.test(result.rows[0].prosrc)) throw new Error(`Legacy gate is late: ${signature}`)
    await db.exec('rollback;')
  }
  console.log('Eight isolated row/cascade/queue lock-order cases passed.')
  const untouched = await db.query('select count(*)::int as count from campus_private.hall_message_analysis')
  if (untouched.rows[0].count !== 0) throw new Error('Migration backfilled a historical message')
  const result = await db.exec(await readFile(new URL('../docs/supabase/20-hall-proactive-analysis-regression.sql', import.meta.url), 'utf8'))
  console.log(JSON.stringify(result.findLast(r => r.rows?.length)?.rows))
  const rolledBack = await db.query('select (select count(*)::int from auth.users) as users,(select count(*)::int from campus_private.hall_message_analysis) as analysis,(select count(*)::int from campus_private.hall_analysis_monthly_usage) as usage')
  if (rolledBack.rows[0].users !== 1 || rolledBack.rows[0].analysis !== 0 || rolledBack.rows[0].usage !== 0) throw new Error('Regression fixtures were not rolled back')
  console.log('PostgreSQL isolated runtime: migration + transactional regression passed; no network or production database used.')
} catch (error) {
  console.error(JSON.stringify({ message: error.message, detail: error.detail, hint: error.hint, where: error.where, position: error.position, code: error.code }, null, 2))
  process.exitCode = 1
} finally { await db.close() }
