# -*- coding: utf-8 -*-
"""export_glb.py —— 把当前场景导出为 GLB（网页预览用）。

由 `run_campus.py` 在**存盘之后**调用，与渲染同一套调用约定：

    run(RENDER_PY, {'RENDER_CFG': job})        # 渲染
    run(EXPORT_PY, {'EXPORT_CFG': cfg['export']})   # 导出

★ **为什么必须排在存盘之后**：本脚本会做两件破坏性的事（抽稀、清材质），
  排在存盘之后 ⇒ 工程 `.blend` 永远是"未抽稀的干净构建态"，
  导出侧的减面只影响 GLB。**反过来就会把减面写进工程文件。**

配置项（都可省，见 `make_render_configs.py` 的 `EXPORT`）：
    glb / dir / yup / apply_modifiers / draco / draco_level
    cameras / lights / extras / purge_unused_materials / flatten_materials
    decimate: {min_tris, ratio}   面数 ≥ min_tris 的对象按 ratio 抽稀（只影响导出）

==================================================================
两个坑
==================================================================
1) **glTF 导出算子的参数名跨版本会变**（`export_draco_mesh_compression_enable`
   在 3.x / 4.x 之间改过名）。这里拿算子自身的 RNA 属性表过滤 kwargs，
   不支持的参数**打印出来跳过**，而不是抛 TypeError 中断整个管线。

2) **别在导出脚本里顺手 `save_as_mainfile`** —— 抽稀是破坏性的，
   存下去等于把工程文件也减面了，之后所有渲染都会跟着变糙。
"""

import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(os.path.dirname(HERE))          # 02-三维资产
DEF_DIR = os.path.join(ASSET, 'exports')

cfg = dict(globals().get('EXPORT_CFG') or {})


def tri_count(evaluated=False):
    """三角面总数。evaluated=True 时把修改器算进去（= 导出后的真实面数）。"""
    dg = bpy.context.evaluated_depsgraph_get() if evaluated else None
    n = 0
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        if dg:
            ob = o.evaluated_get(dg)
            me = ob.to_mesh()
        else:
            me = o.data
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        if dg:
            ob.to_mesh_clear()
    return n


def principled(m):
    if not m.use_nodes:
        return None
    for n in m.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfPrincipled':
            return n
    return None


def _strip_leaf_trans():
    """导出前剔除树叶材质的**透光**（`Transmission Weight` → 0）。

    ★ 为什么必须剔除（渲染要，网页端不要）：
      V2.5 给树叶加了 `Transmission Weight 0.32` + `IOR 1.0` 做**漫透射**，
      Cycles 里是"逆光叶片发亮"的效果，**这是渲染端的语言**。
      但 glTF 会把它导成 `KHR_materials_transmission` ⇒ three.js 侧变成
      `MeshPhysicalMaterial` 的 transmission，**走透明通道 + 单独的
      transmission render target**：605 株树冠全部进透明队列，深度排序极易出错
      （树画在楼前面），且网页端帧率会明显掉。
      ⇒ 网页端用**不透明树叶**（本来就是低模 LOD，近看不成立），
        透光只在离线的 Cycles 成图里出现。

    ★ 想保留可置 `BR_GLB_LEAF_TRANS=1`（默认剔除）。
    """
    if os.environ.get('BR_GLB_LEAF_TRANS', '0') == '1':
        return
    n = 0
    for m in bpy.data.materials:
        if '树叶' not in m.name:
            continue
        b = principled(m)
        if b is None:
            continue
        s = b.inputs.get('Transmission Weight')
        if s is None or s.default_value == 0.0:
            continue
        s.default_value = 0.0
        n += 1
    if n:
        print('[GLB] 树叶透光已剔除 %d 个材质（渲染端效果，网页端走不透明）' % n)


