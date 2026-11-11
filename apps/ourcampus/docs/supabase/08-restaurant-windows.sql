-- 2026-10-05 / 餐厅窗口管理增量：在已接入 CampusTwin 的 Supabase SQL Editor 执行一次。
-- 依赖已有 campus_locations / campus_is_manager()。不修改账号、聊天或其他表。
-- 初始不添加虚构窗口，管理员通过 App 录入真实名单。
begin;
create table public.restaurant_windows (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.campus_locations(id)
    check (restaurant_id in ('canteen', 'employee-canteen', 'yixinyuan-canteen', 'bitaoyuan-canteen')),
  number text not null check (number = btrim(number) and char_length(number) between 1 and 12),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  category text not null check (category in ('面食', '米饭', '轻食', '小吃', '饮品', '其他')),
  dish text not null default '' check (char_length(dish) <= 60),
  description text not null default '' check (char_length(description) <= 200),
  created_at timestamptz not null default now(),
  unique (restaurant_id, number)
);
alter table public.restaurant_windows enable row level security;
revoke all on public.restaurant_windows from public, anon, authenticated;
grant select on public.restaurant_windows to anon, authenticated;
grant insert, delete on public.restaurant_windows to authenticated;
create policy restaurant_windows_read on public.restaurant_windows
  for select to anon, authenticated using (true);
create policy restaurant_windows_manager_insert on public.restaurant_windows
  for insert to authenticated with check ((select public.campus_is_manager()));
create policy restaurant_windows_manager_delete on public.restaurant_windows
  for delete to authenticated using ((select public.campus_is_manager()));
notify pgrst, 'reload schema';
commit;

-- 管理员账号设置：先确认目标邮箱，再单独执行下面两行（去掉注释并替换邮箱）。
-- insert into campus_private.user_roles(user_id, role)
-- select id, 'manager' from auth.users where email = '替换为管理员真实邮箱'
-- on conflict (user_id) do update set role = excluded.role;
-- 设置后管理员退出登录再重新登录，进入大厅 > 餐厅评价 > 选择餐厅。
