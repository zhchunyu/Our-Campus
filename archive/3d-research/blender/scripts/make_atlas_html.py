# -*- coding: utf-8 -*-
"""make_atlas_html.py —— 生成「三维建模图集」（交付层面：供方案书 / 答辩 PPT 取图）。

与 `make_overview_html.py` 的分工：
  · `总览_R0-R6.html` = **对照页**，面向"每一版改了什么"，含 A/B 量化（内部评审用）
  · 本图集 = **陈列页**，面向"设计是什么、几何上怎么做成的"，按阶段讲一条叙事线（对外用）

输出：`02-三维资产/建模图集/山河大学_三维建模图集.html`
  —— 单文件、引用 `../renders/*.png` 相对路径、**A4 横向打印样式**（可直接"打印成 PDF"）。

用法：python make_atlas_html.py
"""
import os
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(ASSET, '建模图集')
OUT = os.path.join(OUT_DIR, '山河大学_三维建模图集.html')


def href(name):
    """把图片文件名转成**百分号编码**的相对 URL。

    ★ 为什么必须编码：本项目从工作区目录到图片文件名**全是中文**
      （`…/02-三维资产/建模图集/` + `R0_垂直书院_透视.png`）。
      把非 ASCII 字符直接写进 `src` 时，能否解析**取决于谁在提供服务**：
      浏览器直接开 `file://` 通常没事，但静态服务器 / 手机浏览器 / 聊天软件内置浏览器
      常常 404 —— 表现为"图片全部不显示"，且页面本身不报错。
      编码后所有环境都一致。
    """
    return '../renders/' + urllib.parse.quote(name)


