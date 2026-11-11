# OurCampus 1.19 图片与个人页交接

实施与服务器部署：2026-10-26；验证记录更新：2026-10-30。开发版本 1.19 / versionCode 20，包名 cn.edu.sxau.campustwin。

## 当前状态

社区图片与精简个人页已实施，生产迁移 `community_post_images` 已于 10 月 26 日部署。线上发布版本仍为 1.18 / 19；本轮未生成或上传 1.19 APK，也未发布 versionCode 20 的版本元数据。已安装 App 必须安装新的同签名 APK 才能使用客户端改动。

源码已推送至 `codex/profile-avatars-app-updates`，功能提交 `cf8dd57`，见 [PR #4](https://github.com/zhchunyu/Our-Campus/pull/4)。请从该分支取得本轮代码；main 中仍是较早的应用目录版本。

## 改动与权限

校园聊天最多附三张照片，可只发照片；校园动态与失物发布保留标题、说明，并可附三张照片。支持 JPG/PNG/WebP，单张输入不超过 10 MB；设备端重编码为 JPEG，最长边最多 1600px，上传对象不超过 5 MB。选图后可移除，上传失败保留草稿及已完成上传的引用，重试复用原路径；账号变化清空图片草稿。

图片存入私有 `post-images`，查看权限跟随消息或上报，未附图的旧记录与文字客户端继续可用。展示链接有效期 300 秒：撤回后其他账号不能重新申请链接，但此前取得的链接在到期前仍可能有效，并非立即吊销。图片用于展示，原有文字 AI 不识别图片内容。

个人页移除重复占位内容，保留课表、发布、收藏、路线四快捷；收藏路线按需展开，反馈、订阅、设置及管理员功能收进紧凑菜单。管理员入口继续按原权限显示。

## 已完成验证

- 相关 10 个测试文件 69/69 通过。全前端 398 项中 387 通过、11 项为既有失败：campusReducer(3)、campus(3)、mapScene(1)、auvCatalog(2)、locations(1)、routeGraph(1)。`npm run build` 通过，仅有既有体积警告。
- 生产实际执行 [SQL 事务回归](../supabase/18-community-images-regression.sql) 通过；回滚后合成 Auth 用户与 Storage fixture 均为 0。安全顾问未发现新增相关项，既有无关警告仍在。
- 浏览器 320px/390px 个人页无横向溢出，收藏路线关闭后恢复焦点；真实文件选择器选取三张 PNG 后成功重编码为 JPEG，移除照片、切换账号清空草稿通过。
- GalleryPortal 全屏覆盖、下一张、Esc 关闭及焦点恢复通过；图库与父层同时卸载后 root 的 inert 恢复。真实 Hall 界面纯图草稿使发送按钮可用，动态和失物入口均有选图控件。
- 独立复核末轮 P1/P2 均已修复。详见 [验证记录](../reviews/2026-10-30-community-images-and-me.md)。

尚未使用真实登录账号完成图片上传/发布/跨账号查看，未执行手机覆盖安装；本轮未测试 AI。这些不由 SQL 合成数据和浏览器组件验证替代。

## 原签名构建与发布

截至 10 月 30 日，本机及仓库审计仍未找到可用的原签名材料。已核查改名后的 [Our-Campus 仓库](https://github.com/zhchunyu/Our-Campus)、13 个 refs、历史记录和全部 3 个 Releases / 31 个 assets，未找到 keystore 或 `signing.local.properties`；仓库只有四项空值的 `android/signing.example.properties`，没有 Actions workflow。`signing.local.properties` 与 `*.keystore` 在忽略规则中。以上结果不代表 GitHub Secrets 为空，也不排除原打包电脑留有材料。

v1.18 交付记录使用历史 Android Debug 证书，原证书 SHA-256 为 `501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0`；本机现有 debug 证书与其不匹配。应使用匹配原证书的 keystore，按既有 `npm run android:release` 流程构建；不要用新生成的 debug keystore 替代，以免无法覆盖安装。

发布前依次完成：

1. 核验 APK 包名、版本 1.19/20、非 debuggable、原签名、SHA-256 与字节数。
2. 在已装 1.18 的手机上覆盖安装，确认账号与本机数据保留；用真实登录账号验收聊天纯图/混合消息、动态与失物附图、其他账号可见性、撤回和失败重试。
3. 上传至 `app-releases/android/OurCampus-1.19.apk`，再新增 `app_releases` versionCode 20 的 published 记录。不得覆盖 1.18 对象或记录，不提前发出没有对应 APK 的更新通知。
