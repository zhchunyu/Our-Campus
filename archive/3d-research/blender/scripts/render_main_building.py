# -*- coding: utf-8 -*-
"""
render_main_building.py —— 教学主楼实景渲染  v2
================================================================
在 Blender 里执行（通过 run_pipeline.py 送入）。

v2 相对 v1 的修正：
  · 天空：Nishita 纯色渐变 → 「物理天空 + 程序化积云」。
    实景照片是晴空积云，纯渐变天空是"CG 感"的主要来源之一。
  · 光照：太阳抬高到接近正午、方位偏侧，让壁柱投出清晰侧影
    —— 实景照片里壁柱的立体感全靠这个侧影。
  · 曝光：整体下调，避免灰米色墙面在强光下被冲成纯白。
  · 相机：改为贴近参考照片的低机位 3/4 仰视。

节点结构（只用 Background / MixShader，避免 4.x 里 MixRGB 的兼容问题）：
    sky_tex ──► bg_env   (强度 = SKY_STRENGTH，只参与照明)
    sky_tex ──► bg_sky   (强度 = 1，相机看到的底色)
                 bg_cloud (白色，相机看到的云)
    bg_sky + bg_cloud ──MixShader(fac=云掩膜)──► mix_cloud
    bg_env + mix_cloud ──MixShader(fac=Is Camera Ray)──► 输出
  → 相机看到「蓝天 + 积云」，而照明只用被压低的天空，兼顾通透与不过曝。

可调参数通过 RENDER_CFG 预置覆盖（run_pipeline.py 会传入）。
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
SAMPLES = _C.get('samples', 128)
USE_GPU = _C.get('use_gpu', False)

CAM_POS = tuple(_C.get('cam_pos', (46.0, 58.0, 7.0)))
CAM_TGT = tuple(_C.get('cam_tgt', (0.0, 0.0, 9.5)))
LENS = _C.get('lens', 35.0)
SENSOR = 36.0

SUN_ELEV = _C.get('sun_elev', 46.0)
SUN_AZIM = _C.get('sun_azim', 125.0)
SUN_STRENGTH = _C.get('sun_strength', 4.4)
SUN_ANGLE = _C.get('sun_angle', 0.7)
SKY_STRENGTH = _C.get('sky_strength', 0.85)     # 照明用天空强度
CLOUD_STRENGTH = _C.get('cloud_strength', 1.6)

OUT = _C.get('out', 'main_building.png')

# ==================================================================
# 1. 渲染引擎
# ==================================================================
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.01
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.cycles.transmission_bounces = 4
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False

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
        else:
            scene.cycles.device = 'CPU'
    else:
        scene.cycles.device = 'CPU'
else:
    scene.cycles.device = 'CPU'

scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = OUT

# 色调映射
VT = _C.get('view_transform', 'Khronos PBR Neutral')
try:
    scene.view_settings.view_transform = VT
except TypeError:
    scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'None'
scene.view_settings.exposure = _C.get('exposure', 0.0)

# ==================================================================
# 2. 相机
# ==================================================================
for ob in list(bpy.data.objects):
    if ob.type == 'CAMERA':
        bpy.data.objects.remove(ob, do_unlink=True)

cam_data = bpy.data.cameras.new('MainCam')
cam_data.lens = LENS
cam_data.sensor_width = SENSOR
cam_data.clip_start = 0.5
cam_data.clip_end = 4000.0
cam = bpy.data.objects.new('MainCam', cam_data)
scene.collection.objects.link(cam)

pos = Vector(CAM_POS)
tgt = Vector(CAM_TGT)
cam.location = pos
cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam

# ==================================================================
# 3. 世界：物理天空 + 程序化积云
# ==================================================================
world = bpy.data.worlds.new('MainWorld')
scene.world = world
world.use_nodes = True
wnt = world.node_tree
wnt.nodes.clear()

n_out = wnt.nodes.new('ShaderNodeOutputWorld')

# --- 物理天空 ---
n_sky = wnt.nodes.new('ShaderNodeTexSky')
# Blender 5.x 把 Nishita 改名为 MULTIPLE_SCATTERING，4.x 也叫 MULTIPLE_SCATTERING
for _name in ('MULTIPLE_SCATTERING', 'NISHITA'):
    try:
        n_sky.sky_type = _name
        break
    except TypeError:
        continue
n_sky.sun_elevation = math.radians(SUN_ELEV)
n_sky.sun_rotation = math.radians(SUN_AZIM)
n_sky.sun_disc = False                 # 关掉可见日面，避免与 Sun 灯方向打架
n_sky.altitude = 300.0
n_sky.air_density = 1.0
if hasattr(n_sky, 'dust_density'):
    n_sky.dust_density = 1.1

# --- 云掩膜：方向向量 → 噪声 → 阈值 → 地平线以上才生效 ---
n_tc = wnt.nodes.new('ShaderNodeTexCoord')
n_sep = wnt.nodes.new('ShaderNodeSeparateXYZ')
wnt.links.new(n_tc.outputs['Generated'], n_sep.inputs['Vector'])

n_cnoise = wnt.nodes.new('ShaderNodeTexNoise')
n_cnoise.inputs['Scale'].default_value = 5.0
n_cnoise.inputs['Detail'].default_value = 12.0
n_cnoise.inputs['Roughness'].default_value = 0.62
wnt.links.new(n_tc.outputs['Generated'], n_cnoise.inputs['Vector'])

n_cramp = wnt.nodes.new('ShaderNodeValToRGB')
n_cramp.color_ramp.elements[0].position = 0.50
n_cramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
n_cramp.color_ramp.elements[1].position = 0.60
n_cramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
wnt.links.new(n_cnoise.outputs['Fac'], n_cramp.inputs['Fac'])

# 地平线以下不出云
n_horiz = wnt.nodes.new('ShaderNodeMapRange')
n_horiz.inputs['From Min'].default_value = 0.03
n_horiz.inputs['From Max'].default_value = 0.24
n_horiz.inputs['To Min'].default_value = 0.0
n_horiz.inputs['To Max'].default_value = 1.0
n_horiz.clamp = True
wnt.links.new(n_sep.outputs['Z'], n_horiz.inputs['Value'])

n_cmask = wnt.nodes.new('ShaderNodeMath')
n_cmask.operation = 'MULTIPLY'
wnt.links.new(n_cramp.outputs['Color'], n_cmask.inputs[0])
wnt.links.new(n_horiz.outputs['Result'], n_cmask.inputs[1])

# --- 背景：照明用（压暗） / 相机用（全亮） ---
n_bg_env = wnt.nodes.new('ShaderNodeBackground')
n_bg_env.inputs['Strength'].default_value = SKY_STRENGTH
wnt.links.new(n_sky.outputs['Color'], n_bg_env.inputs['Color'])

n_bg_sky = wnt.nodes.new('ShaderNodeBackground')
n_bg_sky.inputs['Strength'].default_value = 1.0
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
# 4. 太阳
# ==================================================================
for ob in list(bpy.data.objects):
    if ob.type == 'LIGHT':
        bpy.data.objects.remove(ob, do_unlink=True)

sun_data = bpy.data.lights.new('Sun', type='SUN')
sun_data.energy = SUN_STRENGTH
sun_data.angle = math.radians(SUN_ANGLE)
sun_data.color = (1.0, 0.945, 0.858)
sun = bpy.data.objects.new('Sun', sun_data)
scene.collection.objects.link(sun)

el, az = math.radians(SUN_ELEV), math.radians(SUN_AZIM)
to_sun = Vector((math.cos(el) * math.cos(az),
                 math.cos(el) * math.sin(az),
                 math.sin(el)))
sun.location = to_sun * 400.0
sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

# ==================================================================
# 5. 渲染
# ==================================================================
print(f'引擎 {scene.render.engine} / 设备 {scene.cycles.device} / '
      f'{RES_X}x{RES_Y} / {SAMPLES} spp')
print(f'相机 {CAM_POS} -> {CAM_TGT}, {LENS}mm')
print(f'太阳 高度{SUN_ELEV}° 方位{SUN_AZIM}° 强度{SUN_STRENGTH}')
print('开始渲染…')
bpy.ops.render.render(write_still=True)
print(f'渲染完成: {OUT}')
