# -*- coding: utf-8 -*-
"""
render_main_building.py —— 教学主楼实景渲染
================================================================
在 Blender 里执行（通过 blender_bridge.py 送入）。

要点：
  · Cycles + 物理相机（40mm 等效），3/4 视角，略仰视，贴近参考照片的取景
  · Nishita 天空（只取环境光，关掉可见日面） + Sun 灯打主光，前左 45° 侧逆光
  · AgX 色调映射，避免高光死白
  · OpenImageDenoise 降噪

可调参数通过脚本顶部的常量修改。
"""

import math

import bpy
from mathutils import Vector

# ==================================================================
# 参数（调用方可在执行前预置 RENDER_CFG 覆盖，用于快速预览）
#   例：RENDER_CFG = {'res_x': 640, 'res_y': 360, 'samples': 24, 'out': r'...preview.png'}
# ==================================================================
_C = globals().get('RENDER_CFG', {})
_R = r"C:\Users\31967\Desktop\全国人工智能精英算法大赛\春雨工作区\02-三维资产\renders"

RES_X = _C.get('res_x', 1600)
RES_Y = _C.get('res_y', 900)
SAMPLES = _C.get('samples', 96)
USE_GPU = _C.get('use_gpu', False)      # True 时尝试 CUDA/OptiX，失败自动回落 CPU

CAM_POS = tuple(_C.get('cam_pos', (38.0, 50.0, 7.5)))
CAM_TGT = tuple(_C.get('cam_tgt', (0.0, 0.0, 9.5)))
LENS = _C.get('lens', 40.0)
SENSOR = 36.0

SUN_ELEV = _C.get('sun_elev', 38.0)     # 太阳高度角
SUN_AZIM = _C.get('sun_azim', 120.0)    # 太阳方位角（自 +X 轴逆时针，落在前左方）
SUN_STRENGTH = _C.get('sun_strength', 4.6)
SUN_ANGLE = _C.get('sun_angle', 1.0)    # 太阳张角（度），越大阴影边缘越柔和
SKY_STRENGTH = _C.get('sky_strength', 0.30)   # 环境光强度（压低避免整体泛白）

OUT = _C.get('out', _R + r"\主楼_01.png")

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
            print('未找到可用 GPU，回落 CPU')
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
scene.view_settings.exposure = _C.get('exposure', -0.85)

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
cam_data.clip_end = 3000.0
cam = bpy.data.objects.new('MainCam', cam_data)
scene.collection.objects.link(cam)

pos = Vector(CAM_POS)
tgt = Vector(CAM_TGT)
cam.location = pos
cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam

# ==================================================================
# 3. 天空与环境光
# ==================================================================
world = bpy.data.worlds.new('MainWorld')
scene.world = world
world.use_nodes = True
wnt = world.node_tree
wnt.nodes.clear()

w_out = wnt.nodes.new('ShaderNodeOutputWorld')
w_mix = wnt.nodes.new('ShaderNodeMixShader')
w_lp = wnt.nodes.new('ShaderNodeLightPath')

w_bg_env = wnt.nodes.new('ShaderNodeBackground')    # 参与照明（压低）
w_bg_cam = wnt.nodes.new('ShaderNodeBackground')    # 相机可见（全亮，保证天空通透）

w_sky = wnt.nodes.new('ShaderNodeTexSky')
# Blender 5.x 把 Nishita 模型改名为 MULTIPLE_SCATTERING，4.x 仍叫 NISHITA
for _name in ('MULTIPLE_SCATTERING', 'NISHITA'):
    try:
        w_sky.sky_type = _name
        break
    except TypeError:
        continue
w_sky.sun_elevation = math.radians(SUN_ELEV)
w_sky.sun_rotation = math.radians(SUN_AZIM)
w_sky.sun_disc = False                 # 关掉可见日面，避免与 Sun 灯方向不一致
w_sky.altitude = 800.0
w_sky.air_density = 1.0
if hasattr(w_sky, 'dust_density'):
    w_sky.dust_density = 1.4

w_bg_env.inputs['Strength'].default_value = SKY_STRENGTH
w_bg_cam.inputs['Strength'].default_value = 1.0

wnt.links.new(w_sky.outputs['Color'], w_bg_env.inputs['Color'])
wnt.links.new(w_sky.outputs['Color'], w_bg_cam.inputs['Color'])
# 相机射线看到全亮天空，其余（漫反射/高光）用压低的环境光 —— 天空通透但不过曝
wnt.links.new(w_lp.outputs['Is Camera Ray'], w_mix.inputs['Fac'])
wnt.links.new(w_bg_env.outputs['Background'], w_mix.inputs[1])
wnt.links.new(w_bg_cam.outputs['Background'], w_mix.inputs[2])
wnt.links.new(w_mix.outputs['Shader'], w_out.inputs['Surface'])

# ==================================================================
# 4. 太阳
# ==================================================================
for ob in list(bpy.data.objects):
    if ob.type == 'LIGHT':
        bpy.data.objects.remove(ob, do_unlink=True)

sun_data = bpy.data.lights.new('Sun', type='SUN')
sun_data.energy = SUN_STRENGTH
sun_data.angle = math.radians(SUN_ANGLE)
sun_data.color = (1.0, 0.955, 0.895)
sun = bpy.data.objects.new('Sun', sun_data)
scene.collection.objects.link(sun)

el, az = math.radians(SUN_ELEV), math.radians(SUN_AZIM)
to_sun = Vector((math.cos(el) * math.cos(az),
                 math.cos(el) * math.sin(az),
                 math.sin(el)))
sun.location = to_sun * 200.0
sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

# ==================================================================
# 5. 渲染
# ==================================================================
print(f'引擎 {scene.render.engine} / 设备 {scene.cycles.device} / '
      f'{RES_X}x{RES_Y} / {SAMPLES} spp')
print(f'相机 {CAM_POS} -> {CAM_TGT}, {LENS}mm')
print('开始渲染…')
bpy.ops.render.render(write_still=True)
print(f'渲染完成: {OUT}')
