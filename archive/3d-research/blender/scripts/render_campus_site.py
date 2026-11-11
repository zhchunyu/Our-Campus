# -*- coding: utf-8 -*-
"""
render_campus_site.py —— 山河大学 · 场地骨架渲染
================================================================
与 render_main_building.py 同源，针对「公里级大场景」做了三处改动：

  1. clip_end 提到 20000 m —— 相机到远山有 3 km 以上
  2. 新增均匀介质「空气透视」（haze_density）—— 2 km 视距没有大气衰减
     会显得像塑料沙盘，这一项是实景感的关键
  3. 太阳角度放宽（默认 1.2°）—— 大场景用硬阴影会显得廉价

参数全部走 RENDER_CFG 预置覆盖（run_campus.py 传入）。
"""

import math

import bpy
from mathutils import Vector

# ==================================================================
# 参数
# ==================================================================
_C = globals().get('RENDER_CFG', {})

RES_X = _C.get('res_x', 1600)
RES_Y = _C.get('res_y', 900)
SAMPLES = _C.get('samples', 96)
USE_GPU = _C.get('use_gpu', True)

CAM_POS = tuple(_C.get('cam_pos', (880.0, -1280.0, 1180.0)))
CAM_TGT = tuple(_C.get('cam_tgt', (0.0, 330.0, 20.0)))
LENS = _C.get('lens', 50.0)
SENSOR = 36.0

SUN_ELEV = _C.get('sun_elev', 44.0)
SUN_AZIM = _C.get('sun_azim', 138.0)
SUN_STRENGTH = _C.get('sun_strength', 3.6)
SUN_ANGLE = _C.get('sun_angle', 1.2)
SKY_STRENGTH = _C.get('sky_strength', 0.62)
CLOUD_STRENGTH = _C.get('cloud_strength', 1.5)
HAZE = _C.get('haze_density', 4.5e-5)

# ★ 环境光的**色偏**（只作用于照明，不作用于"看得见的天空"）。
# 为什么必须分开：天空贴图是蓝的，而 `n_bg_env` 用同一张贴图当**环境光**，
# 于是所有背光面、地面、屋面全部被染蓝 —— 实测成图冷色像素占比 **89~99%**、
# 暖色只有 0.2~8%，整园是一张蓝调灰片（这正是"色彩渲染效果不佳"的根因）。
# 把"看得见的天空"留在 1.0，把"照明的天空"乘一个暖色，两个问题一起解决。
AMBIENT_TINT = tuple(_C.get('ambient_tint', (1.0, 1.0, 1.0)))
# 与上面对偶：`ambient_tint` 管"照明的天"，`sky_visible` 管"看得见的天"。
SKY_VISIBLE = _C.get('sky_visible', 1.0)

OUT = _C.get('out', 'campus.png')

# ==================================================================
# 1. 引擎
# ==================================================================
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.012
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 3
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
if HAZE > 0.0:
    try:
        scene.cycles.volume_max_steps = 48
        scene.cycles.volume_step_rate = 2.0
    except AttributeError:
        pass

scene.cycles.device = 'CPU'
if USE_GPU:
    prefs = bpy.context.preferences.addons.get('cycles')
    if prefs:
        cp = prefs.preferences
        for dev in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                cp.compute_device_type = dev
                cp.get_devices()
                if any(d.type == dev for d in cp.devices):
                    scene.cycles.device = 'GPU'
                    for d in cp.devices:
                        d.use = (d.type == dev)
                    print(f'GPU 已启用: {dev}')
                    break
            except Exception:
                continue

scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = OUT

VT = _C.get('view_transform', 'Khronos PBR Neutral')
try:
    scene.view_settings.view_transform = VT
except TypeError:
    scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = _C.get('view_look', 'None')
scene.view_settings.exposure = _C.get('exposure', 0.0)
# ★ `view_look` 默认 'None' —— 既有 63 张的观感一个像素都不许变。
#   只有气氛变体（阴天漫射）才显式指定 'Medium Contrast' / 'AgX - Medium High Contrast' 之类。
if _C.get('gamma') is not None:
    scene.view_settings.gamma = _C['gamma']

