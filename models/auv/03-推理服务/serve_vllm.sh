#!/bin/bash
# ==============================================================================
#  AUV 双 LoRA 推理服务 —— vLLM 启动脚本
#
#  挂载两个适配器（同一份基座，按请求选）：
#    extract  ← V10 事件结构化提取（帖子 → 9 字段 JSON）
#    persona  ← V7  人设化回应
#
#  对外提供 OpenAI 兼容接口：  POST /v1/chat/completions
#  可用模型名：  qwen25-14b-base | extract | persona
#
#  用法：  bash serve_vllm.sh
#  停止：  Ctrl+C
#  后台：  nohup bash serve_vllm.sh > serve.log 2>&1 &
#
#  ★★ 本机实测环境：RTX 5090 32GB（Blackwell / sm_120）
#     32GB 装不下 fp16 的 14B（约 29.4GB 权重 + 2.2GB LoRA + KV cache）
#     ⇒ 必须用 AWQ 4bit 基座（约 9.5GB），脚本默认已指向 AWQ 版
# ==============================================================================
set -e

# ------------------------------ 配置区（只改这里）-----------------------------
PORT=6006                            # ★ AutoDL「自定义服务」默认映射 6006
API_KEY="auv-CHANGE-ME-2026"         # ★★★ 必须改！自定义服务是公网公开的
MAX_MODEL_LEN=4096
GPU_UTIL=0.92

# ★ 5090 32G 用 AWQ 4bit 基座（约 9.5GB），留 ~17GB 给 KV cache
BASE=/root/autodl-tmp/models/Qwen2.5-14B-Instruct-AWQ

# 备选：A100 80G 等大显存机器可直接用 fp16 基座，注释上面那行、打开下面这行
# BASE=/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master

LORA_EXTRACT=/root/autodl-tmp/output/qwen25-14b-auv-v10-extract
LORA_PERSONA=/root/autodl-tmp/output/qwen25-14b-auv-v7
# -----------------------------------------------------------------------------

echo "==============================================================="
echo " 1/5  环境检查"
echo "==============================================================="
if ! python -c "import vllm" 2>/dev/null; then
  echo "  ❌ 没装 vLLM（vLLM = 推理引擎，负责把模型变成可调用的 HTTP 接口）。"
  echo "     ★ 装到数据盘，否则释放实例后环境会丢："
  echo "       pip install -U vllm -t /root/autodl-tmp/pylibs"
  echo "       export PYTHONPATH=/root/autodl-tmp/pylibs:\$PYTHONPATH"
  echo "     或直接用 AutoDL 的「保存镜像」把装好的环境固化下来。"
  exit 1
fi
python -c "import vllm; print('  ✅ vLLM', vllm.__version__)"
python -c "
import torch
print('  ✅ torch', torch.__version__, '| cuda', torch.version.cuda)
" || echo "  ⚠️  torch 信息读不到，忽略"

echo
echo "==============================================================="
echo " 2/5  文件检查"
echo "==============================================================="
for d in "$BASE" "$LORA_EXTRACT" "$LORA_PERSONA"; do
  if [ -d "$d" ]; then echo "  ✅ $d"; else echo "  ❌ 缺失目录: $d"; exit 1; fi
done
for f in "$LORA_EXTRACT/adapter_model.safetensors" \
         "$LORA_PERSONA/adapter_model.safetensors" \
         "$LORA_EXTRACT/adapter_config.json" \
         "$LORA_PERSONA/adapter_config.json"; do
  if [ -f "$f" ]; then echo "  ✅ $(basename $(dirname $f))/$(basename $f)"; else echo "  ❌ 缺失文件: $f"; exit 1; fi
done

echo "  --- LoRA rank 核对（应为 128）---"
python - "$LORA_EXTRACT" "$LORA_PERSONA" <<'PY'
import json, sys
for p in sys.argv[1:3]:
    try:
        c = json.load(open(f"{p}/adapter_config.json"))
        print(f"  {p.split('/')[-1]:32s} r={c.get('r')} alpha={c.get('lora_alpha')}")
        if c.get("r") != 128:
            print(f"     ⚠️  r != 128 ⇒ 请把脚本里的 --max-lora-rank 改成 {c.get('r')}")
    except Exception as e:
        print(f"  ⚠️  读不到 {p}/adapter_config.json: {e}")
PY

echo
echo "==============================================================="
echo " 3/5  显存判断"
echo "==============================================================="
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true
VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
echo "  检测到显存: ${VRAM} MiB"

# fp16 的 14B ≈ 29.4GB 权重 + 2.2GB LoRA + KV cache
if [ "${VRAM:-0}" -ge 70000 ]; then
  echo "  ✅ 显存充足（≥70GB）⇒ 可用 fp16 基座"
elif [ "${VRAM:-0}" -ge 38000 ]; then
  echo "  ⚠️  显存 ${VRAM} MiB：fp16 的 14B 约需 32GB+，比较勉强"
  echo "     建议压小 --max-model-len（如 2048），或改用 AWQ 基座更稳"
  sleep 5
else
  echo
  echo "  ⚠️  显存 ${VRAM} MiB < 38GB。"
  echo "     ★ 当前 BASE 指向 AWQ 4bit 基座（约 9.5GB），这是本机（5090 32G）的正确配置。"
  echo "     如果你改回了 fp16 基座，会 OOM —— 请改回 AWQ。"
  sleep 5
fi

echo
echo "==============================================================="
echo " 4/5  算力架构检查（RTX 50 系 = Blackwell / sm_120）"
echo "==============================================================="
python - <<'PY' || true
import torch
try:
    cap = torch.cuda.get_device_capability(0)
    name = torch.cuda.get_device_name(0)
    print(f"  GPU: {name}  compute capability sm_{cap[0]}{cap[1]}")
    if cap[0] >= 12:
        print("  ⚠️  Blackwell（sm_120）需要 PyTorch ≥ 2.7 + CUDA 12.8+，且 vLLM 版本要够新。")
        print("      报 'no kernel image is available' = 版本太旧，不是卡坏了。")
except Exception as e:
    print("  (跳过)", e)
PY

echo
echo "==============================================================="
echo " 5/5  启动服务   :${PORT}"
echo "==============================================================="
echo "  模型名: qwen25-14b-base | extract | persona"
echo "  鉴权  : Authorization: Bearer ${API_KEY:0:8}****"
echo

exec vllm serve "$BASE" \
  --served-model-name qwen25-14b-base \
  --host 0.0.0.0 \
  --port "$PORT" \
  --api-key "$API_KEY" \
  --enable-lora \
  --max-lora-rank 128 \
  --lora-modules extract="$LORA_EXTRACT" persona="$LORA_PERSONA" \
  --max-model-len "$MAX_MODEL_LEN" \
  --gpu-memory-utilization "$GPU_UTIL" \
  --dtype auto
