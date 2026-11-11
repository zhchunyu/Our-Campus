"""生成 R0~R7 成图验收总览页（含统一前后对比）。

用法：
    python make_overview_html.py
输出：
    02-三维资产/renders/总览_R0-R6.html

依赖 check_palette.py 的 stats() 计算下 55% 区域的暖/冷/暗占比。

★ 三栏 / 两栏 / 单栏的判据是"**这个阶段有没有可对照的上一版**"：
    · 在 CLEAR 里 → 三栏（旧光照 → 统一后·上一版 → 统一后·现版）
    · 有旧光照存档 → 两栏
    · 既不在 CLEAR 又无旧光照存档（= 统一光照之后**新增**的阶段，如 R6）
      → **单栏**。硬凑两栏会写出一条 404 的 <img src>。
"""
import importlib.util
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
NEW = os.path.join(WORK, '02-三维资产', 'renders')
OLD = os.path.join(WORK, '08-交付与归档', 'renders_20260921_旧光照全量')
# 旧语言清障：R0 清了"牌坊群 / 阙 / 石狮 / 明堂 / 案山亭 / 钟楼"；
# R1/R2 清了"钟楼"（它的拆除原先只写在 r3 里，导致 R1/R2 成图一直带着它）。
# 这些阶段因此需要三栏对照：旧光照 → 统一后·旧语境 → 统一后·清障
# 值 = (归档目录, ②栏标签, ③栏标签)。这些阶段在"统一光照"之后又各改过一轮，
# 所以需要三栏：旧光照 → 统一后·上一版 → 统一后·现版
CLEAR = {
    'R0': ('renders_20260921_R0_旧语境版',   '旧语境',   '清障'),
    'R1': ('renders_20260921_R1R2_含钟楼版', '含钟楼',   '清障'),
    'R2': ('renders_20260921_R1R2_含钟楼版', '含钟楼',   '清障'),
    # R4/R5 的三栏是另一个轴：桥下纵梁 1.55 → 1.05（消掉 2.10 m 近黑带）
    'R4': ('renders_20260921_R4R5_纵梁厚版', '纵梁厚版', '纵梁薄版'),
    'R5': ('renders_20260921_R4R5_纵梁厚版', '纵梁厚版', '纵梁薄版'),
}
ARCH = '08-交付与归档'
CFG = os.path.join(WORK, '02-三维资产', 'blender', 'configs')
OUT = os.path.join(NEW, '总览_R0-R6.html')

spec = importlib.util.spec_from_file_location('cp', os.path.join(HERE, 'check_palette.py'))
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)

STAGES = [
    ('R0', '垂直书院', '语言样板 · 塔楼'),
    ('R1', '山门 + 下沉智谷', '校园入口 · 中轴起点'),
    ('R2', '图书馆 + 漂浮讲堂', '中轴尽端核心'),
    ('R3', '人文区', '书院 / 大礼堂 / 美术馆'),
    ('R4', '智慧环廊', '1.2 km 空中廊道 · AI 物理载体'),
    ('R5', '五区总体', '教学 / 生活 / 科技 / 实验 / 运动医疗'),
    ('R6', '滨水基座', '2.62 km 连续可上人挑台 · 以水为径'),
    # ★ R7（2026-09-26 S5 追加）：**不是第 8 个设计阶段**，而是"规划调整 V3"的整合轮 ——
    #   把"能走进去、能上下楼、有园子"三件事一次补齐后的**全园定版**。
    #   它没有旧光照存档、也不在 CLEAR 里 ⇒ 自动走**单栏**分支（与 R6 同一条路径）。
    ('R7', '全园整合', '规划调整 V3 · 分区景观 + 环廊垂直交通 + 入口门廊'),
]
REP = {'R0': 'R0_垂直书院_透视.png', 'R1': 'R1_山门_透视.png', 'R2': 'R2_图书馆_中轴.png',
       'R3': 'R3_人文区_中轴.png', 'R4': 'R4_环廊_鸟瞰.png', 'R5': 'R5_五区_鸟瞰.png',
       'R6': 'R6_滨水_鸟瞰.png', 'R7': 'R7_全园_顶视.png'}

