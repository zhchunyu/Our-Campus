// _measure_layout.cjs —— 量页面的实际布局宽度，判断有没有**横向溢出**。
//
// 为什么需要它：`--headless=new --screenshot` 只给一张图，看不出"文字被右边缘切掉"
// 到底是**正常换行**还是**布局宽度超过视口**。用 Playwright 精确取
// `scrollWidth` / `clientWidth`，并列出所有比视口宽的元素。
//
// 用法：node _measure_layout.cjs <url> [视口宽=390] [视口高=844]
const { chromium } = require('playwright-core');

const EXE = process.env.BR_EDGE ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const url = process.argv[2];
  const W = parseInt(process.argv[3] || '390', 10);
  const H = parseInt(process.argv[4] || '844', 10);
  if (!url) { console.error('用法: node _measure_layout.cjs <url> [w] [h]'); process.exit(2); }

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(800);
  // 懒加载的图要先滚到底把它们都触发出来，否则统计到的"没加载"是假象
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);

  // ---- 图片加载体检（"图片不显示"这类问题的唯一可靠判据）----
  const imgs = await page.evaluate(() => {
    const all = [...document.images];
    return {
      total: all.length,
      ok: all.filter(i => i.naturalWidth > 0).length,
      bad: all.filter(i => i.naturalWidth === 0)
              .map(i => ({ src: (i.getAttribute('src') || '').slice(0, 70), alt: i.alt })),
    };
  });
  console.log('图片 %d 张 ｜ 已加载 %d ｜ 未加载 %d', imgs.total, imgs.ok, imgs.bad.length);
  for (const b of imgs.bad) console.log('   ✗ alt=%s src=%s…', b.alt, b.src);

  const r = await page.evaluate((vw) => {
    const de = document.documentElement;
    // 元素自身不滚动、但**祖先**在滚动时，它超宽是正常的（典型的 `.tw{overflow-x:auto}` 包宽表格）。
    // ★ 只比自身 scrollWidth/clientWidth 会把这种误判成"溢出"。
    const inScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden') && p.clientWidth < el.scrollWidth) return true;
      }
      return false;
    };
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width > vw + 1) {
        over.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 40),
          w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right),
          selfScroll: el.scrollWidth > el.clientWidth + 1,
          clipped: inScroller(el),
          txt: (el.textContent || '').trim().slice(0, 24),
        });
      }
    }
    return {
      vw, scrollW: de.scrollWidth, clientW: de.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      over: over.slice(0, 25), overCount: over.length,
      realOver: over.filter(o => !o.selfScroll && !o.clipped).length,
    };
  }, W);

  console.log('视口宽 %d ｜ documentElement scrollWidth=%d clientWidth=%d ｜ body scrollWidth=%d',
    r.vw, r.scrollW, r.clientW, r.bodyScrollW);
  console.log(r.scrollW > r.clientW
    ? '✗ 存在横向溢出（页面可左右滚动）'
    : '✓ 无横向溢出');
  console.log('比视口宽的元素 %d 个，其中**真溢出** %d 个（其余在可滚动容器内，属正常）:',
    r.overCount, r.realOver);
  for (const o of r.over) {
    const why = o.selfScroll ? '[自身可滚动]' : (o.clipped ? '[被父级裁切]' : '[!真溢出]');
    console.log('   %s %s  w=%d left=%d right=%d | %s',
      why, (o.tag + (o.cls ? '.' + o.cls : '')).padEnd(28),
      o.w, o.left, o.right, o.txt.replace(/\s+/g, ' '));
  }
  await browser.close();
})();