# ==================================================================
# 2. 相机
# ==================================================================
for ob in list(bpy.data.objects):
    if ob.type == 'CAMERA':
        bpy.data.objects.remove(ob, do_unlink=True)

cam_data = bpy.data.cameras.new('SiteCam')
cam_data.lens = LENS
cam_data.sensor_width = SENSOR
cam_data.clip_start = 1.0
cam_data.clip_end = 20000.0
cam = bpy.data.objects.new('SiteCam', cam_data)
scene.collection.objects.link(cam)

pos, tgt = Vector(CAM_POS), Vector(CAM_TGT)
cam.location = pos
# 俯视机位（视线接近垂直）时 to_track_quat 的滚转角是退化的、结果不可控，
# 这种情况直接用 cam_rot 显式给定欧拉角（度）。[0,0,0] = 正北朝上。
CAM_ROT = _C.get('cam_rot')
if CAM_ROT:
    cam.rotation_euler = tuple(math.radians(v) for v in CAM_ROT)
else:
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam

# ---- 景深（natural depth of field）----
# ★ 默认关。开启后**焦点自动落在 cam_tgt 上** —— 手算 focus_distance 算错就是整幅糊，
#   属于典型的"静默失效"（图能出来，但没人发现焦点在天上）。
if _C.get('dof'):
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = None
    cam_data.dof.focus_distance = max(1.0, (tgt - pos).length * _C.get('focus_scale', 1.0))
    cam_data.dof.aperture_fstop = _C.get('fstop', 5.6)
    cam_data.dof.aperture_blades = _C.get('blades', 7)
    cam_data.dof.aperture_rotation = math.radians(_C.get('blade_rot', 0.0))
    print('景深 开：焦距 %.1f m / f%.1f / %d 叶片' % (
        cam_data.dof.focus_distance, cam_data.dof.aperture_fstop,
        cam_data.dof.aperture_blades))

