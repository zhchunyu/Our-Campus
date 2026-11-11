#!/bin/bash
# ==============================================================================
#  路 A：LLaMA-Factory 自带 OpenAI 兼容 API
#
#  ★ 为什么先用这个：
#    1. 不用装 vLLM —— 训练环境现成，今天就能通
#    2. 用 nf4 加载，与训练时**完全一致** ⇒ 没有 AWQ 的精度损失，复测风险最低
#    3. 对外同样是 OpenAI 兼容接口，队友的代码不用改
#
#  代价：并发吞吐比 vLLM 低（演示/联调够用；要扛高并发再升路 B）
#
#  用法：  bash start_api.sh
#  停止：  Ctrl+C
#  换端口：API_PORT=6007 bash start_api.sh
# ==============================================================================
set -e

# ------------------------------ 配置区 ------------------------------
PORT=${API_PORT:-6006}                 # ★ AutoDL 自定义服务默认映射 6006

# ★★★ API Key —— 服务是公网公开的，这是唯一门锁，必须改成长随机串
#   三种设置方式（优先级从高到低）：
#     ① 命令行传：  API_KEY="auv-xxx" bash start_api.sh
#     ② 环境变量：  export API_KEY="auv-xxx" && bash start_api.sh
#     ③ 直接改下面这一行的默认值
#   生成一个强 Key： python -c "import secrets;print('auv-'+secrets.token_urlsafe(32))"
API_KEY="${API_KEY:-auv-CHANGE-ME-2026}"

BASE=/root/autodl-tmp/models/models/qwen--Qwen2.5-14B-Instruct/snapshots/master
LORA_EXTRACT=/root/autodl-tmp/output/qwen25-14b-auv-v10-extract
LORA_PERSONA=/root/autodl-tmp/output/qwen25-14b-auv-v7

# ★ 先只挂一个适配器打通链路（最稳）。两个都要挂见文件末尾说明。
ADAPTER="$LORA_EXTRACT"
# --------------------------------------------------------------------

export API_HOST=0.0.0.0
export API_PORT="$PORT"
export API_KEY="$API_KEY"

echo "==============================================================="
echo " 路 A：LLaMA-Factory API"
echo "==============================================================="
command -v llamafactory-cli >/dev/null 2>&1 \
  || { echo "❌ 找不到 llamafactory-cli，确认环境（WebUI 能开就说明有，检查 PATH）"; exit 1; }
echo "  ✅ $(command -v llamafactory-cli)"

python -c "import torch; print('  torch', torch.__version__, '| cuda', torch.version.cuda)" 2>/dev/null || true
python -c "import bitsandbytes; print('  ✅ bitsandbytes（nf4 量化要用）')" 2>/dev/null \
  || echo "  ⚠️  没装 bitsandbytes —— nf4 加载会失败"

for d in "$BASE" "$ADAPTER"; do
  [ -d "$d" ] && echo "  ✅ $d" || { echo "  ❌ 缺失: $d"; exit 1; }
done

echo
echo "  端口   : $PORT"
echo "  适配器 : $ADAPTER"
echo "  鉴权   : Bearer ${API_KEY:0:8}****"
echo "  接口   : POST /v1/chat/completions   (OpenAI 兼容)"
echo

exec llamafactory-cli api \
  --model_name_or_path "$BASE" \
  --template qwen \
  --finetuning_type lora \
  --adapter_name_or_path "$ADAPTER" \
  --quantization_bit 4 \
  --infer_backend huggingface

# ==============================================================================
#  ★ 几个可能踩的坑
#
#  1) 参数名对不上？
#     LLaMA-Factory 版本间参数名有差异，先跑：
#       llamafactory-cli api --help
#     重点确认：--adapter_name_or_path / --quantization_bit / --infer_backend
#
#  2) 两个 LoRA 都要挂？
#     先试列表形式（部分版本支持，请求里 model 填适配器名来选）：
#       --adapter_name_or_path "$LORA_EXTRACT" "$LORA_PERSONA"
#     不支持就起两个进程（各占约 10 GB，32G 卡放得下）：
#       API_PORT=6006 ... --adapter_name_or_path "$LORA_EXTRACT" &
#       API_PORT=6007 ... --adapter_name_or_path "$LORA_PERSONA" &
#     ★ 两个进程要在两个终端 / 或用 nohup，且各映射一个自定义服务端口。
#
#  3) 显存不够？
#     nf4 的 14B 约 10 GB，32G 卡不会不够。真不够就确认 --quantization_bit 4 有没有生效。
#
#  4) 请求里的 model 填什么？
#     单适配器时填什么都行（一般填 adapter 名或路径）；多适配器时填适配器名。
# ==============================================================================
