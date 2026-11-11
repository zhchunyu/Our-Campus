# -*- coding: utf-8 -*-
"""make_atlas_mobile.py —— 生成「建模图集 · 手机版」（**单文件、零外部依赖**）。

为什么需要单独一个版本
--------------------------------------------------------------------------------
主图集 `山河大学_三维建模图集.html` 引用的是 `../renders/*.png` **相对路径**，
而本项目从工作区目录到图片文件名**全是中文**。这带来两类现实问题：

1. **静态预览 / 手机浏览器里图片全部不显示** —— 页面本身不报错，只是图裂。
   原因是非 ASCII 路径在不同 HTTP 服务下的编码处理不一致（主图集已加百分号编码缓解，
   但"只拷走 HTML"这种用法仍然必然缺图）。
2. **只发一个 HTML 文件给别人 / 发到手机** —— 相对路径指向的 `renders/` 根本不在旁边。

本版本的做法：把图片**缩放后内嵌为 base64 data URI**，
⇒ 单个 `.html` 文件自带全部内容，**拷到任何地方、任何设备、离线都能看**。

参数：图宽 1000 px / JPEG q84（实测约 86 KB/张，24 张合计约 2.8 MB）。
手机屏宽 390~430 px，1000 px 已足够清晰；再大只是徒增体积。

用法：python make_atlas_mobile.py
"""
import base64
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# 复用主图集的叙事文案 —— 两版内容必须一致，文案只维护一份
from make_atlas_html import ASSET, OUT_DIR, STAGES, METRICS  # noqa: E402

OUT = os.path.join(OUT_DIR, '山河大学_三维建模图集_手机版.html')

