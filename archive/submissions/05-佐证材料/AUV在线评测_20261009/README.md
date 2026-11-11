# AUV在线多方法评测证据包

本轮已取得真实在线结果。原地址和受限网络错误保留为历史诊断，不计模型零分。
正式自建任务执行386次，成功回复385次；另完成GSM8K固定随机32题及协议、同题提示词检查。410条计划中的24条基础模型对照因未公告该模型而跳过。

- 平衡事件题类型：71/72。
- 平衡事件题地点ID：36/72。
- GSM8K固定32题：31/32；不是全量分数或排行榜。
- 通用16题原类型匹配10/16，内部复核提示14/16；数值字符串统一后分别12/16、15/16。
- 独立串行完整回复p50 7.12s，p95 7.94s，样本12。

模型列表只公告gpt-3.5-turbo，但extract、persona及任意不存在的model字符串都可返回200。后台权重和LoRA切换未核验。一次无认证头推理请求返回200；这是有限协议检查，不是完整鉴权审计。

自建题包含模板、重复和成对对照；410条计划中有275条不同输入。参考答案未独立二审；扫描训练输入的完全相同字符串为0，近义重叠和公共集污染未审阅。全部原始答案和失败均保存，没有择优重试。

## 主要文件

- deliverables：独立评测报告及佐证材料整合版，DOCX和Word原生导出的PDF。
- deliverables/核验附件、采集包：原佐证材料引用的28个文件，逐文件原样复制；不是本轮新采集的真实用户反馈。
- evidence/document_quality_audit.json：最终9页独立报告与23页整合版的分页和逐页检查记录。
- evidence/original_attachment_manifest.json：原附件路径、大小和SHA256。
- evidence/findings.json：统一最终评分、字段、混淆矩阵、对照、规则基线比较和性能。
- evidence/all_failure_cases.json：所有受测参考字段或协议失败。
- evidence/persona_review.json：资料问答逐条审阅；当前助手审阅，非独立人工打分，人工分数留空。
- evidence/app_postprocess.json：对真实回复执行当前本地地点核对；不是云端或手机端验收。
- runs/20261009_191150_420593：主评测所有请求；快速组单独保存。
- public_benchmark：GSM8K原来源、固定32题及所有回复。
- protocol_runs：4条协议检查及16条同题提示词对照。
- cases.json / manifest.json：输入、参考字段和校验值。

## 复跑

在PowerShell打开本目录，执行 .\启动评测.ps1 -Phase quick 或 -Phase full；密钥隐藏输入，仅存进程内存。每次创建新的时间目录，不覆盖原始记录。完整组最大并发4，默认质量题串行；当前正式执行使用3个并发质量请求，性能组串行隔离。
如需按本次参数复跑，可设置环境变量AUV_API_KEY后执行 bundled Python run_evaluation.py --execute --phase full --interval 0.2 --timeout 120 --workers 3。不要把密钥写入共享配置。
公共样本复跑：设置同一环境变量后执行 run_public_benchmark.py --execute。没有--execute不发请求。协议补充：执行run_protocol_checks.py，含一次无认证头和无效model检查。

## 评分解释

严格JSON与恢复JSON分开；原始字段和楼层统一格式后的字段分别报。未给楼层/等待时间/时间段的期望为null/null/unknown。严重度只检查取值；没有统一严重度分级标准，不报严重度准确率。
通用题数字字符串单独统一格式，不将格式差异说成计算错误；含解释的字符串不自动抽取答案。资料问答关键词检查只做烟雾检查，不能当作事实准确率或人工分数。
p50/p95使用nearest-rank；首个非空content分块为客户端首响应，非服务器内部首token。completion_tokens/s包括网络与排队，非纯GPU解码速度。并发1/2/4各3批，不推断长期可用率或大规模承载能力。
原始全部请求与成功回复两种分母均保存。模板和重复题不独立，描述性区间不可当作泛化置信区间。

## 来源与文档质量

GSM8K来源：https://github.com/openai/grade-school-math，原测试集1319题，seed=20261009固定抽取32题，零样本自定义####答案协议。未产生MMLU、C-Eval、CMMLU或HumanEval成绩。
原Word佐证材料字节保持不变。官方render_docx.py已尝试但缺少LibreOffice；开放权限后Word16.0正常，最终文档由Word原生导出PDF，并逐页查看图像。包内Word样式、原有图片和不涉及编辑的ZIP部件保持。
佐证材料中的模型结果不能代替新APK、真实用户反馈或云端数据库验收。
