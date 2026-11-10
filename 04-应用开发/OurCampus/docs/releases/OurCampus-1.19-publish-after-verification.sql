-- Run only AFTER original-phone overlay installation and anonymous Storage download hash/size checks.
-- This script does not upload an APK, verify a phone or change an access policy.
-- Expected object: https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk
-- Expected bytes: 35680287; SHA-256: a06af4ce5a8b070f251fd1e87fac68791dda9f28934409f193c8b9cf7b40234f
begin;
do $release_guard$
begin
  if exists (
    select 1 from public.app_releases
    where platform = 'android' and channel = 'stable' and version_code = 20
      and (package_id is distinct from 'cn.edu.sxau.campustwin'
        or version_name is distinct from '1.19'
        or download_url is distinct from 'https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk'
        or apk_sha256 is distinct from 'a06af4ce5a8b070f251fd1e87fac68791dda9f28934409f193c8b9cf7b40234f'
        or apk_size_bytes is distinct from 35680287
        or status = 'withdrawn')
  ) then
    raise exception 'Version 20 belongs to another artifact or is withdrawn. Stop; do not overwrite.';
  end if;
end;
$release_guard$;
insert into public.app_releases
  (platform, channel, package_id, version_code, version_name, release_notes,
   download_url, apk_sha256, apk_size_bytes, published_at, status)
values
  ('android', 'stable', 'cn.edu.sxau.campustwin', 20, '1.19',
   array['新增前台通知排队，恢复页面后展示待提醒消息。','聊天消息默认不提醒，可按五个地区主动订阅；详情可打开对应地区，失效后清除旧内容。','配置手机系统通知接入；实际后台送达和厂商离线通道仍待真机验收。','保留社区图片发布、精简个人页、每日课表、头像与检查更新。']::text[],
   'https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk', 'a06af4ce5a8b070f251fd1e87fac68791dda9f28934409f193c8b9cf7b40234f', 35680287, now(), 'published')
on conflict (platform, channel, version_code) do update
  set release_notes = excluded.release_notes, published_at = now(), status = 'published'
  where app_releases.status = 'draft'
    and app_releases.package_id = excluded.package_id
    and app_releases.version_name = excluded.version_name
    and app_releases.download_url = excluded.download_url
    and app_releases.apk_sha256 = excluded.apk_sha256
    and app_releases.apk_size_bytes = excluded.apk_size_bytes
returning platform, channel, package_id, version_code, version_name, apk_sha256, apk_size_bytes, published_at, status;
select platform, channel, package_id, version_code, version_name, download_url,
       apk_sha256, apk_size_bytes, published_at, status
from public.app_releases
where platform = 'android' and channel = 'stable' and version_code = 20;
commit;