# ---------------------------------------------------------------- 阶段叙事
# 每阶段：标题 / 副题 / 几何要点（列表）/ 代表图（文件名，相对 ../renders/）
STAGES = [
    dict(
        key='R0', title='R0 · 垂直书院', sub='语言样板（gate）—— 先立一套可复用的形式语言',
        notes=[
            '基座 42 × 42 × 11.25 m，塔身 9 层 × 7.40 m，<b>总高 93.00 m</b>（塔 / 楼 = 2.04）。',
            '<b>全楼取消檐口</b> —— 传统形制转译为当代体量时，檐口是最容易把建筑拉回"仿古"的构件。',
            '斗拱转译落在<b>楼板边带</b>（斜向编织格构），不做立面外挂 —— 让结构逻辑可读，而非贴一层装饰。',
            '错位堆叠要求<b>每层自成完整的盒</b>：有楼板、有边带、有玻璃幕，而不是互相穿插的体块。',
        ],
        imgs=['R0_垂直书院_透视.png', 'R0_垂直书院_中轴.png',
              'R0_垂直书院_空中庭院.png', 'R0_垂直书院_塔冠.png'],
    ),
    dict(
        key='R1', title='R1 · 山门 + 下沉智谷', sub='校园的"门"与"谷"—— 一处仪式，一处聚落',
        notes=[
            '山门：两片内倾 8 m 崖体，夹一跨 <b>116 m 变截面拱</b>；<b>下弦必须起拱</b>，'
            '下弦形态决定整座拱读作"桥"还是"洞"。',
            '下沉智谷：Y 95 → 188 × X ±21 × 深 8 m，谷底 Z −5.0；上壁为<b>真透明玻璃幕</b>，'
            '让谷内活动成为中轴上的景观。',
            '镜面不锈钢仅用于<b>山门</b>与后文的<b>漂浮讲堂</b> —— 镜面只在细杆件掠射角、'
            '人眼高度正对、竖向遮阳柱三种位置成立，大面镜墙在本项目中被判定为错误做法。',
        ],
        imgs=['R1_山门_透视.png', 'R1_智谷_鸟瞰.png', 'R1_中轴_全景.png'],
    ),
    dict(
        key='R2', title='R2 · 图书馆改造 + 漂浮讲堂', sub='旧建筑的延续，与新建筑的悬浮',
        notes=[
            '图书馆：三层台地 + <b>檐口 0</b> + 楼板边带（0.90 m 板边 + 1.25 m 编织格构带）；'
            '屋顶为<b>变曲率连续薄壳</b>（9 环 / 起拱 7.2），<b>壳平面严格等于顶层轮廓</b>。',
            '漂浮讲堂：楼板 64 × 44 @ Z 6.00（底面 0.10 m 镜面底板）+ 8.5 m 玻璃幕，'
            '薄壳外挑 3.0 m，<b>悬于水面 20.5 m</b>。',
            '"盒子扣壳"式的曲面屋顶一定会被读成机库 —— 缺的不是曲面，是<b>檐</b>'
            '（出檐 3.0 + 檐椽 + 铜檐口线）。',
        ],
        imgs=['R2_图书馆_鸟瞰.png', 'R2_讲堂_水上低角.png', 'R2_讲堂_鸟瞰.png'],
    ),
    dict(
        key='R3', title='R3 · 人文区（6 栋）', sub='同一套语言，按建筑性格分家',
        notes=[
            '大礼堂：柱廊 pitch 5.40 m + 筒壳 92 × 54 / 起拱 14.0；美术馆：9 柱入口廊 + 两座四坡壳展亭。',
            '书院 A / B / C：回字形四翼 + 筒壳；<b>原方案钟楼取消</b>。',
            '壳体形式跟着平面长宽比走 —— 这条决定屋顶的"民族属性"，比选什么颜色重要得多。',
            '一个园区里不能有两种同类构件：立面语言按建筑性格分家，但构件做法必须统一收口。',
        ],
        imgs=['R3_大礼堂_东南.png', 'R3_美术馆_入口.png', 'R3_书院_鸟瞰.png'],
    ),
    dict(
        key='R4', title='R4 · 智慧环廊', sub='AI 系统的物理载体 —— 全长 1631.9 m 的连续环',
        notes=[
            '环廊沿 18 顶点折线布置，<b>弧长参数化</b> `ring_at(s)`；外法向按"背离形心"判定。',
            '桥面 12 × 0.55 m @ Z 9.00，桥墩每 48 m 一道；屋面为 BIPV（光伏建筑一体化）。',
            '沿线七个站点 S1~S7；<b>绕案山而不跨案山</b> —— 保护原有地形是选址原则。',
            '纵梁由 1.55 m 压到 1.05 m：原"板底 0.55 + 梁 1.55"合成 2.10 m 实心近黑带，'
            '被读作"一块黑板"。A/B 证明<b>改材质只是"黑块换白块"，压截面才解决问题</b>。',
        ],
        imgs=['R4_环廊_鸟瞰.png', 'R4_环廊_桥面.png',
              'R4_环廊_结构近景.png', 'R4_站点_S4.png'],
    ),
    dict(
        key='R5', title='R5 · 五区重建（22 栋）', sub='天际线分级，与环廊保持 12.30 m 净距',
        notes=[
            '22 栋按到环廊中心线 <b>≥ 12.30 m</b> 落位，确保环廊始终是"可读的连续体"。',
            '体量分层由 `layered()` 生成；起拱统一 ×1.35，与既有阶段保持同一比例感。',
            '<b>天际线五级</b>：82.6 / 52.2·53.7 / 42.9~44.6 / 21.4~35.6 / 10.0~18.4 m。',
            '体育场：草坪竞技场 141 × 81 m + 砖红跑道 + 三层看台（Z 7.60）+ 北侧脊线罩棚 10.6 m '
            '+ 四角照明塔 19.1 m。',
        ],
        imgs=['R5_五区_鸟瞰.png', 'R5_中轴_天际线.png',
              'R5_全园_东南鸟瞰.png', 'R5_运动医疗区.png'],
    ),
    dict(
        key='R6', title='R6 · 滨水基座', sub='把 16 m 不可上人的草坡，改成一整条可上人的岸线',
        notes=[
            '岸线 <b>2618.7 m 连续挑台</b>：内缘落在地面上（与地面齐、不留缝），'
            '常态外挑出水 3.0 m。',
            '台面 Z 2.40 / 板厚 1.00 / 矮墙顶 2.85；短柱 65 道 @ 40 m。',
            '四处节点按弧长分数 0.11 / 0.34 / 0.50 / 0.82 放大外缘至 14.5 / 14.5 / 17.5 / 16.5 m。',
            '台面竹木 + 结构清水混凝土，与 R4 桥面同语言 —— 全园只保留一套"临水构件"做法。',
        ],
        imgs=['R6_滨水_鸟瞰.png', 'R6_滨水_中轴埠头.png', 'R6_滨水_近景.png'],
    ),
    # ★ R7 是"规划调整 V3"的整合轮（S1~S5）—— 不是第 8 个设计阶段，
    #   而是把"能走进去、能上下楼、有园子"这三件事一次补齐后的**全园定版**。
    dict(
        key='R7', title='R7 · 全园整合（规划调整 V3）',
        sub='分区景观 + 环廊垂直交通 + 入口门廊 —— 从"体量集合"变成"可使用的校园"',
        notes=[
            '分区景观：以 <b>占用栅格 + 最大矩形抠图</b> 在既有铺装上落草坪 / 树阵 / 水景 / 缓丘，'
            '硬质占分区地面由 <b>100% 降到 43%</b>（六区 32~57%，全 ≤ 60%）；'
            '绿地占陆地 31.9% → <b>41.8%</b>。',
            '环廊垂直交通 <b>15 处</b>：开敞双跑楼梯 11（<b>顺桥向</b>）+ 1:12 坡道 2 + 电梯塔 2；'
            '最长间距 121 m，侵入建筑 <b>0.00 m²</b>。',
            '入口门廊补强 <b>23 栋</b>：柱 + 雨篷 + 玻璃门 + 铜门框 + 入口平台 + 踏步 ——'
            '全部由射线实测定位（选面 / 找墙 / 量地面），不写死一个数。',
            '立面语言：横条纹 → <b>实墙 + 竖向格构 + 竖长窗</b>（一阶差分 gy/gx 由 2.77 降到 0.56，'
            '方向翻转可证）；屋面按分区着色，<b>暖灰 / 铜绿</b>。',
        ],
        imgs=['R7_全园_顶视.png', 'R7_科技区_庭院.png',
              'R7_教学区_庭院.png', 'R7_生活区_林荫街.png',
              'R7_环廊_北端节点_垂直交通.png', 'R7_环廊_垂直交通_楼梯.png',
              'R7_环廊_垂直交通_坡道.png', 'R7_环廊_垂直交通_电梯.png'],
    ),
]