L = json.load(open(os.path.join(CFG, 'lighting.json'), encoding='utf-8'))
# ★★ 材质色板的**真源**是 `_dump_palette.py` 从 .blend 里导出的 `renders/材质色板.json`。
#   下面这份硬编码只是**兜底**（JSON 不存在时用），而且会打印警告。
#   起因（2026-09-26 S4-d）：这份表是手写的，配色真源却是 `palette_retune.py` ——
#   改一次旧一次、**不报错**：总览页上的"草地色 / 屋面色"和成图里根本不是一回事。
#   ⇒ 色板一律从材质插槽的实际取值算出来（连线取 ColorRamp 端点均值）。
PAL_FALLBACK = [('清水混凝土', '#5E574C'), ('混凝土楼板', '#32302C'), ('墨灰钢构', '#15161A'),
                ('超白玻璃', '#1F262A'), ('竹木格栅', '#744722'), ('胶合木', '#5F3819'),
                ('铜饰', '#854C1F'), ('钛锌屋面板', '#20201D'), ('中轴铺装', '#473B2E'),
                ('草地', '#1D2C11'), ('水面', '#131F24')]

PAL_JSON = os.path.join(NEW, '材质色板.json')
PAL = PAL_FALLBACK
if os.path.exists(PAL_JSON):
    try:
        PAL = [tuple(x) for x in json.load(open(PAL_JSON, encoding='utf-8'))['pal']]
        print('[总览] 材质色板取自 %s（%d 块）' % (os.path.basename(PAL_JSON), len(PAL)))
    except Exception as _e:
        print('!! 材质色板.json 读取失败（退回硬编码）：%s' % _e)
else:
    print('!! 未找到 %s —— 色板退回硬编码，**可能与成图不一致**；'
          '请先跑 _dump_palette.py' % PAL_JSON)

files = sorted(f for f in os.listdir(NEW) if f.endswith('.png') and f[:2] in
               ('R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'))
data = {}
for f in files:
    s = cp.stats(os.path.join(NEW, f), y0=0.45, y1=1.0)
    o = None
    po = os.path.join(OLD, f)
    if os.path.exists(po):
        try:
            o = cp.stats(po, y0=0.45, y1=1.0)
        except Exception:
            o = None
    data[f] = (s, o)

by_stage = {k: [f for f in files if f.startswith(k + '_')] for k, _, _ in STAGES}


def badge(s):
    return ('<span class="b">暖 %.1f%%</span><span class="b">冷 %.1f%%</span>'
            '<span class="b">暗 %.1f%%</span>') % (s['warm'], s['cool'], s['dark'])


def delta(o, n):
    if not o:
        return ''
    dc = n['cool'] - o['cool']
    cls = 'up' if dc > 2 else ('down' if dc < -2 else 'flat')
    return '<span class="d %s">冷 %+.1f</span>' % (cls, dc)


# ---- 前后对比 ----
cmp_rows = []
for k, name, sub in STAGES:
    f = REP[k]
    n, o = data[f]
    if k in CLEAR:
        # 三栏：旧光照 → 统一后·上一版 → 统一后·现版
        sub, _l2, _l3 = CLEAR[k]
        b = cp.stats(os.path.join(WORK, ARCH, sub, f), y0=0.45, y1=1.0)
        figs = """
          <figure><img src="../../08-交付与归档/renders_20260921_旧光照全量/%s"><figcaption>① 旧光照 %s</figcaption></figure>
          <figure><img src="../../08-交付与归档/%s/%s"><figcaption>② 统一光照 · %s %s</figcaption></figure>
          <figure class="new"><img src="./%s"><figcaption>③ 统一光照 · %s %s</figcaption></figure>""" % (
            f, badge(o) if o else '', sub, f, _l2, badge(b), f, _l3, badge(n))
        cls = 'cmp-p three'
    elif o is None:
        # 统一光照之后**新增**的阶段（R6）—— 没有旧光照可对照。
        # 硬凑两栏会写出一条 404 的 <img src>，所以走单栏。
        figs = """
          <figure class="new"><img src="./%s"><figcaption>统一光照 · 本阶段新增，无旧光照对照 %s</figcaption></figure>""" % (
            f, badge(n))
        cls = 'cmp-p one'
    else:
        figs = """
          <figure><img src="../../08-交付与归档/renders_20260921_旧光照全量/%s"><figcaption>旧光照 %s</figcaption></figure>
          <figure class="new"><img src="./%s"><figcaption>统一后 %s</figcaption></figure>""" % (
            f, badge(o) if o else '', f, badge(n))
        cls = 'cmp-p'
    cmp_rows.append("""
      <div class="cmp">
        <div class="cmp-h"><b>%s</b> %s <span class="dim">%s</span></div>
        <div class="%s">%s
        </div>
      </div>""" % (k, name, sub, cls, figs))

