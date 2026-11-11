# 四入口校园生活风格 · 2026-10-16

用户本轮明确要求默认效果采用设计图的花朵小猫插画，并将其风格应用到首页、服务、社区。因此本轮将上一版的空封面默认态改为插画默认态；实际账号昵称、用户自选图片、已保存资料继续优先使用。

## 已完成

- 我的：向日葵、小猫默认封面；同图裁切成默认小猫头像；四个私人快捷入口使用统一的彩色贴纸图标。自选头像和封面的保存方式不变，恢复默认会回到插画。
- 首页：按后续反馈恢复铺满屏幕的地图，品牌标识、花朵装饰、AI、消息和搜索入口浮在地图上；不再使用圆角地图卡片，移除“全部地点”等分类框。地图数据、定位、坐标、路线和详情操作继续使用原实现。
- 服务：品牌顶栏、奶油黄课表卡、日历装饰、四色功能卡、AI 入口和官方服务入口。所有点击继续连接原功能。
- 社区：品牌顶栏、插画引导区、四类彩色功能入口及现有近期动态列表；消息铃铛放入页面顶栏随内容滚动。
- 公共呈现：统一奶白、森林绿、珊瑚橙、奶油黄、薄荷绿和浅紫；统一底栏图标、选中胶囊、标题字重、圆角和间距。未新增依赖或改动数据库、AI 和业务接口。

## 插画素材与生成说明

最终素材：[sunflower-cat-cover.png](../../public/assets/personal-space/sunflower-cat-cover.png)，2:1，约 2.4 MiB。封面、默认头像和社区装饰共用并缓存此资源；没有将示例昵称或示例动态写入用户资料。

使用 Codex 内置 `image_gen`，参考用户压缩包内的 `01-我的主页-本人.png`。最终成功请求的提示词：

> Produce ONLY the cover artwork from this reference as a clean standalone wide 2:1 banner, no phone or UI. Same crayon paper style and colors: warm yellow background, coral smiling sunflower on left, large sleepy lavender cat on right, dark green looping vine and tiny daisies. Cat face completely visible in right half, so right-half crop can be used as circular avatar. Full bleed artwork, no UI buttons, no avatar circle, no text except a small optional DAY OFF sticky note. This is an app asset to match the reference illustration closely.

原始输出保留在 Codex 生成目录，软件使用工作区内的副本。

## 验证与边界

- `npm run build` 通过；现有主包大于 500 kB 的警告仍在。
- `personalHome.test.js` 和 `backNavigation.test.js` 共 12 项通过；本轮相关文件空白检查通过。
- 在 `?preview=phone` 逐页查看四个主页面，确认默认封面和头像加载、社区失物入口、服务课表入口、地图搜索和地点详情可用。界面检查没有修改真实资料、发布内容或发起定位授权。
- 演示截图：[当前首页](../screenshots/2026-10-16-home-decoration-no-category.png)。后续地图修复见 [地图全屏与标签恢复](2026-10-16-map-fullscreen-and-hot-refresh.md)。
- 仍为本机装扮；公开主页和跨设备图片同步未接入。本轮未同步 Android 资源、未打包 APK、未做真机验收。

演示地址：`http://127.0.0.1:5173/?preview=phone`。
