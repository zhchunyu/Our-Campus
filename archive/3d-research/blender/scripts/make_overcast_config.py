# -*- coding: utf-8 -*-
"""
make_overcast_config.py —— 生成「阴天漫射」气氛变体的渲染配置
====================================================================
产出：`configs/overcast.json`

★ 为什么是**独立配置**而不是改主配方：
  项目现有 63 张成图共用一套光照（sun_elev 38 / azim 220 / strength 5.8 /
  sky 0.66 / Khronos PBR Neutral）。这套配方的价值是"A/B 可比 + 渲染确定性
  可复现" —— 改一个字，63 张全部作废。所以阴天气氛**另开一套配置**，
  主配方一个字节都不动。

阴天漫射的旋钮（对应"无直射光 / 超软阴影 / 阴影有细节 / 气氛偏灰"）：

  sun_strength  5.8 → 0.20    几乎关掉直射，只留极弱的方向性
                              （完全归零会失去形体感，画面发死）
  sun_angle     1.2 → 16.0    角度越大阴影半影越宽 —— 这是"超软阴影"的关键
  sky_strength  0.66 → 1.10   环境光**补光**主导 ⇒ 背光面/阴影区照样有细节
  sky_visible   0.72 → 0.20   看得见的天压暗
  cloud_strength      → 0.76  云层亮度
  cloud_cover         → (0.18, 0.42)  ★ 云量 —— 见下面 V2 修正
  cloud_scale         → 2.6
  air_density   1.0  → 1.0    ★ V2 修正：**不再拉高**
  dust_density  1.1  → 1.2    ★ V2 修正：**不再拉高**
  ambient_tint        → 冷中性（1.02 / 1.00 / 1.04），压掉暖调
  exposure      0.20 → −0.15

★★ 这组值是**扫参标定**出来的，不是拍脑袋（2026-09-24）：
  首版 sky 1.55 / exposure +0.55 → 平均亮度 217~233、**过曝 23~40%**、σ 掉到 29
  （又平又白，完全不是阴天）。跑了 8 + 16 + 3 组扫参，用直方图挑。

★★ 反直觉的一条：**去掉直射光之后反差会升高**（sun 0.0 → σ 74，sun 5.8 → σ 69.5）。
  因为没了太阳的补光，阴影**更黑**了，画面反而更硬。
  ⇒ 阴天的正确做法是"关直射 + **提高环境补光把暗部抬起来**"，不是单纯关太阳。

=====================================================================================
★★★ V2 修正（2026-09-24 晚）：上一版把天空渲成了**金褐色**，像沙尘暴
=====================================================================================
病根：V1 用 `air_density 3.4` + `dust_density 2.6` 去"把天压白"。
**这两个旋钮改的不是"亮度"，是"色相"**：
  · air_density 3.4 = 3.4 倍地球大气 ⇒ 地平线瑞利散射极强 ⇒ 天发红发黄
  · dust_density 2.6 = 大量沙尘 ⇒ 米氏散射 ⇒ 天发土黄
实测天空均值 **sRGB (219,218,189)** —— R≈G 明显大于 B，就是土黄。
整个画面蒙一层黄绿，水面把金黄色反上来，读起来像黄昏/沙尘暴，**不像阴天**。

★★ 为什么上一轮标定没发现：**只量了亮度 / 反差 / 过曝 / 死黑四个数，全是明暗指标，
   一个色相指标都没有**。明暗"对了"，颜色是错的，一路没人发现。
   ⇒ **教训：气氛标定必须带色相/白平衡指标。**
   工具已固化为 `scripts/_sky_stats.py`（取画面上部 30%、V>0.55 的像素统计 S/V）。

V2 的做法 —— **阴天的"白"要靠云盖，不靠大气**：
  · air_density 3.4 → **1.0**（回到地球正常，天回到中性蓝）
  · dust_density 2.6 → **1.2**（去掉沙尘）
  · 云量交给新旋钮 `cloud_cover`（`render_campus_site.py` 里云的 ColorRamp 位置）：
    原 (0.50, 0.60) 只有一半噪声算云 ⇒ 渲出来是"**少云**"；推到 (0.18, 0.42) 就是**整片云盖**。
    ★ 只调 `cloud_strength`（亮度）**改不了云量** —— 云盖面积由 ColorRamp 位置决定。

扫参过程（640×360 / 40 spp，山门近景 + 滨水近景）：

  组                             天空均值 RGB     S      V   |  山门 平均/σ/过曝
  S0 现状（air3.4 dust2.6）      (219,218,189)  0.159  0.868 | 170.3/48.0/0.00%   ← 土黄
  S1 只压大气                     (175,197,223)  0.220  0.874 | 140.4/48.3/0.38%   ← 变纯蓝了，太蓝
  S2 全云盖                       (194,201,214)  0.084  0.838 | 142.1/48.5/0.38%
  S3 厚云盖                       (175,183,195)  0.098  0.764 | 147.8/44.3/0.55%
  T7 全云盖+补光（**定案**）        (190,198,212)  0.104  0.831 | 171.5/42.6/0.50%

  T7 = S2 的底子 + `sky_strength 1.10`（环境补光）+ `cloud_strength 0.76` + `exposure −0.15`
  ⇒ 亮度回到与 V1 几乎一致（山门 171.5 vs 170.3，滨水 172.6 vs 172.1），
    而天空从"土黄 S=0.159"变成"中性偏冷 S=0.104"。
  ★ 代价：过曝从 0.00% 升到 0.50%（滨水 3.2%）—— 亮的是云本身，可接受。

用法：
    python make_overcast_config.py
    set BR_CFG_FILE=<ASCII 路径>/overcast.json
    blender.exe --background --factory-startup --python run_campus.py
"""