# ==================================================================
# 3. 空气透视（均匀介质）
# ==================================================================
# ★ 复用守卫（必须有）：本脚本是**每个渲染作业执行一次**的
#   （`run_campus.py` 对 `jobs[]` 里每个 job 都 exec 一遍本文件），
#   而 `bpy.data` 在整个 Blender 会话里是**共享**的 ⇒ 没有守卫时，
#   一个阶段渲 N 张就会攒下 N 个 14000×14000×5200 m 的体域立方体
#   （材质也跟着变成 `M_空气` / `.001` / … / `.00N`，本项目 R6 攒到 8 个）。
#
#   实测（8 个 vs 1 个，同机位逐像素对比）：**平均差 0.00、最大差 1** ——
#   Cycles **不会**把重叠体域的密度相加，所以那 8 个立方体对成图没有任何影响。
#   这个守卫因此**不改变任何一张成图**，只是让数据块保持整洁、导出更快。
#
#   ⚠ 但它们会**跟着导出进 GLB**：14 km 的立方体 + 只有 Volume 输出（无 Surface）
#     的材质 ⇒ glTF 回退成 baseColor=[1,1,1] + metallic=1 的白色镜面块。
#     导出端的拦截在 `export_glb.py` 第 0 步（`drop_render_only_objects`）。
if HAZE > 0.0 and bpy.data.objects.get('Haze') is None:
    hv, hf = [], []
    SX, SY, SZ = 7000.0, 7000.0, 2600.0
    for z in (-SZ, SZ):
        for y in (-SY, SY):
            for x in (-SX, SX):
                hv.append((x, y, z))
    hf = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1],
          [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    hm = bpy.data.meshes.new('Haze')
    hm.from_pydata(hv, [], hf)
    hm.validate()
    hmat = bpy.data.materials.new('M_空气')
    hmat.use_nodes = True
    nt = hmat.node_tree
    nt.nodes.clear()
    hout = nt.nodes.new('ShaderNodeOutputMaterial')
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = HAZE
    vol.inputs['Color'].default_value = (0.72, 0.79, 0.90, 1.0)
    try:
        vol.inputs['Anisotropy'].default_value = 0.25
    except (KeyError, TypeError):
        pass
    nt.links.new(vol.outputs['Volume'], hout.inputs['Volume'])
    hm.materials.append(hmat)
    hob = bpy.data.objects.new('Haze', hm)
    hob.display_type = 'WIRE'
    scene.collection.objects.link(hob)

# ==================================================================
# 4. 世界：物理天空 + 程序化积云
# ==================================================================
world = bpy.data.worlds.new('SiteWorld')
scene.world = world
world.use_nodes = True
wnt = world.node_tree
wnt.nodes.clear()

n_out = wnt.nodes.new('ShaderNodeOutputWorld')
n_sky = wnt.nodes.new('ShaderNodeTexSky')
for _name in ('MULTIPLE_SCATTERING', 'NISHITA'):
    try:
        n_sky.sky_type = _name
        break
    except TypeError:
        continue
n_sky.sun_elevation = math.radians(SUN_ELEV)
n_sky.sun_rotation = math.radians(SUN_AZIM)
n_sky.sun_disc = False
n_sky.altitude = 300.0
n_sky.air_density = _C.get('air_density', 1.0)
# ★ `air_density` / `dust_density` 是**阴天配方的关键旋钮**：
#   空气密度一拉高，Nishita 天空从"通透的蓝"变成"发白的灰"，
#   环境光也随之变平 —— 这正是"无直射光、均匀照明"要的底子。
if hasattr(n_sky, 'dust_density'):
    n_sky.dust_density = _C.get('dust_density', 1.1)

n_tc = wnt.nodes.new('ShaderNodeTexCoord')
n_sep = wnt.nodes.new('ShaderNodeSeparateXYZ')
wnt.links.new(n_tc.outputs['Generated'], n_sep.inputs['Vector'])

n_cnoise = wnt.nodes.new('ShaderNodeTexNoise')
n_cnoise.inputs['Scale'].default_value = _C.get('cloud_scale', 5.0)
n_cnoise.inputs['Detail'].default_value = 12.0
n_cnoise.inputs['Roughness'].default_value = 0.62
wnt.links.new(n_tc.outputs['Generated'], n_cnoise.inputs['Vector'])

n_cramp = wnt.nodes.new('ShaderNodeValToRGB')
# ★★ `cloud_cover`（2026-09-24 加）—— 云量。
#   原值 (0.50, 0.60) 只让噪声 Fac > 0.5 的那一半变成云 ⇒ 渲出来是"**少云**"，
#   而阴天要的是"**整片云盖**"。把区间往左推（如 0.20→0.45）就几乎全被云覆盖。
#   ★ 为什么必须做成旋钮：只调 `cloud_strength`（亮度）**改不了云量** ——
#     云盖面积由这个 ColorRamp 的位置决定，与亮度是两回事。
_cc0, _cc1 = _C.get('cloud_cover', (0.50, 0.60))
n_cramp.color_ramp.elements[0].position = _cc0
n_cramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
n_cramp.color_ramp.elements[1].position = _cc1
n_cramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
wnt.links.new(n_cnoise.outputs['Fac'], n_cramp.inputs['Fac'])

n_horiz = wnt.nodes.new('ShaderNodeMapRange')
# 云的"水平遮罩"：Generated 的 Z ≈ 仰角正弦（0=地平线，1=天顶）。
# 这一对数字决定了"从多低的角度开始出现云"。原值 (0.03, 0.24) 对应仰角
# 1.7°~13.9°，本意是避免云贴地；但本项目的建筑立面机位普遍只有 1°~7° 仰角，
# 正好落在渐显区里，云量被压到 0~0.5，渲出来是一整片均匀灰蓝。
# → 放宽到 (0.010, 0.105)，仰角 0.6°~6° 就满量；仍保留一点地平线衰减。
_hz0, _hz1 = _C.get('cloud_horizon', (0.010, 0.105))
n_horiz.inputs['From Min'].default_value = _hz0
n_horiz.inputs['From Max'].default_value = _hz1
n_horiz.inputs['To Min'].default_value = 0.0
n_horiz.inputs['To Max'].default_value = 1.0
n_horiz.clamp = True
wnt.links.new(n_sep.outputs['Z'], n_horiz.inputs['Value'])

n_cmask = wnt.nodes.new('ShaderNodeMath')
n_cmask.operation = 'MULTIPLY'
wnt.links.new(n_cramp.outputs['Color'], n_cmask.inputs[0])
wnt.links.new(n_horiz.outputs['Result'], n_cmask.inputs[1])

n_bg_env = wnt.nodes.new('ShaderNodeBackground')
n_bg_env.inputs['Strength'].default_value = SKY_STRENGTH
# 环境光先过一层暖色乘法（见文件头 AMBIENT_TINT 说明）
n_atint = wnt.nodes.new('ShaderNodeMixRGB')
n_atint.blend_type = 'MULTIPLY'
n_atint.inputs['Fac'].default_value = 1.0
n_atint.inputs['Color2'].default_value = (AMBIENT_TINT[0], AMBIENT_TINT[1],
                                          AMBIENT_TINT[2], 1.0)
wnt.links.new(n_sky.outputs['Color'], n_atint.inputs['Color1'])
wnt.links.new(n_atint.outputs['Color'], n_bg_env.inputs['Color'])
n_bg_sky = wnt.nodes.new('ShaderNodeBackground')
# ★ "看得见的天空"的强度 —— 与环境光解耦。
# 环境光被 `AMBIENT_TINT` 压掉蓝、被 `sky_strength` 提亮之后，天空本身
# 反而容易渲成一片发白的灰。这里单独调"看得见的那层天"的亮度，
# 压到 0.7 左右天空才回到饱和的蓝，画面才有"通透感"。
n_bg_sky.inputs['Strength'].default_value = SKY_VISIBLE
wnt.links.new(n_sky.outputs['Color'], n_bg_sky.inputs['Color'])

n_bg_cloud = wnt.nodes.new('ShaderNodeBackground')
n_bg_cloud.inputs['Color'].default_value = (0.96, 0.965, 0.98, 1.0)
n_bg_cloud.inputs['Strength'].default_value = CLOUD_STRENGTH

n_mix_cloud = wnt.nodes.new('ShaderNodeMixShader')
wnt.links.new(n_cmask.outputs['Value'], n_mix_cloud.inputs['Fac'])
wnt.links.new(n_bg_sky.outputs['Background'], n_mix_cloud.inputs[1])
wnt.links.new(n_bg_cloud.outputs['Background'], n_mix_cloud.inputs[2])

n_mix_lp = wnt.nodes.new('ShaderNodeMixShader')
n_lp = wnt.nodes.new('ShaderNodeLightPath')
wnt.links.new(n_lp.outputs['Is Camera Ray'], n_mix_lp.inputs['Fac'])
wnt.links.new(n_bg_env.outputs['Background'], n_mix_lp.inputs[1])
wnt.links.new(n_mix_cloud.outputs['Shader'], n_mix_lp.inputs[2])
wnt.links.new(n_mix_lp.outputs['Shader'], n_out.inputs['Surface'])

# ==================================================================
# 5. 太阳
# ==================================================================
for ob in list(bpy.data.objects):
    if ob.type == 'LIGHT':
        bpy.data.objects.remove(ob, do_unlink=True)

sun_data = bpy.data.lights.new('Sun', type='SUN')
sun_data.energy = SUN_STRENGTH
sun_data.angle = math.radians(SUN_ANGLE)
sun_data.color = tuple(_C.get('sun_color', (1.0, 0.948, 0.866)))
sun = bpy.data.objects.new('Sun', sun_data)
scene.collection.objects.link(sun)

el, az = math.radians(SUN_ELEV), math.radians(SUN_AZIM)
to_sun = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
sun.location = to_sun * 3000.0
sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

# ==================================================================
# 6. 渲染
# ==================================================================
print(f'引擎 {scene.render.engine} / 设备 {scene.cycles.device} / {RES_X}x{RES_Y} / {SAMPLES} spp')
print(f'相机 {CAM_POS} -> {CAM_TGT}, {LENS}mm, 距目标 '
      f'{(Vector(CAM_POS) - Vector(CAM_TGT)).length:.0f} m')
print(f'太阳 高度{SUN_ELEV}° 方位{SUN_AZIM}° 强度{SUN_STRENGTH} / 空气 {HAZE}')
print('开始渲染…')
bpy.ops.render.render(write_still=True)
print(f'渲染完成: {OUT}')