IMG_W = 1000
IMG_Q = 84

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>山河大学 · 三维建模图集（手机版）</title>
<style>
  :root{--ink:#2B2E33;--paper:#F4F2EE;--card:#fff;--line:#D8D4CC;
        --sub:#6C6862;--copper:#B07B45;}
  *{box-sizing:border-box;-webkit-text-size-adjust:100%;}
  body{margin:0;background:var(--paper);color:var(--ink);
       font:15px/1.8 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif;}
  .wrap{max-width:900px;margin:0 auto;padding:0 0 40px;}
  .blk{background:var(--card);border-bottom:1px solid var(--line);padding:22px 16px 26px;
       overflow-wrap:anywhere;}
  .cover{background:linear-gradient(135deg,#FBFAF8,#EFEDE8);padding:44px 20px 48px;}
  .cover h1{font-size:25px;margin:0 0 8px;letter-spacing:.04em;line-height:1.35;}
  .cover .sub{font-size:13px;color:var(--sub);letter-spacing:.1em;margin-bottom:22px;}
  .cover .concept{font-size:17px;letter-spacing:.16em;color:var(--copper);
                  border-left:3px solid var(--copper);padding-left:12px;margin-bottom:20px;}
  .cover .meta{font-size:12.5px;color:var(--sub);line-height:2;}
  h2{font-size:18px;margin:0 0 4px;padding-bottom:9px;border-bottom:2px solid var(--ink);}
  h2 .n{color:var(--copper);font-size:13px;margin-right:8px;}
  h3{font-size:16px;margin:22px 0 4px;}
  .sub2{font-size:12.5px;color:var(--sub);margin:0 0 12px;}
  .lead{font-size:14px;color:var(--sub);margin:12px 0 16px;}
  ul.notes{margin:0 0 14px;padding-left:19px;}
  ul.notes li{margin:7px 0;font-size:14.5px;}
  code{font-family:Consolas,monospace;font-size:13px;background:#F0EEE9;
       border:1px solid var(--line);border-radius:3px;padding:1px 5px;}
  figure{margin:0 0 14px;border:1px solid var(--line);background:#000;border-radius:2px;
         overflow:hidden;}
  figure img{display:block;width:100%;height:auto;}
  figcaption{background:#fff;color:var(--sub);font-size:12px;padding:7px 10px;}
  .tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0 18px;}
  table{border-collapse:collapse;font-size:13.5px;min-width:480px;width:100%;}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:#F0EEE9;font-weight:600;white-space:nowrap;}
  td.k{font-weight:600;white-space:nowrap;}
  td.v{color:var(--copper);font-weight:600;}
  .swatch{display:flex;margin:14px 0 4px;border:1px solid var(--line);}
  .swatch div{flex:1;height:46px;position:relative;}
  .swatch span{position:absolute;left:0;right:0;bottom:-19px;text-align:center;
               font-size:10px;color:var(--sub);}
  .swatch-wrap{margin-bottom:32px;}
  .tag{display:inline-block;border:1px solid var(--line);border-radius:3px;
       padding:1px 7px;font-size:11px;color:var(--sub);margin-right:6px;}
  .tip{background:#FFF8EC;border:1px solid #E8D9BC;border-radius:4px;
       padding:10px 12px;font-size:13px;color:#7A5A22;margin:0 0 18px;}
  footer{font-size:12px;color:var(--sub);border-top:1px solid var(--line);
         padding-top:14px;margin-top:22px;line-height:1.95;}
</style></head><body><div class="wrap">

<div class="blk cover">
  <h1>山河大学 · 三维建模图集</h1>
  <div class="sub">校园场景程序化建模 / 实景渲染 / 轻量化交付</div>
  <div class="concept">藏山纳智 · 云廊书院</div>
  <div class="meta">
    以山为院 · 以水为径 · 以云为廊<br>
    七个设计阶段（R0~R6）+ 全园整合（R7）｜ 71 张实景渲染成图<br>
    全园轻量化 GLB ｜ Cycles 物理渲染 · 统一光照配方 · 全流程脚本化可复现
  </div>
  <div class="meta" style="margin-top:16px">
    本图集为三维建模层面的成果陈列，供技术方案书与答辩材料取图使用。<br>
    校园为完全虚构设定；全部图面不含任何题字（匾额留空白石板）。
  </div>
  <div class="tip" style="margin-top:22px">
    <b>手机版说明</b>：本文件把全部图片内嵌其中，<b>不依赖任何外部文件</b>，
    可离线查看、可单独转发。图片已缩放至 1000 px 宽以保证体积。
    需要高清原图请用桌面版图集，或直接取 <code>02-三维资产/renders/</code>。<br>
    <b>表格可左右滑动查看。</b>
  </div>
</div>

<div class="blk">
  <h2><span class="n">01</span>设计概念与空间结构</h2>
  <p class="lead">校园置于半岛地形之上，以中轴串联山门、广场、土丘、图书馆、塔与尽端平台；
     智慧环廊环绕案山形成一圈"云端走廊"，五个功能分区分布在环廊外侧。</p>
  __T_CONCEPT__
  <h3>五个空间锚点</h3>
  __T_ANCHOR__
  <h3>中轴节点（Y 坐标，m）</h3>
  __T_AXIS__
  <p class="sub2">坐标系：<b>X 东 / Y 北 / Z 上</b>；水面 Z = 0.0，岸顶 Z = 3.0，
     水下岸底 Z = −3.4；场地 X ∈ [−816, 816]，Y ∈ [0, 1238]（1 : 1 真实尺度）。</p>
</div>

<div class="blk">
  <h2><span class="n">02</span>建模技术路线</h2>
  <p class="lead">全园不是"一个模型文件"，而是七个可独立重跑的阶段脚本串联：
     每个阶段只负责自己那一片区域，共享同一套场地骨架与构件工具库。</p>
  __T_STAGES__
  <h3>管线</h3>
  __T_PIPE__
  <h3>配色体系</h3>
  <p class="sub2">以"墨 / 素 / 木 / 铜"四色控制，铜色占比 &lt; 3%（仅用于檐口线等细部）</p>
  <div class="swatch-wrap">
    <div class="swatch">
      <div style="background:#2B2E33"><span>墨 #2B2E33</span></div>
      <div style="background:#E8E6E0"><span>素 #E8E6E0</span></div>
      <div style="background:#C9A87C"><span>木 #C9A87C</span></div>
      <div style="background:#B07B45"><span>铜 #B07B45</span></div>
    </div>
  </div>
  <p class="sub2">材料：清水混凝土 / 胶合木 + 钢节点 / 超白玻璃 + 竹木格栅 / 哑光钛锌板 /
     镜面不锈钢（<b>仅山门与漂浮讲堂</b>）。</p>
</div>

__STAGE_BLOCKS__

<div class="blk">
  <h2><span class="n">04</span>成果指标</h2>
  <p class="lead">下列数字均由脚本从实际产出物中统计得出，可随时重跑复核。</p>
  __T_METRICS__
  <h3>质量保障</h3>
  __T_QA__
  <h3>交付物</h3>
  __T_DELIV__
</div>

<div class="blk">
  <h2><span class="n">05</span>说明</h2>
  <p class="lead"><span class="tag">完全虚构</span>
     校园为完全虚构设定，与任何现实院校无关；图面与模型中不含校名、Logo、指导教师信息。</p>
  <p class="lead"><span class="tag">无题字</span>
     全项目不出现任何题字，匾额一律为空白石板。</p>
  <p class="lead"><span class="tag">真实尺度</span>
     模型按 1 : 1 真实尺度建立（1 单位 = 1 米）；总平面阶段以 1 SVG 像素 = 2.4 m 换算。</p>
  <p class="lead"><span class="tag">脚本可复现</span>
     全部几何由脚本生成，无手工建模步骤；配色与光照配方以 JSON 保存。</p>
  <footer>
    本页共 __NIMG__ 张图，均已内嵌。原始高清图位于 <code>02-三维资产/renders/</code>，
    文件名即"阶段_对象_视角"。桌面版图集（带 A4 横向打印样式）见
    <code>山河大学_三维建模图集.html</code>。
  </footer>
</div>

</div></body></html>
"""


def img_uri(path):
    """读图 → 缩放 → JPEG → base64 data URI。"""
    im = Image.open(path).convert('RGB')
    if im.width > IMG_W:
        im = im.resize((IMG_W, round(IMG_W * im.height / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=IMG_Q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii'), buf.tell()


def table(rows, head=None, cls=()):
    """rows: list of list[str]；head 为表头。cls 指定某些列加 class。"""
    out = ['<div class="tw"><table>']
    if head:
        out.append('<tr>' + ''.join('<th>%s</th>' % h for h in head) + '</tr>')
    for r in rows:
        tds = []
        for i, c in enumerate(r):
            k = cls[i] if i < len(cls) else ''
            tds.append('<td%s>%s</td>' % (' class="%s"' % k if k else '', c))
        out.append('<tr>' + ''.join(tds) + '</tr>')
    out.append('</table></div>')
    return '\n  '.join(out)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # ---- 各表格 ----
    t_concept = table(
        [['台基', '首层架空 + 公共基座', '基座体量与楼板边带（R0）'],
         ['斗拱', '斜向编织格构', '楼板边带 1.25 m 编织带，不做立面外挂（R0 / R2）'],
         ['坡屋顶', '变曲率连续曲面', '9 环薄壳，壳平面 = 顶层轮廓（R2 / R3）'],
         ['塔', '空中庭院错位堆叠', '每层自成完整的盒，逐层错位（R0）']],
        head=['传统形制', '当代转译', '几何落点'])

    t_anchor = table(
        [['山门', '校园的仪式入口：两片崖体夹 116 m 变截面拱', 'R1'],
         ['智慧环廊', '<b>AI 系统的物理载体</b> —— 全长 1631.9 m 的连续环，串起七个站点', 'R4'],
         ['垂直书院', '语言样板：93 m 塔 + 42 m 基座，全楼取消檐口', 'R0'],
         ['下沉智谷', '下沉聚落：深 8 m，上壁真透明玻璃幕', 'R1'],
         ['漂浮讲堂', '悬于水面 20.5 m 的薄壳体量，底面为镜面底板', 'R2']],
        head=['锚点', '角色', '阶段'], cls=('k', '', ''))

    t_axis = table([['33.6', '129.6', '244.8', '518.4', '648.0', '782.4']],
                   head=['山门', '广场', '土丘', '图书馆', '塔', '尽端平台'])

    t_stages = table(
        [[s['key'], s['title'].split(' · ')[1], s['notes'][0]] for s in STAGES],
        head=['阶段', '内容', '关键参数'], cls=('k', '', ''))

    t_pipe = table(
        [['场地骨架', '半岛地形 / 水面 / 路网 / 铺装 / 绿化 / 远山', '一次性建好，所有阶段复用'],
         ['阶段脚本', 'R0~R6 逐段叠加（R7 = 全园整合轮），共享 globals', '后面的阶段可直接复用前面定义的构件工具'],
         ['配色重标', '独立模块，作为阶段链<b>最后一项</b>执行', '全园统一配色必须作用在"所有阶段都建完之后"'],
         ['渲染', 'Cycles，按机位表批量出图', '机位表与光照配方都是数据（JSON），改机位不用改代码'],
         ['导出', '材质压平 → 网格抽稀 → GLB', '两件事都是破坏性的，必须排在渲染与存盘之后']],
        head=['环节', '做法', '为什么'], cls=('k', '', ''))

    t_metrics = table([[m[0], m[1], m[2]] for m in METRICS],
                      head=['指标', '数值', '口径'], cls=('k', 'v', ''))

    t_qa = table(
        [['逐像素 A/B 对照', '任何改动在<b>全量重渲之前</b>先用 2~5 个代表机位量化；最大差 &gt; 200 判定为几何不一致'],
         ['配色合规度体检', '分上下半图统计冷暖像素比（天空天然是蓝的），并监控"过曝像素占比"'],
         ['全量视觉巡检', '把全部成图拼成接触表一次看全 —— 据此发现并修复了占位体块过曝成白块'],
         ['遮挡射线体检', '对每个机位打 5 × 3 网格射线，核对"画面中心是否真是该图的主体"'],
         ['全量归档', '每次会改变观感的改动，重渲前整目录归档；保留 7 个历史版本']],
        head=['手段', '作用'], cls=('k', ''))

    t_deliv = table(
        [['成图', '71 张 1600 × 900 实景渲染', '02-三维资产/renders/'],
         ['对照总览', '分阶段改动前后对照与量化', 'renders/总览_R0-R6.html'],
         ['轻量化模型', 'GLB，含 Draco 压缩', 'exports/山河大学_全园_R7.glb'],
         ['模型说明', '坐标尺度 / 导入方式 / 已知限制', 'exports/山河大学_全园GLB_交付说明.md'],
         ['质量报告', '巡检方法与缺陷修复记录', '05-测试与质量/…_巡检报告_R7.md']],
        head=['类别', '内容', '位置'], cls=('k', '', ''))

    # ---- 阶段块（内嵌图片）----
    blocks, n_img, total = [], 0, 0
    for i, st in enumerate(STAGES):
        figs = []
        for f in st['imgs']:
            src = os.path.join(ASSET, 'renders', f)
            uri, size = img_uri(src)
            total += size
            n_img += 1
            figs.append('<figure><img src="%s" alt="%s" loading="lazy">'
                        '<figcaption>%s</figcaption></figure>' % (uri, f[:-4], f[:-4]))
        notes = '\n    '.join('<li>%s</li>' % n for n in st['notes'])
        blocks.append("""<div class="blk">
  <h2><span class="n">03.%d</span>%s</h2>
  <p class="sub2">%s</p>
  <ul class="notes">
    %s
  </ul>
  %s
</div>""" % (i + 1, st['title'], st['sub'], notes, '\n  '.join(figs)))

    html = (TEMPLATE
            .replace('__T_CONCEPT__', t_concept)
            .replace('__T_ANCHOR__', t_anchor)
            .replace('__T_AXIS__', t_axis)
            .replace('__T_STAGES__', t_stages)
            .replace('__T_PIPE__', t_pipe)
            .replace('__T_METRICS__', t_metrics)
            .replace('__T_QA__', t_qa)
            .replace('__T_DELIV__', t_deliv)
            .replace('__STAGE_BLOCKS__', '\n\n'.join(blocks))
            .replace('__NIMG__', str(n_img)))

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('已生成', OUT)
    print('单文件 %d 张图 / 图片合计 %.1f MB / HTML %.1f MB'
          % (n_img, total / 1048576, len(html.encode()) / 1048576))


if __name__ == '__main__':
    main()