# ---- 分组网格 ----
grid = []
for k, name, sub in STAGES:
    fs = by_stage[k]
    ss = [data[f][0] for f in fs]
    avg = ('暖 %.1f ／ 冷 %.1f ／ 暗 %.1f' %
           (st.mean(x['warm'] for x in ss), st.mean(x['cool'] for x in ss),
            st.mean(x['dark'] for x in ss)))
    cards = []
    for f in fs:
        n, o = data[f]
        cards.append("""
        <figure class="card">
          <img loading="lazy" src="./%s">
          <figcaption><span class="fn">%s</span>%s%s</figcaption>
        </figure>""" % (f, f[:-4], badge(n), delta(o, n)))
    grid.append("""
      <section>
        <h3><b>%s</b> %s <span class="dim">%s</span>
          <span class="avg">%d 张 ｜ 均值 %s</span></h3>
        <div class="grid">%s</div>
      </section>""" % (k, name, sub, len(fs), avg, ''.join(cards)))

sw = ''.join('<div class="sw"><i style="background:%s"></i>%s</div>' % (c, n) for n, c in PAL)
lrow = ''.join('<div class="lr"><span>%s</span><b>%s</b></div>' % (k, v) for k, v in L.items())

html = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>山河大学 · R0~R7 成图总览</title>
<style>
:root{--ink:#2B2E33;--paper:#E8E6E0;--wood:#C9A87C;--cu:#B07B45;
      --line:rgba(43,46,51,.14);--mut:#6C7076;}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font:14px/1.6 "PingFang SC","Microsoft YaHei","Source Han Sans SC",sans-serif;}
.wrap{max-width:1500px;margin:0 auto;padding:48px 40px 80px}
header{border-bottom:2px solid var(--ink);padding-bottom:22px;margin-bottom:34px}
h1{margin:0 0 8px;font-size:30px;letter-spacing:.04em;font-weight:700}
h1 em{font-style:normal;color:var(--cu)}
.lead{color:var(--mut);font-size:13.5px}
h2{font-size:17px;margin:46px 0 16px;padding-left:11px;border-left:4px solid var(--cu);letter-spacing:.03em}
h3{font-size:14.5px;margin:0 0 14px;font-weight:500;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
   border-bottom:1px solid var(--line);padding-bottom:9px}
h3 b{font-size:17px;color:var(--cu);font-weight:700;letter-spacing:.06em}
.dim{color:var(--mut);font-size:12.5px}
.avg{margin-left:auto;font-size:12px;color:var(--mut);font-family:ui-monospace,Consolas,monospace}
.panel{display:grid;grid-template-columns:1.25fr 1fr;gap:16px}
.box{background:#F4F3F0;border:1px solid var(--line);border-radius:3px;padding:18px 20px}
.box h4{margin:0 0 12px;font-size:12.5px;letter-spacing:.14em;color:var(--mut);font-weight:600}
.lr{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;
    font-family:ui-monospace,Consolas,monospace;border-bottom:1px dotted var(--line)}
.lr:last-child{border:0}
.lr span{color:var(--mut)}
.sw{display:flex;align-items:center;gap:9px;font-size:12.5px;padding:4px 0}
.sw i{width:22px;height:14px;border-radius:2px;border:1px solid rgba(0,0,0,.22);flex:none}
.cmp{margin-bottom:26px}
.cmp-h{font-size:14px;margin-bottom:9px}
.cmp-h b{color:var(--cu);letter-spacing:.06em;font-size:16px;margin-right:6px}
.cmp-p{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp-p.three{grid-template-columns:repeat(3,1fr)}
.cmp-p.one{grid-template-columns:minmax(0,760px)}
.cmp-p figure{margin:0}
.cmp-p img{width:100%;display:block;border:1px solid var(--line);border-radius:3px}
.cmp-p figure.new img{outline:2px solid var(--cu);outline-offset:-1px}
figcaption{margin-top:6px;font-size:11.5px;color:var(--mut);
  font-family:ui-monospace,Consolas,monospace}
.b{display:inline-block;background:rgba(43,46,51,.07);border-radius:2px;
   padding:0 5px;margin-right:4px;font-size:11px;color:#4A4E54}
.d{font-size:11px;margin-right:4px;font-family:ui-monospace,Consolas,monospace}
.d.up{color:#1F6B45}.d.down{color:#8C4A1E}.d.flat{color:var(--mut)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{margin:0}
.card img{width:100%;display:block;border:1px solid var(--line);border-radius:3px;background:#fff}
.card figcaption{margin-top:7px;line-height:1.9}
.fn{display:block;font-size:12px;color:var(--ink);margin-bottom:2px}
section{margin-bottom:40px}
footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);
  font-size:12px;color:var(--mut);line-height:1.9}
@media(max-width:1100px){.grid{grid-template-columns:repeat(2,1fr)}.panel{grid-template-columns:1fr}.cmp-p.three{grid-template-columns:1fr 1fr}}
@media(max-width:720px){.grid,.cmp-p,.cmp-p.three{grid-template-columns:1fr}.wrap{padding:28px 18px 60px}}
.note{font-size:12.5px;color:var(--mut);margin:-6px 0 20px;padding:10px 14px;
  background:rgba(176,123,69,.07);border-left:3px solid var(--cu);border-radius:2px;line-height:1.85}
</style></head><body><div class="wrap">
<header>
  <h1>山河大学 · <em>R0~R7</em> 成图总览</h1>
  <div class="lead">全园统一光照与配色验收 ｜ __N__ 张 / Cycles 110 spp ｜
    指标统计区间为画面下 55%（建筑与地面主体）</div>
</header>

<h2>统一基线</h2>
<div class="panel">
  <div class="box"><h4>LIGHTING.JSON</h4>__LROW__</div>
  <div class="box"><h4>PALETTE_RETUNE V2.6 · 基色（sRGB 近似）</h4>__SW__</div>
</div>

<h2>统一前后对照</h2>
<p class="note"><b>R0 / R1 / R2 / R4 / R5 五行是三栏，R6 / R7 是单栏</b> —— 这些阶段在"统一光照"之后又各改过一轮。
  三栏统一读作：<b>① 旧光照 → ② 统一后·上一版 → ③ 统一后·现版</b>。<br>
  <b>一、旧语言清障（R0 / R1 / R2）</b><br>
  · <b>R0</b>（`clear_old_language_r0.py`，20 个构件）：牌坊群 / 东西阙 / 石狮 /
    明堂地雕·灯柱·灯亭 / 案山方亭 / 钟楼。R0 是"语言样板"，成图里必须看得清新塔本身；
    未清障时 <code>正立面</code> 的塔身下半被钟楼整个遮住。<br>
  · <b>R1 / R2</b>（`build_campus_r1.py` 的 `_DROP` 增补）：<b>钟楼</b>。
    它的拆除原先只写在 r3 里，于是 R1 / R2 成图一直带着它 ——
    <code>R2_图书馆_中轴</code> 里那座孤零零的旧钟楼就坐在新图书馆前庭广场上
    （`diag_grid.py` 实测中心行左端命中 <code>BLD_人文_Bell_Tower_屋面</code>）。<br>
  <b>清障边界</b>：只删 V2 已定<b>"拆除 / 取消"</b>的构件；图书馆、大礼堂、美术馆、书院属于
  <b>"改造"</b>（原地重建为新语言），保留旧版作为"改造前"语境。<br>
  <b>二、桥下深色带（R4 / R5）</b><br>
  环廊纵梁截面 <code>_BEAM_D</code> <b>1.55 → 1.05</b>。原截面下"桥面板底 0.55 + 纵梁 1.55"
  在侧视角合成一条 <b>2.10 m 高的实心近黑带</b>（纵梁 <code>M_墨灰钢构</code> 反照率 0.082，
  全园最深一档），读作"一块黑板"而不是结构。5 变体 A/B 实测：<b>改材质只是把"黑块"换成"白块"</b>，
  带高不变、仍是一整块；压截面后带高 1.60 m，梁与板的关系才读得出来，且保留 V2 的材料分工
  （钢构 = 结构，清水混凝土 = 围护）。详见 <code>99-临时工作区/AB_桥下深色带/对照.html</code>。<br>
  ② 一栏一律保留改动前的版本，方便对照。<br>
  <b>三、R6 滨水基座（单栏）</b><br>
  <b>R6 是"统一光照之后新增"的阶段，没有旧光照存档可对照</b>，因此只有一栏
  （硬凑两栏会写出一条 404 的 <code>&lt;img src&gt;</code>）。它把原先
  <code>Z_TOP 3.0 → Z_BANK −3.4</code> 的 16 m 自然草坡（21.8°，不可上人）
  改成一条 <b>2618.7 m 连续挑台</b>：台面 Z 2.40、板厚 1.00、内缘落在地面上（不留缝）、
  常态外挑出水 3.0 m，四处节点按弧长分数放大到 13~16 m 宽。<br>
  <b>四、配色重标 V2.4（全园 63 张，②→③ 的差异里也含这一项）</b><br>
  <code>palette_retune.py</code> 此前对 <b>53 个材质里的 32 个静默失效</b>：
  <code>make_mat(noise_scale&gt;0)</code> 会把 <code>Noise→ColorRamp</code> 挂在
  <code>Base Color</code> 上，而重标只写 <code>default_value</code> —— <b>连线优先，写入被忽略</b>，
  且异常被吞 ⇒ 不报错、无效果。中招的恰是<b>占画面最大面积</b>的那批：
  <code>M_清水混凝土</code> / <code>M_混凝土楼板</code> / <code>M_桥面</code> /
  <code>M_广场铺装</code> / <code>M_区_*</code>（偏差最大 <code>M_桥面</code> 0.393→0.258）。
  V2.4 改为<b>改连线源头</b>（ColorRamp 端点色，只动前 3 通道并整体平移以保住噪声质感）。
  全量重渲后实测（63 张，下半图）：
  <b>暖% 均值 10.75 → 14.36、冷% 均值 45.84 → 42.01、「冷−暖」+35.08 → +27.65</b>，
  <b>63/63 张全部变暖</b>；而 <b>Δ亮度均值仅 −0.49</b>（整体明度几乎不变，说明动的是冷暖比不是明暗）。<br>
  ⚠ <b>② 栏是在 V2.4 之前渲染的</b>（那些中间几何状态已不可复现 —— 清障逻辑写在
  <code>STAGE_EXTRA</code> 里，旧态没有 config），所以 <b>②→③ 的差异同时包含几何改动与配色重标两项</b>，
  不宜当作单一变量的对照。<br>
  <b>五、占位体块压暗（V2.4 补丁）</b><br>
  主动视觉巡检（把 63 张做成接触表一次看全）发现 <code>R4_环廊_鸟瞰</code> /
  <code>R3_书院_鸟瞰</code> 里散着二十来个<b>纯白盒子</b>。根因：场地脚本建的 28 栋
  <b>分区占位体块</b>（<code>M_体块_*</code>，六分区分色）基色是 <code>0.51~0.65</code>，
  <b>比清水混凝土（0.368）还亮近一倍</b>，而 <code>_RETUNE</code> 表里<b>从来没有它们</b>
  ⇒ 在 <code>sun_strength 5.8 + exposure +0.20</code> 下直接曝成纯白，整张图读起来像"白模"。<br>
  修法：六个体块材质一并压到 <b>0.254~0.324</b>（约原值 ×0.5），<b>保留原来的冷暖色相差异</b>
  （人文/教学/生活偏暖，科技/运动偏冷，实验中性）。判据：<b>占位体块应当"比清水混凝土略暗"</b> ——
  它们是"既有 / 待改"的体量，不是新建筑；比真建筑亮就是"白模"，比它暗太多又会变成一排黑块。<br>
  A/B 实测（5 个代表机位）：平均差 0.98~4.01 / <b>受影响像素仅 1.6%~7.0%</b> /
  最大差 65~67 / Δ亮度 −1.0~−4.0 ⇒ 是<b>局部变化</b>，不是全图偏移，与"只有盒子变暗"完全吻合。</p>
__CMP__

<h2>规划调整 V3（S1~S5）</h2>
<p class="lead">
  这一轮不是"再改配色"，而是按用户评审意见把<b>规划层面的三件事</b>补齐：
  建筑之间要有路、环廊要能上下楼、整体要能对外展示。施工记录（含与方案的每一处偏差）
  见 <code>02-三维资产/规划调整方案V3.md §7</code>。
</p>
<p class="lead">
  <b>S1 间距 / 扩地</b> —— 生活区半岛岸线太窄、扩不出地，改为<b>缩楼体平面</b>（高度一律不动，
  全园五级标高是上一轮成果）。<br>
  <b>S2 路网重构</b> —— 36 轮迭代：补断头路、主路南段改走两排宿舍之间的<b>林荫街</b>、
  滨水步道颈部改<b>开敞弧</b>；判据是 <code>_diag_plan.py</code> 的<b>路网穿楼相交面积 = 0</b>。<br>
  <b>S3 环廊垂直交通</b> —— <b>15 处</b>：开敞双跑楼梯 11（<b>顺桥向</b>）+ 1:12 坡道 2 + 电梯塔 2；
  最大间距 121 m；侵入建筑 <b>0.00 m²</b>、树木侵入 0/15。<br>
  <b>S4 立面 / 景观 / 屋面</b> —— ① 横条纹 → <b>实墙 + 竖向格构 + 竖长窗</b>
  （一阶差分 gy/gx：教学 2.77→0.56、生活 2.64→0.82、科技 1.62→0.61，<b>方向翻转可证</b>）；
  ② 分区景观用 <b>占用栅格 + 最大矩形抠图</b>落草坪 / 树阵 / 水景 / 缓丘，
  硬质占分区地面 <b>100% → 43.3%</b>、绿地占陆地 <b>31.9% → 41.8%</b>；
  ③ 屋面按分区着色 <b>暖灰 / 铜绿</b> —— 顺带修掉一个藏了很久的静默失效：
  真正的第五立面是 <code>M_钛锌板</code>（<b>32 个对象</b>），而旧的 <code>_RETUNE</code> 表
  只写了 <code>M_钛锌屋面板</code>（<b>1 个对象</b>）⇒ <b>整批屋面从未被重标过</b>。<br>
  <b>S5 全量重渲 + 重导 GLB</b> —— 全园 <b>71 张</b>成图重渲（含 8 张 R7 整合图），
  GLB 重导为 <code>山河大学_全园_R7.glb</code>。
</p>
<p class="lead">
  <b>入口门廊（全阶段生效）</b> —— 全园 30 栋楼原先<b>一处入口都没有</b>，
  光秃体量 + 一圈通高玻璃带读起来是"未完工的盒子"。现在 <b>23 栋</b>补上门廊
  （柱 + 雨篷 + 玻璃门 + 铜门框 + 入口平台 + 踏步），<b>全部由射线实测定位</b>：
  哪一面有路（外探 5/8/11/14 m 向下打射线）、墙到底在哪（面外 40 m 处门半高向内打水平射线）、
  门廊落在多高的地面上（墙面处向下打射线）—— 一个数都不写死。
  ★ 本项原先只挂在 R5，导致 <b>R0~R4 的楼没有门廊、R5/R6 有</b>（同一栋楼在两个阶段长得不一样）
  ⇒ 已提到<b>所有阶段</b>；代价是暴露了两处<b>跨脚本隐式依赖</b>（<code>put</code> /
  同名不同义的 <code>flush</code> 只在 <code>build_campus_r5.py</code> 里定义），已就地补齐。
</p>

<h2>分阶段成图</h2>
__GRID__

<footer>
  <b>配色度量口径</b>：暖 = 像素 HSV 色相落在 20°~70° 且饱和度 &gt; 0.12 的占比；
  冷 = 色相 160°~280° 占比；暗 = 明度 &lt; 0.12 的占比。三者互斥，同一像素只计入一类。<br>
  <b>可复现性</b>：同配置跨进程连跑 3 次，暖/冷/暗统计完全一致（12.07 / 25.11 / 2.67），
  渲染为确定性过程；归档版差异全部来自光照统一本身，与随机性无关。<br>
  <b>归档</b>：非正式图 83 张 → <code>08-交付与归档/renders_20260920_非正式图归档/</code>；
  旧光照全量 129 张 → <code>08-交付与归档/renders_20260921_旧光照全量/</code>；
  R0 清障前 6 张 → <code>renders_20260921_R0_旧语境版/</code>；
  R1+R2 清障前 16 张 → <code>renders_20260921_R1R2_含钟楼版/</code>；
  R4+R5 纵梁改前 23 张 → <code>renders_20260921_R4R5_纵梁厚版/</code>；
  配色 V2.4 生效前 63 张 → <code>renders_20260921_配色V2.4生效前_63张/</code>
  （即本页③栏的"前"状态，用于量化配色重标本身的影响）；
  体块白模版 63 张 → <code>renders_20260921_体块白模版_63张/</code>
  （即"V2.4 已生效、但占位体块尚未压暗"的状态）。<br>
  <b>遮挡体检</b>：<code>scripts/diag_grid.py</code> 对全部机位各打 5×3 网格射线，
  核对"画面中心是否真是该图的主体"。本轮据此发现并修掉了 R2 的钟楼残留。
</footer>
</div></body></html>
"""
html = (html.replace('__LROW__', lrow).replace('__SW__', sw)
            .replace('__CMP__', ''.join(cmp_rows)).replace('__GRID__', ''.join(grid))
            .replace('__N__', str(len(files))))

open(OUT, 'w', encoding='utf-8').write(html)
print('已生成', OUT)
print('收录 %d 张，分 %d 阶段' % (len(files), len(STAGES)))
