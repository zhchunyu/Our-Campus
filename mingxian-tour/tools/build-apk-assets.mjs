/**
 * 把 mingxian-tour 的静态页面准备到 Android 工程的 assets/www 下。
 *
 * 关键处理：
 *  psv.module.js 内部用裸模块名 `from "three"`，浏览器需要 importmap 才能解析。
 *  老版本 Android WebView 不支持 importmap，所以这里把裸名替换成相对路径，
 *  让它不再依赖 importmap（index.html 里的 importmap 仍保留，新版内核会走它）。
 */
import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'android-app', 'app', 'src', 'main', 'assets', 'www');

const COPY = [
  ['index.html', 'file'],
  ['app', 'dir'],
  ['vendor', 'dir'],
  ['assets', 'dir'],
];

async function main() {
  console.log('目标目录:', OUT);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const [name, kind] of COPY) {
    const src = join(ROOT, name);
    const dst = join(OUT, name);
    await cp(src, dst, { recursive: kind === 'dir' });
    console.log('  复制', name);
  }

  // 打补丁：three 裸模块名 -> 相对路径
  const psvPath = join(OUT, 'vendor', 'psv.module.js');
  const original = await readFile(psvPath, 'utf8');
  const patched = original.replace(/from\s*(["'])three\1/g, 'from "./three.min.js"');
  const hits = (original.match(/from\s*(["'])three\1/g) || []).length;
  await writeFile(psvPath, patched, 'utf8');
  console.log(`  psv.module.js: 替换 ${hits} 处 "three" -> "./three.min.js"`);

  // 统计体积
  let bytes = 0;
  let files = 0;
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        files += 1;
        bytes += (await stat(p)).size;
      }
    }
  }
  await walk(OUT);
  console.log(`\nassets/www 共 ${files} 个文件，${(bytes / 1048576).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});