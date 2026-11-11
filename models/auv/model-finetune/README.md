# 模型微调数据准备与训练指南

## 目录结构

```
model-finetune/
├── data/
│   ├── train.json          # 手工标注训练数据（30条）
│   ├── test.json           # 测试数据（10条）
│   ├── dataset_info.json   # LLaMA-Factory 数据集配置
│   └── augment_data.py     # 数据扩增脚本
├── train_config.yaml       # LLaMA-Factory 训练配置
└── README.md               # 本文件
```

## 一、数据扩增（先把数据量搞上去）

### 在本地运行扩增脚本

```bash
cd models/auv/model-finetune/data
python augment_data.py --num 500
```

这会基于 30 条手工数据，用模板扩增到 530 条（30 手工 + 500 扩增）。

如果你想要更多，改 `--num` 参数：
```bash
python augment_data.py --num 800 --output big_train.json
```

### 扩增后更新 dataset_info.json

打开 `data/dataset_info.json`，把 `campus_event_extraction` 的 `file_name` 改成你生成的文件名：
```json
"campus_event_extraction": {
  "file_name": "augmented_train.json",
  ...
}
```

## 二、上传到 AutoDL 服务器

### 方式一：JupyterLab 网页上传（最简单）

1. 打开 JupyterLab
2. 左侧文件浏览器导航到 `/root/autodl-tmp/`
3. 新建 `data` 文件夹
4. 把 `train.json`（或扩增后的 `augmented_train.json`）、`test.json`、`dataset_info.json` 直接拖进去

### 方式二：SCP 命令上传

```bash
# 上传整个 data 目录
scp -r data/ root@你的SSH地址:/root/autodl-tmp/data/
scp train_config.yaml root@你的SSH地址:/root/autodl-tmp/
```

## 三、开始训练

### 1. 确认模型路径

模型下载到了 `/root/autodl-tmp/models/qwen/Qwen2.5-14B-Instruct` 对吧？如果路径不一样，修改 `train_config.yaml` 里的 `model_name_or_path`。

### 2. 确认数据路径

数据应该在 `/root/autodl-tmp/data/` 目录下。如果路径不一样，修改 `train_config.yaml` 里的 `dataset_dir`。

### 3. 启动训练

```bash
cd /root/autodl-tmp
llamafactory-cli train train_config.yaml
```

### 4. 看训练过程

训练过程中会打印 loss（损失值），loss 一直在下降就是正常的。

大概要跑 **4~8 小时**（取决于数据量和 batch size）。

### 5. 训练完了在哪找结果

输出在 `/root/autodl-tmp/output/qwen25-14b-event-v1/` 目录下，里面的 LoRA 权重就是训练成果。

## 四、验证效果（训练完之后）

### 方式一：LLaMA-Factory 推理测试

```bash
llamafactory-cli webchat \
  --model_name_or_path /root/autodl-tmp/models/qwen/Qwen2.5-14B-Instruct \
  --adapter_name_or_path /root/autodl-tmp/output/qwen25-14b-event-v1 \
  --template qwen \
  --finetuning_type lora
```

会启动一个 Web 界面，可以直接对话测试效果。

### 方式二：用 vLLM 部署成 API

```bash
vllm serve /root/autodl-tmp/models/qwen/Qwen2.5-14B-Instruct \
  --enable-lora \
  --lora-models campus-event=/root/autodl-tmp/output/qwen25-14b-event-v1 \
  --port 8000
```

然后就可以像调用 OpenAI API 一样调用了：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="xxx")
response = client.chat.completions.create(
    model="campus-event",
    messages=[
        {"role": "system", "content": "你是校园事件分析助手..."},
        {"role": "user", "content": "一食堂二楼排队老长了，大概要等20分钟"}
    ]
)
print(response.choices[0].message.content)
```

## 五、调参建议

如果效果不好，可以试试调整这些参数：

| 参数 | 当前值 | 如果欠拟合（效果不好） | 如果过拟合（训练好测试差） |
|---|---|---|---|
| `lora_rank` | 64 | 调到 128 | 降到 32 |
| `learning_rate` | 1e-4 | 调到 2e-4 | 降到 5e-5 |
| `num_train_epochs` | 3 | 加到 5 | 降到 2 |
| `per_device_train_batch_size` | 2 | 加到 4（显存够的话） | 不用变 |

## 六、显存不够怎么办

如果训练时报 OOM（显存不足）：

1. 降低 `per_device_train_batch_size` 到 1
2. 增大 `gradient_accumulation_steps` 到 16（等效 batch 不变）
3. 降低 `lora_rank` 到 32
4. 开 `gradient_checkpointing: true`（已经开了）

## 七、成本控制

- 无卡模式：准备数据、写代码、上传下载
- 有卡模式：只在训练和推理的时候用
- **训练完立刻关机！** LoRA 权重存在数据盘里，不会丢
