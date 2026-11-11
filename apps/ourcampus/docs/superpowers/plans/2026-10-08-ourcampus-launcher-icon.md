# OurCampus 桌面图标 Implementation Plan

**Goal:** 将已批准的黑底白金 OC 图标和 OurCampus 名称打入可升级 APK。

**Architecture:** 复用安卓 ic_launcher 资源入口与现有构建工具。新增一个 Pillow 生成脚本及品牌原稿，输出透明前景、单色前景、方形和圆形图标；复用现有 Capacitor 工程。

**Tech Stack:** Python/Pillow、Android XML、Capacitor、Gradle。

## 改动与交付

- [x] 新增 `scripts/generate-launcher-icons.py`。运行该脚本生成 `public/assets/brand/` 原稿及 `android/app/src/main/res/mipmap-*/ic_launcher*.png`。
- [x] 调整 `res/values/ic_launcher_background.xml`、原 drawable 前景/背景及 v33 自适应资源；设置黑色背景和单色字样。
- [x] 将 `capacitor.config.json` 的 appName、`res/values/strings.xml` 的两个标题和 `index.html` 标题设为 OurCampus；build.gradle 版本改为 1.9 / 10。
- [x] 查看方形、圆形、48px 预览，检查透明层和安全区尺寸。
- [x] 运行 `npm run build`、`npx cap sync android`、`gradlew.bat assembleDebug`，均 exit 0。
- [x] 用既有 Build Tools 的 apksigner 和 aapt 检查签名、应用名称、版本和图标；复制至 `docs/apk/OurCampus-1.9-专属图标.apk`，更新 README 安装链接。

用户已授权直接执行本方案；不调用测试套件、不部署线上服务、不上传仓库。

## 交付证据

- aapt 读出应用和 MainActivity 名称均为 OurCampus、版本 1.9 / 10。
- apksigner 校验成功，证书 SHA256 `501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0`，与 1.8 相同。
- APK 内图标像素与新资源一致；应用 JS 与最新 dist 一致。
- APK 大小 25,481,120 字节；文件 SHA256 `2d40578544fdcb59e164a5423061cc66a004da178ed5a5e277c97c18fc2ddeac`。
- 真机桌面显示由用户覆盖安装后确认。
