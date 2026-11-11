# AUV 校园助手接入

入口：大厅顶部「AUV 校园助手」。校园建议调用 `persona`，事件分析调用 `extract`。首版只处理用户主动发送的内容，不读取其他同学的聊天消息，不自动发布事件，不上传 GPS。

## 已完成的连接

- 前端：`src/features/ai/AuvAssistantPage.jsx`，`src/data/auvClient.js`。
- 共用后端：`supabase/functions/_shared/auv.js`。先向现有 Supabase 验证用户会话，再调用 AUV；地点必须由原文或手动选点对应到校园地点表。
- 本机预览：Vite 通过 `/api/auv-assistant` 转发，重启 `npm run dev` 即加载后端配置。
- 手机正式版：默认访问现有 Supabase 的 `auv-assistant` Edge Function；也支持 `VITE_AUV_GATEWAY_URL` 指向自行部署的 HTTPS 网关。
- 服务器备用入口：Node 22 及以上，`npm run ai:serve`，默认仅监听本机 8787。部署到自有服务器时用 HTTPS 反向代理到 `/api/auv-assistant`。

## 当前尚需队友处理

2026-10-05 实际检查，交接包地址的 `/v1/models`、`/docs`、`/v1/chat/completions` 均返回 AutoDL HTML 404，聊天未取得模型回复。这与根路径正常返回 JSON 404 不同。需要 AI 同学启动服务、确认端口映射并提供最新 HTTPS 地址。

此电脑只持有项目 Publishable key；没有 Supabase 部署凭据，云端函数尚未由本次工作部署。不能用 Publishable key 部署函数或写入服务器密钥。

## 给 Supabase 服务器同学

把项目里的 `supabase/functions/` 和 `supabase/config.toml` 放到部署工程。函数名为 `auv-assistant`，保留 `verify_jwt = true`；函数内部还会调用 Auth 验证用户。项目自动提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY`。

在 Supabase 后端 Secrets 设置两项（密钥由负责人单独交给你）：

```text
AUV_BASE_URL=AI同学最新的HTTPS服务地址，不带/v1/chat/completions
AUV_API_KEY=单独提供的AUV密钥
```

安装过 Supabase CLI 的服务器电脑可以运行：

```sh
supabase functions deploy auv-assistant --project-ref hkdblizadnkskxslyjyq
```

不关闭用户会话校验。若网关报告 401，先核对登录会话与项目 JWT 配置。可参考 [Supabase 函数鉴权文档](https://supabase.com/docs/guides/functions/auth)。

函数上线后重新构建网页或 APK 即使用云端入口。若自行托管网关，需要将其完整 HTTPS API 地址填入 `VITE_AUV_GATEWAY_URL` 后再构建。

## 密钥和事实范围

用户提供的 AUV 密钥仅写入已被 Git 忽略的 `.env.local` 中的 `AUV_API_KEY`，没有 `VITE_` 前缀；不放进前端、APK、共享文档或压缩包。提供给队友的部署文件不包含密钥。

校园地点表来自 AUV 交接包，66 个 ID 已与当前项目对应；两个车间的标准名称已统一为项目中的「车间」，交接包中的「西车间」「西车间二号」保留为别名。服务信息来自现有项目的官方资料，未知开放时间仍为 null。实时事件由后端用当前用户的权限读取 Supabase：仅非演示、有效时间内、active 的事件；读取失败会明确标注缺少动态数据。

模型地名、严重度和估计分钟数不用于导航或作确定事实。事件分析只生成草稿；应急关键词立即显示联络提示，互助/失物信息提示进入大厅。模型调用有超时、单用户并发限制和每实例短时频率限制；多实例大规模开放时需另接共享限流存储。

## 联调

本地验证：`node --test server/auv.test.mjs`，`npm run build`。这些模拟测试验证鉴权、地点错误、事件分流和旧地址错误处理，不能证明线上模型已经可用。

拿到新地址后：更新本机及 Supabase 的 `AUV_BASE_URL`；登录软件，发送一条校园建议和一条具体地点的事件；查看实际回复、地点卡片和导航动作。不得把模拟测试回复当成真实模型回复。
