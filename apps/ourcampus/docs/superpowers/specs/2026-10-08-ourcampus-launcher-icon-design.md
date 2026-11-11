# OurCampus 桌面图标

用户已选择：黑底、亮白金色「OC」，桌面名称 OurCampus。

- 字体使用与开机动画一致的 Georgia 衬线风格，大写 OC 居中，不加小字。
- 原始稿为 1024 像素 PNG；用已有 Pillow 生成各密度前景、旧版方形及圆形图标。
- 安卓自适应图标使用 108dp 前景和独立黑色背景，字样置于中央安全区域；Android 13 提供单色图层。
- 同步 Capacitor appName、安卓应用及 Activity 标题、网页标题。递增到 1.9 / versionCode 10，沿用既有包名和签名。
- 验证仅做图像尺寸/裁切预览、生产构建、APK 资源及签名检查；不新增或运行测试。

规范参考：[Android 自适应图标](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)。