# ---------------------------------------------------------------- 指标
METRICS = [
    ('成图总量', '71 张', 'R0~R6 七个阶段 + 8 张 R7 整合图，1600 × 900（R0 正立面 1000 × 1600）'),
    ('渲染引擎', 'Cycles · Khronos PBR Neutral', 'sun 38° / strength 5.8 · 天空 0.66 · 雾密度 1.2e-5'),
    ('全园模型', '2,317,949 面', '393 对象 · 72 材质（导出前，r6 定版）'),
    ('GLB 交付', '5.70 MB', '1,535,187 面 · 54 材质 · Draco 压缩 · 剔除 Haze 与 7 个未引用材质'),
    ('配色合规度', '冷−暖 +11.61', '下半图均值；同一口径下 V3 前后 +16.01 → +11.61（全园更暖）'),
    ('过曝像素', '7.01%', '亮度 L &gt; 210 的占比（下半图均值）；V3 前 7.30%'),
    ('环廊垂直交通', '15 处', '开敞双跑楼梯 11（顺桥向）+ 1:12 坡道 2 + 电梯塔 2；最大间距 121 m'),
    ('可复现性', '逐像素级', '同配置跨进程连跑 3 次统计完全一致；渲染为确定性过程'),
]

HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>山河大学 · 三维建模图集</title>
<style>
  :root{
    --ink:#2B2E33; --paper:#F4F2EE; --card:#FFFFFF; --line:#D8D4CC;
    --sub:#6C6862; --wood:#C9A87C; --copper:#B07B45;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
       font:14px/1.75 "Microsoft YaHei","PingFang SC",-apple-system,sans-serif;}
  .page{width:1120px;margin:0 auto 28px;background:var(--card);
        border:1px solid var(--line);padding:46px 54px;position:relative;}
  .cover{min-height:620px;display:flex;flex-direction:column;justify-content:center;
         background:linear-gradient(135deg,#FBFAF8 0%,#EFEDE8 100%);}
  .cover h1{font-size:40px;margin:0 0 10px;letter-spacing:.06em;}
  .cover .sub{font-size:17px;color:var(--sub);letter-spacing:.18em;margin-bottom:30px;}
  .cover .concept{font-size:22px;letter-spacing:.22em;color:var(--copper);
                  border-left:3px solid var(--copper);padding-left:16px;margin-bottom:26px;}
  .cover .meta{font-size:13px;color:var(--sub);line-height:2.0;}
  .cover .rule{height:1px;background:var(--line);margin:26px 0;}
  h2{font-size:21px;margin:0 0 6px;padding-bottom:10px;border-bottom:2px solid var(--ink);}
  h2 .n{color:var(--copper);margin-right:10px;font-size:15px;vertical-align:2px;}
  h3{font-size:17px;margin:0 0 2px;}
  h3 .v{font-size:11px;color:var(--sub);font-weight:400;margin-left:10px;
        border:1px solid var(--line);border-radius:10px;padding:1px 8px;}
  .sub2{font-size:12.5px;color:var(--sub);margin:0 0 14px;}
  .lead{font-size:13.5px;color:var(--sub);margin:14px 0 22px;}
  ul.notes{margin:0 0 18px;padding-left:20px;}
  ul.notes li{margin:6px 0;font-size:13.5px;}
  code{font-family:Consolas,"Courier New",monospace;font-size:12.5px;
       background:#F0EEE9;border:1px solid var(--line);border-radius:3px;padding:1px 5px;}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
  .grid.g3{grid-template-columns:repeat(3,1fr);}
  figure{margin:0;border:1px solid var(--line);background:#000;}
  figure img{display:block;width:100%;height:auto;}
  figcaption{background:#fff;color:var(--sub);font-size:11.5px;padding:6px 9px;
             border-top:1px solid var(--line);}
  table{width:100%;border-collapse:collapse;margin:10px 0 22px;font-size:13px;}
  th,td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top;}
  th{background:#F0EEE9;font-weight:600;white-space:nowrap;}
  td.k{font-weight:600;white-space:nowrap;}
  td.v{color:var(--copper);font-weight:600;white-space:nowrap;}
  .swatch{display:flex;gap:0;margin:16px 0 6px;border:1px solid var(--line);}
  .swatch div{flex:1;height:62px;position:relative;}
  .swatch span{position:absolute;left:0;right:0;bottom:-20px;text-align:center;
               font-size:10.5px;color:var(--sub);}
  .swatch-wrap{margin-bottom:34px;}
  footer{font-size:11.5px;color:var(--sub);border-top:1px solid var(--line);
         padding-top:14px;margin-top:26px;line-height:1.9;}
  .tag{display:inline-block;border:1px solid var(--line);border-radius:3px;
       padding:1px 7px;font-size:11px;color:var(--sub);margin-right:6px;}
  /* 宽表格在小屏上允许横向滚动（三列表格在手机上必然溢出） */
  .tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0 22px;}
  .tw table{margin:0;min-width:520px;}

  /* ---------------- 窄屏（手机） ---------------- */
  @media (max-width:820px){
    body{font-size:15px;}
    .page{width:auto;margin:0 0 14px;padding:22px 16px;}
    .cover{min-height:auto;padding:34px 20px 40px;}
    .cover h1{font-size:26px;}
    .cover .sub{font-size:13.5px;letter-spacing:.1em;}
    .cover .concept{font-size:17px;letter-spacing:.14em;margin-bottom:20px;}
    h2{font-size:18px;}
    .grid,.grid.g3{grid-template-columns:1fr;gap:12px;}
    ul.notes li{font-size:14px;}
    .swatch div{height:44px;}
  }

  @media print{
    body{background:#fff;}
    @page{size:A4 landscape;margin:10mm;}
    .page{width:auto;margin:0;border:none;padding:0 0 8mm;break-after:page;}
    .page:last-child{break-after:auto;}
    h2{break-after:avoid;} figure{break-inside:avoid;}
  }
</style></head><body>

<!-- ============================ 封面 ============================ -->
<section class="page cover">
  <h1>山河大学 · 三维建模图集</h1>
  <div class="sub">校园场景程序化建模 / 实景渲染 / 轻量化交付</div>
  <div class="concept">藏山纳智 · 云廊书院</div>
  <div class="meta">
    以山为院 &nbsp;·&nbsp; 以水为径 &nbsp;·&nbsp; 以云为廊<br>
    七个设计阶段（R0~R6）+ 全园整合（R7）&nbsp;|&nbsp; 71 张实景渲染成图 &nbsp;|&nbsp; 全园轻量化 GLB 交付<br>
    Cycles 物理渲染 · 统一光照配方 · 全流程脚本化可复现
  </div>
  <div class="rule"></div>
  <div class="meta">
    本图集为<b>三维建模层面的成果陈列</b>，供技术方案书与答辩材料取图使用。<br>
    校园为完全虚构设定；全部图面不含任何题字（匾额留空白石板）。
  </div>
</section>

<!-- ============================ 一、概念 ============================ -->
<section class="page">
  <h2><span class="n">01</span>设计概念与空间结构</h2>
  <p class="lead">
    校园置于半岛地形之上，以中轴串联山门、广场、土丘、图书馆、塔与尽端平台；
    智慧环廊环绕案山形成一圈"云端走廊"，五个功能分区分布在环廊外侧。
    设计概念落在四个转译动作上 —— 每一步都要在几何上可执行，而不只是形容词。
  </p>
  <table>
    <tr><th>传统形制</th><th>当代转译</th><th>几何落点</th></tr>
    <tr><td>台基</td><td>首层架空 + 公共基座</td><td>基座体量与楼板边带（R0）</td></tr>
    <tr><td>斗拱</td><td>斜向编织格构</td><td>楼板边带 1.25 m 编织带，不做立面外挂（R0 / R2）</td></tr>
    <tr><td>坡屋顶</td><td>变曲率连续曲面</td><td>9 环薄壳，壳平面 = 顶层轮廓（R2 / R3）</td></tr>
    <tr><td>塔</td><td>空中庭院错位堆叠</td><td>每层自成完整的盒，逐层错位（R0）</td></tr>
  </table>

  <h3 style="margin-top:26px">五个空间锚点</h3>
  <p class="sub2">概念需要落成可指认的实体，否则无法进入几何阶段</p>
  <table>
    <tr><th>锚点</th><th>角色</th><th>阶段</th></tr>
    <tr><td class="k">山门</td><td>校园的仪式入口：两片崖体夹 116 m 变截面拱</td><td>R1</td></tr>
    <tr><td class="k">智慧环廊</td><td><b>AI 系统的物理载体</b> —— 全长 1631.9 m 的连续环，串起七个站点</td><td>R4</td></tr>
    <tr><td class="k">垂直书院</td><td>语言样板：93 m 塔 + 42 m 基座，全楼取消檐口</td><td>R0</td></tr>
    <tr><td class="k">下沉智谷</td><td>下沉聚落：深 8 m，上壁真透明玻璃幕</td><td>R1</td></tr>
    <tr><td class="k">漂浮讲堂</td><td>悬于水面 20.5 m 的薄壳体量，底面为镜面底板</td><td>R2</td></tr>
  </table>

  <h3 style="margin-top:26px">中轴节点（Y 坐标，单位 m）</h3>
  <table>
    <tr><th>山门</th><th>广场</th><th>土丘</th><th>图书馆</th><th>塔</th><th>尽端平台</th></tr>
    <tr><td>33.6</td><td>129.6</td><td>244.8</td><td>518.4</td><td>648.0</td><td>782.4</td></tr>
  </table>
  <p class="sub2">
    坐标系：<b>X 东 / Y 北 / Z 上</b>；水面 Z = 0.0，岸顶 Z = 3.0，水下岸底 Z = −3.4；
    场地范围 X ∈ [−816, 816]，Y ∈ [0, 1238]（单位 m，1 : 1 真实尺度）。
  </p>
</section>

<!-- ============================ 二、技术路线 ============================ -->
<section class="page">
  <h2><span class="n">02</span>建模技术路线</h2>
  <p class="lead">
    全园不是"一个模型文件"，而是<b>七个可独立重跑的阶段脚本串联</b>：
    每个阶段脚本只负责自己那一片区域，共享同一套场地骨架与构件工具库。
    这样任何一处修改都能定位到唯一一个脚本，且不会牵动其它区域。
  </p>

  <table>
    <tr><th>阶段</th><th>内容</th><th>关键参数</th></tr>
    __STAGE_TABLE__
  </table>

  <h3 style="margin-top:26px">管线</h3>
  <table>
    <tr><th>环节</th><th>做法</th><th>为什么</th></tr>
    <tr><td class="k">场地骨架</td><td>半岛地形 / 水面 / 路网 / 铺装 / 绿化 / 远山</td>
        <td>一次性建好，所有阶段复用；场地曲面统一"贴地"处理</td></tr>
    <tr><td class="k">阶段脚本</td><td>R0~R6 逐段叠加，共享 globals</td>
        <td>后面的阶段可直接复用前面定义的构件工具，不必抄常量</td></tr>
    <tr><td class="k">配色重标</td><td>独立模块，作为阶段链<b>最后一项</b>执行</td>
        <td>全园统一配色必须作用在"所有阶段都建完之后"，否则早期阶段仍是旧色</td></tr>
    <tr><td class="k">渲染</td><td>Cycles，按机位表批量出图</td>
        <td>机位表与光照配方都是数据（JSON），改机位不用改代码</td></tr>
    <tr><td class="k">导出</td><td>材质压平 → 网格抽稀 → GLB</td>
        <td>两件事都是破坏性的，故必须排在渲染与存盘之后</td></tr>
  </table>

  <h3 style="margin-top:26px">可复现性</h3>
  <p class="sub2">
    同一配置跨进程连跑三次，成图统计量完全一致 —— 渲染是<b>确定性过程</b>。
    因此任何一张图都可以由"配置 + 脚本版本"精确重放；每次改动前的成图都整目录归档，
    使"改了什么、影响了哪些图、影响了多少"都可被量化核对。
  </p>

  <div class="swatch-wrap" style="margin-top:34px">
    <h3>配色体系</h3>
    <p class="sub2">以"墨 / 素 / 木 / 铜"四色控制，铜色占比 &lt; 3%（仅用于檐口线等细部）</p>
    <div class="swatch">
      <div style="background:#2B2E33"><span>墨 #2B2E33</span></div>
      <div style="background:#E8E6E0"><span>素 #E8E6E0</span></div>
      <div style="background:#C9A87C"><span>木 #C9A87C</span></div>
      <div style="background:#B07B45"><span>铜 #B07B45</span></div>
    </div>
  </div>
  <p class="sub2" style="margin-top:26px">
    材料：清水混凝土 / 胶合木 + 钢节点 / 超白玻璃 + 竹木格栅 / 哑光钛锌板 /
    镜面不锈钢（<b>仅山门与漂浮讲堂</b>）。
  </p>
</section>

__STAGE_PAGES__

<!-- ============================ 四、指标 ============================ -->
<section class="page">
  <h2><span class="n">04</span>成果指标</h2>
  <p class="lead">下列数字均由脚本从实际产出物中统计得出，可随时重跑复核。</p>
  <table>
    <tr><th>指标</th><th>数值</th><th>口径</th></tr>
    __METRIC_ROWS__
  </table>

  <h3 style="margin-top:26px">质量保障</h3>
  <table>
    <tr><th>手段</th><th>作用</th></tr>
    <tr><td class="k">逐像素 A/B 对照</td>
        <td>任何改动在<b>全量重渲之前</b>先用 2~5 个代表机位量化，用数字决定值不值得重渲；
            最大差 &gt; 200 即判定为几何不一致而非配色偏移</td></tr>
    <tr><td class="k">配色合规度体检</td>
        <td>分上下半图统计冷暖像素比（天空天然是蓝的，必须分开统计），
            并监控"过曝像素占比"以捕捉白块</td></tr>
    <tr><td class="k">全量视觉巡检</td>
        <td>把全部成图拼成接触表一次看全，逐张核对 —— 本轮据此发现并修复了
            占位体块过曝成白块的系统性问题</td></tr>
    <tr><td class="k">遮挡射线体检</td>
        <td>对每个机位打 5 × 3 网格射线，核对"画面中心是否真是该图的主体"</td></tr>
    <tr><td class="k">全量归档</td>
        <td>每次会改变观感的改动，重渲前整目录归档；保留 7 个历史版本，改动可回退可量化</td></tr>
  </table>

  <h3 style="margin-top:26px">交付物</h3>
  <table>
    <tr><th>类别</th><th>内容</th><th>位置</th></tr>
    <tr><td class="k">成图</td><td>71 张 1600 × 900 实景渲染</td><td>02-三维资产/renders/</td></tr>
    <tr><td class="k">对照总览</td><td>分阶段改动前后对照与量化</td><td>renders/总览_R0-R6.html</td></tr>
    <tr><td class="k">轻量化模型</td><td>GLB，含 Draco 压缩</td><td>exports/山河大学_全园_R6.glb</td></tr>
    <tr><td class="k">模型说明</td><td>坐标尺度 / 导入方式 / 已知限制</td><td>exports/山河大学_全园GLB_交付说明.md</td></tr>
    <tr><td class="k">质量报告</td><td>巡检方法与缺陷修复记录</td><td>05-测试与质量/三维资产_成图质量巡检报告_R7.md</td></tr>
  </table>
</section>

<!-- ============================ 五、说明 ============================ -->
<section class="page">
  <h2><span class="n">05</span>说明</h2>
  <p class="lead">
    <span class="tag">完全虚构</span>
    校园为完全虚构设定，与任何现实院校无关；图面与模型中不含校名、Logo、指导教师信息。
  </p>
  <p class="lead">
    <span class="tag">无题字</span>
    全项目不出现任何题字，匾额一律为空白石板 —— 避免未经授权使用他人书法作品，
    也保持形式语言的克制。
  </p>
  <p class="lead">
    <span class="tag">真实尺度</span>
    模型按 1 : 1 真实尺度建立（1 单位 = 1 米）。总平面阶段以 1 SVG 像素 = 2.4 m 换算，
    便于与二维格局图互校。
  </p>
  <p class="lead">
    <span class="tag">脚本可复现</span>
    全部几何由脚本生成，无手工建模步骤；配色与光照配方以 JSON 保存。
    重新生成整本图集只需运行一次生成脚本。
  </p>

  <h3 style="margin-top:30px">图集构成</h3>
  <table>
    <tr><th>章节</th><th>内容</th></tr>
    <tr><td class="k">01 设计概念与空间结构</td><td>四个转译动作 / 五个空间锚点 / 中轴节点与坐标约定</td></tr>
    <tr><td class="k">02 建模技术路线</td><td>七阶段脚本结构 / 管线分工 / 可复现性 / 配色体系</td></tr>
    <tr><td class="k">03 分阶段成果</td><td>R0~R6 七个阶段 + R7 全园整合，共 __NIMG__ 张代表图与几何要点</td></tr>
    <tr><td class="k">04 成果指标</td><td>模型与成图统计 / 质量保障手段 / 交付物清单</td></tr>
    <tr><td class="k">05 说明</td><td>合规说明与图集构成</td></tr>
  </table>

  <footer>
    <b>取图说明</b>：本页引用的全部原图位于 <code>02-三维资产/renders/</code>，
    文件名即"阶段_对象_视角"。若需用于方案书或 PPT，建议从原图目录取用，
    以免经过网页缩放损失清晰度；打印本页亦可直接得到 A4 横向 PDF。
  </footer>
</section>

</body></html>
"""


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    def md(s):
        """把笔记里的 Markdown 反引号 ``x`` 转成 <code>x</code>。
        ★ 不转的话反引号会**当字面量直接显示在页面上**（写笔记时容易忘）。"""
        import re as _re
        return _re.sub(r'`([^`]+)`', r'<code>\1</code>', s)

    # 阶段一览表（第二章）
    stage_table = []
    for st in STAGES:
        key = st['title'].split(' · ')[1]
        body = '<br>'.join(md(n.replace('<b>', '').replace('</b>', ''))
                           for n in st['notes'][:2])
        stage_table.append('<tr><td class="k">%s</td><td>%s</td><td>%s</td></tr>'
                           % (st['key'], key, body))
    stage_table = '\n    '.join(stage_table)

    # 阶段陈列页（第三章）
    pages, n_img = [], 0
    for i, st in enumerate(STAGES):
        n = len(st['imgs'])
        n_img += n
        cls = 'g3' if n == 3 else ''
        figs = '\n      '.join(
            '<figure><img src="%s" alt="%s" loading="lazy">'
            '<figcaption>%s</figcaption></figure>'
            % (href(f), f[:-4], f[:-4]) for f in st['imgs'])
        notes = '\n      '.join('<li>%s</li>' % md(x) for x in st['notes'])
        pages.append("""<section class="page">
  <h2><span class="n">03.%d</span>%s</h2>
  <p class="sub2">%s</p>
  <ul class="notes">
      %s
  </ul>
  <div class="grid %s">
      %s
  </div>
</section>""" % (i + 1, st['title'], st['sub'], notes, cls, figs))

    metric_rows = '\n    '.join(
        '<tr><td class="k">%s</td><td class="v">%s</td><td>%s</td></tr>' % m for m in METRICS)

    html = (HTML.replace('__STAGE_TABLE__', stage_table)
                .replace('__STAGE_PAGES__', '\n\n'.join(pages))
                .replace('__METRIC_ROWS__', metric_rows)
                .replace('__NIMG__', str(n_img)))

    # 把每个表格包进 .tw（可横向滚动）—— 三列表格在手机屏上必然溢出，
    # 包一层之后窄屏能滑动查看，宽屏/打印不受影响。
    html = html.replace('<table>', '<div class="tw"><table>').replace('</table>', '</table></div>')

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('已生成', OUT)
    print('收录 %d 个阶段 / %d 张代表图 / %.1f KB' % (len(STAGES), n_img, len(html.encode()) / 1024))

    # 顺手校验引用是否都存在（断链会让"打印成 PDF"时静默缺图）
    miss = []
    for st in STAGES:
        for f in st['imgs']:
            if not os.path.exists(os.path.join(ASSET, 'renders', f)):
                miss.append(f)
    print('断链 %d 张%s' % (len(miss), ('：' + ' '.join(miss)) if miss else ''))


if __name__ == '__main__':
    main()
