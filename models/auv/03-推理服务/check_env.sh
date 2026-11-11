#!/bin/bash
# ==============================================================================
#  环境自查 —— 跑这个，把输出整段贴回来
#  目的：搞清楚"已经装了什么、正在跑什么、监听哪个端口"
# ==============================================================================

echo "==============================================================="
echo " 1. GPU"
echo "==============================================================="
nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv
python -c "import torch; print('torch', torch.__version__, '| cuda', torch.version.cuda, '| sm', torch.cuda.get_device_capability(0))" 2>/dev/null \
  || echo "  (torch 读不到)"

echo
echo "==============================================================="
echo " 2. 相关 Python 包"
echo "==============================================================="
pip list 2>/dev/null | grep -Ei "^(vllm|llamafactory|torch|bitsandbytes|transformers|accelerate|peft|gradio|fastapi|uvicorn|modelscope|openai) " \
  || echo "  (没匹配到，试试 pip list | head -50)"

echo
echo "==============================================================="
echo " 3. 正在跑的服务"
echo "==============================================================="
ps aux | grep -Ei "vllm|llamafactory|gradio|uvicorn|fastapi" | grep -v grep || echo "  (没有相关进程在跑)"

echo
echo "==============================================================="
echo " 4. 监听端口"
echo "==============================================================="
ss -tlnp 2>/dev/null | grep -i listen || netstat -tlnp 2>/dev/null | grep -i listen || echo "  (ss/netstat 都读不到)"

echo
echo "==============================================================="
echo " 5. 资产核对"
echo "==============================================================="
for d in \
  /root/autodl-tmp/output/qwen25-14b-auv-v10-extract \
  /root/autodl-tmp/output/qwen25-14b-auv-v7 \
  /root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master \
  /root/autodl-tmp/models/Qwen2.5-14B-Instruct-AWQ ; do
  if [ -d "$d" ]; then echo "  ✅ $d"; else echo "  ❌ 没有: $d"; fi
done

echo
echo "==============================================================="
echo " 6. LoRA 元信息（rank / alpha 应为 128 / 256）"
echo "==============================================================="
python - <<'PY'
import json, os
for name in ["qwen25-14b-auv-v10-extract", "qwen25-14b-auv-v7"]:
    p = f"/root/autodl-tmp/output/{name}/adapter_config.json"
    if not os.path.exists(p):
        print(f"  ❌ {name}: 没有 adapter_config.json"); continue
    c = json.load(open(p))
    print(f"  {name}")
    print(f"     r={c.get('r')}  alpha={c.get('lora_alpha')}  dropout={c.get('lora_dropout')}")
    print(f"     base={c.get('base_model_name_or_path')}")
PY

echo
echo "==============================================================="
echo " 7. 是否已经开过「自定义服务」"
echo "==============================================================="
echo "  ★ 这个脚本看不到，请到 AutoDL 控制台 → 容器实例 → 自定义服务 里确认"
echo "    记下：已映射的端口号 + 对应公网地址"
