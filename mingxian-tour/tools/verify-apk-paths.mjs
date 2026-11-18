/**
 * 路径解析验证：
 * 模拟 WebViewAssetLoader 的 URL 根 https://appassets.androidplatform.net/assets/www/，
 * 把 index.html / main.js / psv.module.js / data.js 里的引用全部解析一遍，
 * 检查目标文件是否真的存在于 assets/www 下。
 */
import { readFile, access } from 'node:fs/promises';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'android-app', 'app', 'src', 'main', 'assets', 'www');

// 页面在 APK 里的 URL 根（相对路径都基于它解析）
const BASE_PATH = '/assets/www/';

const problems = [];
const checked = [];

async function exists(relFromWww) {
  try {
    await access(join(WWW, relFromWww));
    return true;
  } catch {
    return false;
  }
}

/** 把浏览器里的 URL 路径转成 assets/www 下的相对路径 */
function urlPathToWww(urlPath) {
  if (!urlPath.startsWith(BASE_PATH)) return null;
  return decodeURIComponent(urlPath.slice(BASE_PATH.length));
}

/** 以 baseDir（相对 www）为基准解析相对引用 */
function resolveRef(baseFileRel, ref) {
  if (/^(https?:|data:|#|\/\/)/.test(ref)) return null; // 外链 / data URI 不检查
  const baseDir = posix.dirname(baseFileRel);
  if (ref.startsWith('/')) {
    return urlPathToWww(ref);
  }
  return posix.normalize(posix.join(baseDir, ref));
}

async function check(baseFileRel, refs) {
  for (const ref of refs) {
    const target = resolveRef(baseFileRel, ref);
    if (!target) continue;
    const ok = await exists(target);
    checked.push({ from: baseFileRel, ref, target, ok });
    if (!ok) problems.push(`${baseFileRel} -> ${ref}  (解析为 ${target}，文件不存在)`);
  }
}

async function main() {
  const html = await readFile(join(WWW, 'index.html'), 'utf8');

  // index.html 的 script / link
  const htmlRefs = [
    ...[...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^(data:|https?:)/.test(h)),
  ];
  await check('index.html', htmlRefs);

  // importmap 里声明的映射（若存在）
  const imMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (imMatch) {
    try {
      const map = JSON.parse(imMatch[1]);
      for (const [k, v] of Object.entries(map.imports || {})) {
        const target = resolveRef('index.html', v);
        if (target) {
          const ok = await exists(target);
          checked.push({ from: 'importmap', ref: `${k} -> ${v}`, target, ok });
          if (!ok) problems.push(`importmap ${k} -> ${v} (${target} 不存在)`);
        }
      }
    } catch { /* 非 JSON，忽略 */ }
  }

  // main.js 的 import
  const mainJs = await readFile(join(WWW, 'app', 'main.js'), 'utf8');
  const mainRefs = [...mainJs.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  await check('app/main.js', mainRefs);

  // psv.module.js 的 import
  const psv = await readFile(join(WWW, 'vendor', 'psv.module.js'), 'utf8');
  const psvRefs = [...psv.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
  await check('vendor/psv.module.js', psvRefs);

  // data.js 里的资源字面量路径（相对 index.html，运行时由页面发起请求）
  // 注意：排除 ${id} 这类模板占位，真实路径由下面的逐个枚举覆盖
  const dataJs = await readFile(join(WWW, 'app', 'data.js'), 'utf8');
  const assetRefs = [...dataJs.matchAll(/['"`](assets\/[^'"`$]+\.(?:webp|jpg|mp3))['"`]/g)].map((m) => m[1]);
  const uniqAssets = [...new Set(assetRefs)];
  await check('index.html', uniqAssets);

  // 场景图/音频的实际映射（由 sceneList 生成，逐个确认）
  const ids = ['2184','2169','2170','2171','2172','2173','2174','2175','2185',
               '2176','2177','2181','2180','2182','2183','2178','2179'];
  const generated = [];
  for (const id of ids) {
    generated.push(`assets/panoramas/${id}.webp`, `assets/panoramas-mobile/${id}.webp`, `assets/previews/${id}.jpg`);
  }
  await check('index.html', generated);

  const audios = ['xiaozhangyuan','chongshenglou','shibanyuan','guanshanglou','shangdetang','nanyuanbieshu','nanyuan4hao','nanyuan3hao'];
  await check('index.html', audios.map((a) => `assets/audio/${a}.mp3`));

  console.log(`检查引用 ${checked.length} 条，失败 ${problems.length} 条`);
  if (problems.length) {
    console.log('\n失败项：');
    for (const p of problems) console.log('  ✗ ' + p);
    process.exitCode = 1;
  } else {
    console.log('全部引用均可解析到 APK 内文件 ✅');
  }
}

main().catch((e) => { console.error('FAILED', e); process.exit(1); });