# =====================================================================================
# ★★★ V3 修正（2026-09-24 晚，接在 V2 之后）：V2 把天空修中性了，**画面却整体偏蓝**
# =====================================================================================
# 实测整幅 `R − B`：旧阴天 **+21**（土黄）→ V2 **−33**（冷蓝）。
# 对照：晴天配方只有 **−13**。⇒ V2 从一个极端跳到了另一个极端。
#
# 病根在 `render_campus_site.py` 的世界装配最后一步：
#
#     MixShader( LightPath.Is Camera Ray,  n_bg_env,  n_mix_cloud )
#                  ↑ 光线(照明)走这个    ↑ 相机(看得见)走这个
#
#   **环境光根本不经过云**：`n_bg_env = Nishita天空 × ambient_tint × sky_strength`。
#   所以 V2 把 `air_density` 从 3.4 压回 1.0（天从土黄变回蓝）之后，
#   **照明也跟着变成蓝的** —— 整个园区的暗部、铺装、立面全蒙一层冷蓝。
#
# 修法：用 `ambient_tint` 反补。这个旋钮的语义正是"**管照明的天，不管看得见的天**"
#   （它只挂在 `n_bg_env` 那条支路上），所以调它**不会把天空本身染暖**。
#   同时把 `cloud_horizon` 放宽到地平线以下，让云盖下探到低仰角 ——
#   原来的 (0.010, 0.105) 对应仰角 0.6°~6°，而立面机位普遍就在这个仰角上，
#   于是"云"全被渐显压掉，天看起来是一片平的淡紫灰。
#
# 扫参（640×360 / 40 spp）：
#
#   组  ambient_tint        horizon        sky_vis / cloud_str | 天空均值     S    | 山门 平均/σ/过曝 | 整幅 R−B
#   U1  (1.12,1.00,0.88)  (-0.02,0.06)      0.16 / 0.95       | (207,213,221) 0.064 | 177.3/47.6/0.81% | **−16**  ← 定案
#   U2  (1.18,1.00,0.82)  (-0.03,0.05)      0.12 / 1.10       | (214,218,224) 0.045 | 177.3/50.5/0.91% |  −8  （云过曝 7.0%）
#   U3  (1.08,1.00,0.92)  ( 0.00,0.08)      0.20 / 0.80       | (197,204,214) 0.077 | 176.2/43.9/0.72% | −22
#
#   ★ U2 的色偏最中性（−8），但 `cloud_strength 1.10` 让云本身（0.96×1.10 ≈ 1.06）
#     **越过 1.0 直接削顶**，滨水机位过曝 7.0%。取 U1：`cloud_strength 0.95`
#     把云压在 0.91，过曝回到 0.8%。
#   ★ 定案值下**阴天比晴天略冷**（−16 vs −13）—— 这是对的，阴天本来就偏冷。

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG_DIR = os.path.join(os.path.dirname(HERE), 'configs')

