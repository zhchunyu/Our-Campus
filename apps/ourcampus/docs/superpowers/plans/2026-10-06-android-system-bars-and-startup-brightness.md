# 安卓顶部背景、默认地图级别及开机字体

## 问题证据

用户的 APK 截图顶部是黑色状态栏区域，电量图标仍在其中。正常应用主题复用了黑色 launch_background，Capacitor SystemBars 又以 windowBackground 的颜色绘制原生安全区域，进入地图后未切回正常界面颜色。

## 修改

- 正常 AppTheme.NoActionBar 的 windowBackground 改成独立 app_background 颜色 #F7F7F1。原生启动主题继续使用黑色 launch_background。
- MainActivity 为初始动画保持黑色窗口和 WebView；Android 35 以下使用透明系统栏，避免旧版状态栏保留不透明黑色。
- 使用已安装的 @capacitor/core SystemBars，在启动时配置 DARK（浅色图标），动画退出时切为 LIGHT（深色图标），并由原生插件恢复正常窗口背景。不隐藏时间、电量或手势栏。
- 明确 viewport-fit=cover 初始提示，保持已有原生/CSS 安全区域处理。
- 腾讯地图初始级别和回到校区的级别统一改为 17。
- OurCampus 白金渐变调亮，增加温和光晕；字形、渐显时长和并行加载逻辑保留。
- 安卓版本 1.7 / versionCode 8，原应用 ID 保留。

## 检查和产物

- 生产构建、Capacitor 同步和离线 Android assembleDebug 成功。
- apksigner 检查通过，v2 签名有效。
- 浏览器确认启动动画文字与首页 17.0 级；截图位于 docs/screenshots/2026-10-06-startup-brighter.png 和 2026-10-06-map-default-17.png。
- 安装包：docs/apk/OurCampus-1.7-显示优化.apk。
- 未新增或运行测试；没有下载新依赖。安卓状态栏必须在用户手机上安装本次新版后确认，浏览器预览不能代替原生状态栏检查。
- GitHub 上传按用户暂停要求保持暂停，尚未提交或推送。

参考：已安装的 capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java；官方文档 https://capacitorjs.com/docs/apis/system-bars 。
