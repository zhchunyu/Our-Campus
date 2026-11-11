-- 6 个真实窗口：来自用户现场照片，资料序号不是现场窗口编号；用户确认一层。
-- 在 08 号餐厅窗口表存在后执行。不会覆盖管理员已维护的同名窗口或已有编号。
begin;
alter table public.restaurant_windows add column if not exists menu jsonb not null default '[]' check(jsonb_typeof(menu)='array' and octet_length(menu::text)<12000);
alter table public.restaurant_windows add column if not exists floor text not null default '' check(char_length(floor)<=40);
alter table public.restaurant_windows add column if not exists number_verified boolean not null default true;
insert into public.restaurant_windows(id,restaurant_id,number,name,category,dish,description,menu,floor,number_verified)
select v.* from (values
('b126e080-1008-4000-8000-000000000001'::uuid,'canteen','资料1','咥一碗饸饹面','面食','招牌臊子肉面 · 牛肉面','现场招牌：咥一碗饸饹面。早餐、面食及配料以当天窗口供应为准。','[["葱油面",4],["鸡汁饸饹面",7],["招牌臊子肉面",12],["肉丁炸酱",10],["酸菜肉丝面",9],["西红柿鸡蛋面",8]]'::jsonb,'一层',false),
('b126e080-1008-4000-8000-000000000002'::uuid,'canteen','资料2','GO-RICE 歌米快餐','米饭','现炒盖饭 · 木耳炒肉盖饭','现场招牌：GO-RICE 歌米快餐，现炒现卖。照片被遮挡的菜单与价格待核对。','[["木耳炒肉盖饭",13],["水煮肉片盖饭",13],["鱼香肉丝盖饭",12]]'::jsonb,'一层',false),
('b126e080-1008-4000-8000-000000000003'::uuid,'canteen','资料3','山城挑挑重庆面馆','面食','重庆小面 / 米线 · 酸辣面','现场招牌：山城挑挑重庆面馆。支持小面、米线及酸辣粉等选择。','[["重庆小面 / 米线",9],["山城拌面",8],["金牌酸辣粉",8],["杂酱小面 / 米线（干 / 汤）",12],["豌豆小面 / 米线（干 / 汤）",10]]'::jsonb,'一层',false),
('b126e080-1008-4000-8000-000000000004'::uuid,'canteen','资料4','胖姐特色营养粥·五谷渔粉','面食','五谷渔粉 · 营养粥','现场招牌：胖姐特色营养粥、五谷渔粉。粥、豆浆和渔粉按窗口当天供应。','[["八宝粥",2],["黑米粥",2],["现磨豆浆",2],["皮蛋瘦肉粥",2],["绿豆小米粥",1.5],["招牌渔粉",12],["原味渔粉",8],["酸辣渔粉",9],["麻辣渔粉",10],["茄汁鱼丸渔粉",10],["茄汁玉米渔粉",11]]'::jsonb,'一层',false),
('b126e080-1008-4000-8000-000000000005'::uuid,'canteen','资料5','掉渣饼','小吃','原味掉渣饼 · 鸡蛋 / 烤肠加料','现场招牌：掉渣饼。价格为照片所示，组合与加料价格以现场为准。','[["原味掉渣饼",3.5],["掉渣饼 + 鸡蛋",4.5],["掉渣饼 + 烤肠",4.5],["掉渣饼 + 土豆",4.5]]'::jsonb,'一层',false),
('b126e080-1008-4000-8000-000000000006'::uuid,'canteen','资料6','玖铭家炸鸡腿','小吃','炸鸡腿 · 韩式炸鸡 · 火鸡面套餐','现场招牌：玖铭家炸鸡腿。套餐和促销为拍摄时标价，不保证持续有效。','[["爆汁大鸡腿（1个）",6],["爆汁大鸡腿（2个）",9.9],["半斤随心桶",9.9],["火鸡面套餐",9.9],["可乐（杯）",3]]'::jsonb,'一层',false)
) as v(id,restaurant_id,number,name,category,dish,description,menu,floor,number_verified)
where not exists(select 1 from public.restaurant_windows r where r.restaurant_id=v.restaurant_id and r.name=v.name)
on conflict do nothing;
select id,number,name,floor,number_verified from public.restaurant_windows where restaurant_id='canteen' order by number;
notify pgrst,'reload schema';
commit;
