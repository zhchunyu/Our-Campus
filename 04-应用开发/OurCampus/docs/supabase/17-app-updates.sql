create table public.app_releases (
  platform text not null default 'android' check (platform = 'android'),
  channel text not null default 'stable' check (channel = 'stable'),
  package_id text not null default 'cn.edu.sxau.campustwin' check (package_id = 'cn.edu.sxau.campustwin'),
  version_code integer not null check (version_code between 1 and 2100000000),
  version_name text not null check (char_length(btrim(version_name)) between 1 and 40),
  release_notes text[] not null default '{}'::text[]
    check (cardinality(release_notes) <= 12 and char_length(array_to_string(release_notes, '')) <= 4000),
  download_url text,
  apk_sha256 text check (apk_sha256 is null or apk_sha256 ~ '^[0-9a-f]{64}$'),
  apk_size_bytes bigint check (apk_size_bytes is null or apk_size_bytes between 1 and 209715200),
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  created_at timestamptz not null default now(),
  primary key (platform, channel, version_code),
  constraint app_releases_download_host check (
    download_url is null or (
      download_url ~ '^https://hkdblizadnkskxslyjyq[.]supabase[.]co/storage/v1/object/public/app-releases/android/[A-Za-z0-9._-]+[.]apk$'
      and strpos(download_url, '..') = 0
    )
  ),
  constraint app_releases_published_artifact check (
    status <> 'published' or (
      download_url is not null and apk_sha256 is not null
      and apk_size_bytes is not null and published_at is not null
    )
  )
);
alter table public.app_releases enable row level security;
revoke all on public.app_releases from anon, authenticated;
grant select on public.app_releases to anon, authenticated;
grant all on public.app_releases to service_role;
create policy app_releases_read_published on public.app_releases for select to anon, authenticated
  using (status = 'published' and published_at <= now());
comment on table public.app_releases is 'Administrator-published Android APK metadata; clients can only read published releases. Publish only after verifying APK, certificate and public download.';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', true, 52428800,
  array['application/vnd.android.package-archive', 'application/octet-stream'])
on conflict (id) do nothing;
