-- 只读检查：执行失败时先核对已有结构，不要重建已有数据库。
do $$
declare relation text; item record; missing text[]:='{}';
begin
  foreach relation in array array['public.campus_locations','public.campus_events','public.notifications','public.hall_messages','campus_private.user_roles'] loop
    if to_regclass(relation) is null then missing:=array_append(missing,relation); end if;
  end loop;
  if cardinality(missing)>0 then raise exception '缺少前置表：%',array_to_string(missing,', '); end if;
  if to_regprocedure('public.campus_is_manager()') is null then raise exception '缺少角色函数 campus_is_manager()'; end if;
  for item in select * from (values
    ('campus_locations','id'),('campus_events','id'),('campus_events','source'),('campus_events','updated_at'),
    ('campus_events','is_demo'),('campus_events','author_id'),('campus_events','location_id'),('campus_events','type'),
    ('campus_events','title'),('campus_events','impact'),('campus_events','start_at'),('campus_events','end_at'),
    ('campus_events','status'),('campus_events','heat_level'),('campus_events','visible_to'),('campus_events','affected_edge_ids'),
    ('hall_messages','id'),('hall_messages','author_id'),('hall_messages','deleted_at'),
    ('notifications','id'),('notifications','recipient_id'),('notifications','read_at'),('notifications','title'),
    ('notifications','body'),('notifications','type'),('notifications','related_type'),('notifications','related_id'),('notifications','created_at')
  ) as required(table_name,column_name) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=item.table_name and c.column_name=item.column_name) then
      raise exception '缺少字段 %.%',item.table_name,item.column_name;
    end if;
  end loop;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='campus_events' and column_name='id' and udt_name='uuid') then
    raise exception 'campus_events.id 应为 uuid，请核对已有结构'; end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception '缺少 supabase_realtime 发布配置'; end if;
end $$;
select '前置表和关键字段检查通过；仍需人工核对 RLS、索引和外键' as result;
select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in ('hall_messages','notifications','campus_events');