def flatten_materials():
    """把程序化材质压成 glTF 能表达的**常量** PBR。

    ★ 为什么必须做：
      glTF 的材质只有 `baseColorFactor`（常量）或贴图，**没有 ColorRamp / Noise
      这类程序化节点**。本项目大量材质（实测 53 个里 **32 个**）的 `Base Color`
      插槽被一条 `Noise → ColorRamp` 连线占着 ⇒ 导出器拿不到常量，
      只能写 `baseColorFactor = [1,1,1]`（纯白）。**不报错，只是整个园区变成白模。**

    做法：取"有效颜色"（连线时用 ColorRamp 各端点颜色的均值）写回
    `default_value`，然后**断开连线**。噪声凹凸（Normal 连线）glTF 同样表达不了，
    一并断开即可 —— 网页端不需要它。

    ★ 破坏性 ⇒ 由 `run_campus.py` 排在"存盘 + 渲染"**之后**调用。

    ★ V2.5 追加：**剔除树叶的 `Transmission Weight`**（见下方 `_strip_leaf_trans`）。
    """
    _strip_leaf_trans()
    flat, kept, odd = 0, 0, []
    for m in bpy.data.materials:
        b = principled(m)
        if b is None:
            continue
        s = b.inputs.get('Base Color')
        if s is None:
            continue
        if not s.is_linked:
            kept += 1
            continue
        src = s.links[0].from_node
        eff = None
        if src.bl_idname == 'ShaderNodeValToRGB':
            els = list(src.color_ramp.elements)
            if els:
                eff = [sum(e.color[i] for e in els) / len(els) for i in range(3)]
        if eff is None:
            odd.append('%s ← %s' % (m.name, src.bl_idname))
            continue
        for lk in list(s.links):
            m.node_tree.links.remove(lk)
        s.default_value = (eff[0], eff[1], eff[2], 1.0)
        # 顺手断开法线/凹凸连线：glTF 不表达程序化凹凸，留着反而让导出器报警告
        ns = b.inputs.get('Normal')
        if ns is not None and ns.is_linked:
            for lk in list(ns.links):
                m.node_tree.links.remove(lk)
        flat += 1
    print('[GLB] 材质压平：%d 个由 ColorRamp 压成常量色，%d 个本来就是常量%s'
          % (flat, kept, ('；⚠ 无法识别来源：' + '，'.join(odd)) if odd else ''))


n0 = tri_count()
n_mesh = len([o for o in bpy.data.objects if o.type == 'MESH'])
print('=' * 68)
print('[GLB] 导出前：%d 对象 / %d 三角面 / %d 材质 / %d 贴图'
      % (n_mesh, n0, len(bpy.data.materials), len(bpy.data.images)))

# ---------------- 0. 剔除"只服务渲染"的辅助对象 ----------------
# ★ `render_campus_site.py` 每次渲染都会新建一个 14000×14000×5200 m 的 Haze 体域立方体
#   （空气透视的均匀介质域），**没有复用守卫** ⇒ 一个阶段渲 N 张就攒下 N 个。
#   它们对成图有用（虽然会叠加 N 层），但**绝不能进 GLB**：
#     ① 14 km 的立方体会把模型包围盒撑到荒谬的尺度；
#     ② 它的材质是 `ShaderNodeVolumePrincipled`（只有 Volume 输出、没有 Surface），
#        glTF 无法表达 ⇒ 导出器回退成 baseColor=[1,1,1] + metallic=1 的**白色镜面块**。
#   实测不剔除时 GLB 里会多出 8 个 `M_空气` 材质 + 8 个 14 km 白盒子；
#   three.js 里因为相机在盒内、默认 FrontSide 会剔除背面，**暂时看不见** ——
#   属于"拉远或换个机位就满屏白"的潜伏问题。
#   剔除后，下面第 1 步的 `users == 0` 清理会顺带把 `M_空气*` 一并删掉。
def drop_render_only_objects():
    pats = tuple(cfg.get('drop_objects') or ('Haze',))
    hit = []
    for o in list(bpy.data.objects):
        if any(o.name == p or o.name.startswith(p + '.') for p in pats):
            hit.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    print('[GLB] 剔除仅服务渲染的对象 %d 个：%s' % (len(hit), hit or '无'))
    return hit


