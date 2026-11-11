# 队友图标与开屏视频接入

用户已指定本次 MP4 和图标压缩包，替换当前桌面图标与开屏动画并重新打包。

- [x] 读取压缩包与视频信息：图标原稿 1024 × 1024；视频 H.264 / AAC，1280 × 720，5.035 秒、约 188 KB。
- [x] 保存原始图标及视频，图标生成脚本改为读取用户原稿，输出 Android 五档密度、圆形、自适应和主题单色资源。
- [x] HTML 启动层静音播放本地视频，保持原视频比例；React、地图和账号同时加载。视频结束且加载完成后退出；播放失败显示静态新图标，减少动态效果时直接使用静态图标；最多等待 9 秒。
- [x] 保留原有 Android 包名和签名，递增至 1.11 / versionCode 12；更新 README。
- [x] 生产构建、同步 Android、生成 APK，检查签名、版本及打包素材，并记录证据。

复用现有 Pillow、Vite、Capacitor、Android SDK 和 JDK；只转换图标资源尺寸，不重新绘制用户图案。不改地图、数据库或其他功能。视频静音，不使用额外视频依赖，不增加或运行测试。

## 交付记录

- Node 语法检查、`npm run build`、`npx cap sync android`、离线 Gradle `assembleDebug` 成功；Android 构建用时 7 秒。
- 浏览器手机预览实际显示视频播放画面，随后退出到默认 17 级地图；未在实体安卓手机上验证。
- APK 版本 1.11 / 12，名称 OurCampus，包名 `cn.edu.sxau.campustwin`；apksigner 校验成功，证书 SHA256 与既有版本一致。
- APK 内视频与用户原始 MP4 字节完全相同；20 个 Android 图标资源与新生成资源的像素相同；HTML 及网页品牌素材与本次构建相同。
- 文件：`docs/apk/OurCampus-1.11-队友图标与开屏.apk`，27,302,957 字节。
- APK SHA256：`a2f79ec1d8e7d1dc232838f25b278b7922997c6af4e7e45747908e90f2270897`。
- 开屏截图：`docs/screenshots/2026-10-08-new-startup-phone.png`；图标预览：`docs/screenshots/ourcampus-launcher-icon-preview.png`。