# ---- 阴天漫射光照配方 ----
OVERCAST = {
    'sun_elev': 38.0,
    'sun_azim': 220.0,
    'sun_strength': 0.20,
    'sun_angle': 16.0,
    'sky_strength': 1.10,
    'sky_visible': 0.16,
    'cloud_strength': 0.95,
    'cloud_scale': 2.6,
    'cloud_cover': (0.18, 0.42),    # ★ V2 新增旋钮：云量（不是亮度）
    'cloud_horizon': (-0.02, 0.06),  # ★ V3：云盖下探到地平线（原 0.010/0.105）
    'air_density': 1.0,             # ★ V2：不再拉高（拉高 = 天发红发黄）
    'dust_density': 1.2,            # ★ V2：不再拉高（拉高 = 天发土黄）
    'ambient_tint': (1.12, 1.00, 0.88),  # ★ V3：反补环境光的蓝（见文件头 V3）
    'exposure': -0.15,
    'view_transform': 'Khronos PBR Neutral',
    'view_look': 'None',
}

# ---- 景深 ----
DOF = {'dof': True, 'fstop': 4.0, 'blades': 7, 'focus_scale': 1.0}


def job(name, pos, tgt, lens, rx, ry, sp, dof=None):
    j = dict(OVERCAST)
    j.update({'name': name, 'cam_pos': pos, 'cam_tgt': tgt, 'lens': lens,
              'res_x': rx, 'res_y': ry, 'samples': sp})
    if dof:
        j.update(dof)
    return j


def load_cam(stage, jname):
    """从既有阶段配置里抄一个机位（保证与已出图完全一致，A/B 才成立）。"""
    d = json.load(open(os.path.join(CFG_DIR, '%s.json' % stage), encoding='utf-8'))
    for j in d['jobs']:
        if j['name'] == jname:
            return j['cam_pos'], j['cam_tgt'], j['lens']
    raise KeyError('%s / %s' % (stage, jname))


def main():
    base = json.load(open(os.path.join(CFG_DIR, 'r6.json'), encoding='utf-8'))
    jobs = []

    # 1) 教学区前庭人视（近景：看门廊 + 景深虚化）
    jobs.append(job('阴天_前庭人视_主楼北入口', [275, 392, 4.6], [295, 382, 8],
                    32, 1280, 720, 320, dict(DOF, fstop=3.2)))
    # 2) 智谷谷底（下沉空间，阴影层次最能体现"无直射光"）
    p, t, l = load_cam('r1', 'R1_智谷_谷底')
    jobs.append(job('阴天_智谷谷底', p, t, l, 1280, 720, 320))
    # 3) 滨水近景（水面 + 树，漫射光下水面会变成一整片柔光板）
    p, t, l = load_cam('r6', 'R6_滨水_近景')
    jobs.append(job('阴天_滨水近景', p, t, l, 1280, 720, 320, dict(DOF, fstop=5.6)))
    # 4) 山门近景（大跨度洞口，逆光/漫射对比最强）
    p, t, l = load_cam('r1', 'R1_山门_近景')
    jobs.append(job('阴天_山门近景', p, t, l, 1280, 720, 320, dict(DOF, fstop=4.5)))

    out = dict(blend='_tmp_overcast.blend', build_extra=list(base['build_extra']),
               jobs=jobs)
    # ★ 气氛变体**不导出 GLB**：导出会压平材质 + 抽稀，且主 GLB 已有。
    p = os.path.join(CFG_DIR, 'overcast.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('已生成 %s' % p)
    for j in jobs:
        print('  %-28s %4d×%4d  %3d spp  lens %.0f  dof=%s'
              % (j['name'], j['res_x'], j['res_y'], j['samples'], j['lens'],
                 'f%.1f' % j['fstop'] if 'fstop' in j else 'off'))


if __name__ == '__main__':
    main()