drop_render_only_objects()

# ---------------- 1. 清理未被引用的材质 ----------------
# 本项目实测有 11 个死材质（含旧语言的 `M_木构朱漆` / `M_瓦屋面`）。
# 它们不进 GLB，但会拖慢导出、也让"语言一致性收口"的体检结果读不出重点。
if cfg.get('purge_unused_materials', True):
    dead = [m for m in bpy.data.materials if m.users == 0]
    # ★ 先把名字取出来再删：`remove()` 之后访问 `m.name` 会抛
    #   `ReferenceError: StructRNA of type Material has been removed`。
    names = [m.name for m in dead]
    for m in dead:
        bpy.data.materials.remove(m)
    print('[GLB] 清理未引用材质 %d 个：%s' % (len(names), names or '无'))

# ---------------- 2. 材质压平（glTF 没有程序化节点） ----------------
if cfg.get('flatten_materials', True):
    flatten_materials()

# ---------------- 3. 抽稀（只影响导出） ----------------
dec = cfg.get('decimate') or {}
if dec:
    thr = dec.get('min_tris', 200000)
    ratio = dec.get('ratio', 0.5)
    hits = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        t = len(o.data.loop_triangles)
        if t >= thr:
            md = o.modifiers.new('dec_export', 'DECIMATE')
            md.decimate_type = 'COLLAPSE'
            md.ratio = ratio
            hits.append((o.name, t))
    if hits:
        print('[GLB] 抽稀（ratio %.2f，阈值 %d 面）：' % (ratio, thr))
        for nm, t in hits:
            print('        %-26s %8d → %8d tri' % (nm, t, int(t * ratio)))
    else:
        print('[GLB] 抽稀：无对象达到阈值 %d 面' % thr)

n1 = tri_count(evaluated=True)

# ---------------- 4. 导出 ----------------
out = os.path.join(cfg.get('dir') or DEF_DIR,
                   cfg.get('glb') or '山河大学.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)

kw = dict(
    filepath=out,
    export_format='GLB',
    use_selection=False,
    export_yup=cfg.get('yup', True),          # three.js / glTF 标准：+Y 向上
    export_apply=cfg.get('apply_modifiers', True),
    export_materials='EXPORT',
    export_texcoords=True,
    export_normals=True,
    export_cameras=cfg.get('cameras', False),
    export_lights=cfg.get('lights', False),
    export_extras=cfg.get('extras', False),
)
if cfg.get('draco', True):
    kw['export_draco_mesh_compression_enable'] = True
    kw['export_draco_mesh_compression_level'] = cfg.get('draco_level', 6)

props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
dropped = [k for k in kw if k not in props]
for k in dropped:
    print('[GLB] ⚠ 本版 Blender 的 glTF 算子不支持参数 `%s`，已跳过' % k)
kw = {k: v for k, v in kw.items() if k in props}

bpy.ops.export_scene.gltf(**kw)

size = os.path.getsize(out) / 1048576.0
print('[GLB] 已导出 %s' % out)
print('[GLB] 三角面 %d → %d（导出用）｜ 文件 %.1f MB ｜ Draco=%s'
      % (n0, n1, size, cfg.get('draco', True)))

# ---------------- 5. 同步一份给网页 ----------------
# 网页服务通常以 `web-demo/` 为根，`../exports/` 在根之外会被 http.server 拒掉
# ⇒ 必须把 GLB 复制进站点目录内。**复制源永远是 exports/ 那一份**，
#   不要反过来（否则"交付物"和"网页用的"两份文件会各自演化、走散）。
cp_to = cfg.get('copy_to')
if cp_to:
    dst = os.path.join(ASSET, cp_to)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(out, 'rb') as fi, open(dst, 'wb') as fo:
        fo.write(fi.read())
    print('[GLB] 已同步给网页 %s  %.1f MB' % (dst, os.path.getsize(dst) / 1048576.0))

print('=' * 68)
