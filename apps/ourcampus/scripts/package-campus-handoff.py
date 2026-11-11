"""Pack the backend handoff by an explicit allowlist. Never include local secrets."""
from pathlib import Path
import hashlib
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs' / '校园信息推送交接-2026-10-08'
OUTPUT = ROOT / 'docs' / 'OurCampus-服务器交接-校园推送与餐厅评价-2026-10-08.zip'
PREFIX = 'OurCampus-服务器交接-2026-10-08'

entries = {}
for name in ['README-先看这里.md', '01-服务器部署.md', '02-个推与手机配置.md',
             '03-联调与故障处理.md', '04-数据与接口说明.md', '05-真实餐厅窗口与评价.md',
             'server-secrets.example.env', '谷园窗口照片转录.json']:
    entries[name] = DOCS / name
entries['database/00-preflight.sql'] = DOCS / '00-preflight.sql'
for name in ['09-campus-information-push.sql', '10-campus-worker-schedule.sql',
             '11-restaurant-reviews.sql', '12-guyuan-real-windows.sql']:
    entries[f'database/{name}'] = ROOT / 'docs' / 'supabase' / name
for name in ['01-CampusTwin-schema.sql', '02-CampusTwin-seed.sql', '08-restaurant-windows.sql']:
    entries[f'reference/{name}'] = ROOT / 'docs' / 'supabase' / name
for name in ['supabase/config.toml', 'supabase/functions/campus-information-worker/index.ts',
             'supabase/functions/auv-assistant/index.ts',
             'supabase/functions/_shared/campus-information-worker.js',
             'supabase/functions/_shared/auv.js', 'supabase/functions/_shared/campus-catalog.js',
             'supabase/functions/_shared/campus-presentation.js',
             'android/push.example.properties']:
    entries[name] = ROOT / name
for name in ['src/data/campusInformation.js', 'src/data/campusPush.js',
             'src/data/restaurantCloudReviews.js', 'src/data/restaurantWindows.js', 'src/data/guyuanWindows.js']:
    entries[f'client-reference/{name}'] = ROOT / name

payloads = {}
for name, path in entries.items():
    data = path.read_bytes()
    if re.search(rb'(auv-[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_]{10,}|-----BEGIN .*PRIVATE KEY-----)', data):
        raise SystemExit(f'Secret-like value detected: {name}; package not created')
    if '..' in Path(name).parts or name.startswith('/'):
        raise SystemExit('Invalid archive path')
    payloads[name] = data

manifest = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(payloads.items()))
payloads['MANIFEST.sha256'] = manifest.encode('utf-8')
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in payloads.items():
        archive.writestr(f'{PREFIX}/{name}', data)
with zipfile.ZipFile(OUTPUT) as archive:
    damaged = archive.testzip()
    if damaged:
        raise SystemExit(f'Damaged ZIP entry: {damaged}')
    if len(archive.infolist()) != len(payloads):
        raise SystemExit('Archive inventory mismatch')

sys.stdout.reconfigure(encoding='utf-8')
print(f'Created {OUTPUT}')
print(f'Files: {len(payloads)}, size: {OUTPUT.stat().st_size / 1024:.1f} KB')
print('Explicit allowlist, secret-pattern scan and archive integrity check complete.')
