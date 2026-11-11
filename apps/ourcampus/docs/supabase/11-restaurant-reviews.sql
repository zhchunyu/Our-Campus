-- 在已有餐厅窗口表（08 号 SQL）上增加真实多人评价。已有本机评价不会自动上传。
begin;
create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references public.restaurant_windows(id) on delete cascade,
  restaurant_id text not null references public.campus_locations(id),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check(char_length(author_name) between 1 and 40),
  client_id uuid not null,
  rating integer not null check(rating between 1 and 5),
  content text not null check(char_length(btrim(content)) between 1 and 300),
  tags text[] not null default '{}' check(cardinality(tags)<=3 and tags<@array['口味好','分量足','性价比高','出餐快','排队久','偏油','偏咸']::text[]),
  price numeric(5,2) check(price between 0 and 200),
  status text not null default 'visible' check(status in ('visible','withdrawn')),
  created_at timestamptz not null default now(),
  unique(author_id,client_id)
);
create index if not exists restaurant_reviews_window_idx on public.restaurant_reviews(window_id,created_at desc,id desc) where status='visible';
create unique index if not exists restaurant_reviews_one_author_idx on public.restaurant_reviews(window_id,author_id) where status='visible';
alter table public.restaurant_reviews enable row level security;
revoke all on public.restaurant_reviews from public,anon,authenticated;
grant select on public.restaurant_reviews to anon,authenticated;
grant all on public.restaurant_reviews to service_role;
drop policy if exists restaurant_reviews_read on public.restaurant_reviews;
create policy restaurant_reviews_read on public.restaurant_reviews for select to anon,authenticated using(status='visible');

create or replace function public.campus_submit_restaurant_review(p_client_id uuid,p_window_id uuid,p_restaurant_id text,
  p_rating integer,p_content text,p_tags text[] default '{}',p_price numeric default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; nickname text; previous public.restaurant_reviews;
begin
  if auth.uid() is null then raise exception '请先登录，再发布评价'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  select * into previous from public.restaurant_reviews where author_id=auth.uid() and client_id=p_client_id;
  if found then
    if previous.window_id is distinct from p_window_id or previous.restaurant_id is distinct from p_restaurant_id
      or previous.rating is distinct from p_rating or previous.content is distinct from btrim(p_content)
      or previous.tags is distinct from coalesce(p_tags,'{}') or previous.price is distinct from round(p_price,2) then
      raise exception '这次评价已保存；更改内容请重新打开评价表单'; end if;
    return previous.id;
  end if;
  if not exists(select 1 from public.restaurant_windows where id=p_window_id and restaurant_id=p_restaurant_id) then raise exception '窗口已移除，请重新选择'; end if;
  if (select count(*) from public.restaurant_reviews where author_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception '评价提交过于频繁，请稍后重试'; end if;
  select left(coalesce(nullif(btrim(p.nickname),''),'校园同学'),40) into nickname from public.profiles p where user_id=auth.uid();
  insert into public.restaurant_reviews(window_id,restaurant_id,author_id,author_name,client_id,rating,content,tags,price)
    values(p_window_id,p_restaurant_id,auth.uid(),coalesce(nickname,'校园同学'),p_client_id,p_rating,btrim(p_content),coalesce(p_tags,'{}'),round(p_price,2)) returning id into result;
  return result;
end $$;
create or replace function public.campus_withdraw_restaurant_review(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.restaurant_reviews set status='withdrawn' where id=p_id and (author_id=auth.uid() or public.campus_is_manager());
  if not found then raise exception '只能撤回自己的评价，管理员可移除不当内容'; end if;
end $$;
revoke all on function public.campus_submit_restaurant_review(uuid,uuid,text,integer,text,text[],numeric) from public,anon;
revoke all on function public.campus_withdraw_restaurant_review(uuid) from public,anon;
grant execute on function public.campus_submit_restaurant_review(uuid,uuid,text,integer,text,text[],numeric) to authenticated;
grant execute on function public.campus_withdraw_restaurant_review(uuid) to authenticated;

-- 以服务器完整数据统计；不会将示例或本机评价算入真实口碑。
create or replace view public.restaurant_review_stats with (security_invoker=true) as
  select restaurant_id,window_id,count(*)::integer as count,sum(rating)::integer as rating_sum,round(avg(rating),1) as rating,
    round(avg(price),0) as price,round(count(*) filter(where rating>=4)*100.0/nullif(count(*),0),0) as recommended
  from public.restaurant_reviews where status='visible' group by restaurant_id,window_id;
grant select on public.restaurant_review_stats to anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='restaurant_reviews') then
    alter publication supabase_realtime add table public.restaurant_reviews;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='restaurant_windows') then
    alter publication supabase_realtime add table public.restaurant_windows;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
