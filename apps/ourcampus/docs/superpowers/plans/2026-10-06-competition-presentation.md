# 比赛展示中的校名处理

## 范围

将应用内的本校名称、简称与校区称呼改成 OurCampus、校园、本校区。保留地点 ID、经纬度、账号、原始聊天记录和路线功能。旧文档与旧安装包保留。

## 已完成

- 固定界面：地图抬头、登录、地点反馈、课表导入提示、服务简介改为中性名称。
- 腾讯地图：依据官方 VectorBaseMap 配置保留 base、building2d、arrow，关闭原生 POI 与道路文字；由现有 66 个地点坐标生成可点击 MultiLabel。保留腾讯版权和审图号。
- 地点详情卡片：校园名称与腾讯返回的地点文字进行显示处理；建筑名称、反馈与路线按钮保留。
- 动态内容：本地旧地点描述、校园动态、聊天、AI、失物招领、评价、反馈、课表课程与路线指引在显示时替换本校名称，不批量修改服务器记录。
- 外链：比赛展示隐藏本校官网、地图来源和学校虚拟校园入口。
- 地图控件：地图画布建立独立层叠上下文，防止腾讯 z-index 1000 的透明层遮挡缩放按钮；缩放级别使用 SDK 文档中的 zoom 事件更新。
- 备用校园引导图：已目视检查，图像本身没有校名，无需修改原图。
- 安卓版本更新至 1.6 / versionCode 7，保留原应用 ID，便于覆盖安装。

## 实际检查

- npm run build 成功；原有大文件体积提示仍存在。
- 浏览器确认学校底图文字不再显示，招待所和明德楼标签可打开匿名详情卡片，地点页面保持 66 处地点。
- 浏览器确认放大按钮将地图从 15.0 级调整至 16.0 级；课表页面保留原有导入结果。
- Capacitor sync 成功，使用本机已有 SDK 和 JDK 离线 assembleDebug 成功，没有安装额外依赖。
- apksigner 检查通过，APK v2 签名有效。
- 产物：docs/apk/OurCampus-1.6-比赛版.apk；效果图：docs/screenshots/2026-10-06-competition-map.png。
- 未运行或新增测试；未在实体手机上检查本次 APK。

## 边界

比赛开关集中在 src/data/campusPresentation.js。第三方应用（例如跳转后的腾讯地图导航）、用户上传的照片与原始课表文件中的文字不受应用内显示处理控制。本次不改变定位坐标，也不宣称校园在地理上不可辨认。

腾讯接口依据：https://lbs.qq.com/webApi/javascriptGL/glDoc/docIndexMap（VectorBaseMap）与 https://lbs.qq.com/webApi/javascriptGL/glDoc/glDocLabel（MultiLabel）。
