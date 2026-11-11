# OurCampus 1.12 · 地图、赛道文档与新版开屏

## 来源与改动

- 共享仓库 `zhchunyu/Chun-Yu`：2026-10-11 获取 `origin/main`，提交 `1ad0779`。选择合入地图名称、地点坐标与最新赛事规则，保留本机聊天、失物招领、餐厅照片、课表和推送实现。
- 地点目录从 66 个增加到 73 个，新增网球场、静园、地下通道、大明湖、人才公寓、生态监测中心、工程中心，并保留旧名称检索别名及稳定 ID。实际净增 7 个。
- 61 个地点直接读取队友提交的 GCJ-02 坐标，包含腾讯 POI 和底图人工点击记录。本次未进行实地测量复核，不能保证每点测量误差上限。
- 12 个未采集地点按示意图与附近控制点估算。原示意图错放的医学院坐标不用于修正邻近地点，防止传播较大的误差。
- 默认 17 级，缩放范围 14–20。按队友方案将校园标注矩形扩为约 5 倍面积，南侧额外避让底部菜单；计入南侧留白后的面积比例约 17.7%。这是可移动地理范围的比例，手机屏幕中建筑占比随缩放变化。
- 边界使用 [腾讯地图 GL 原生 boundary](https://lbs.qq.com/javascript_gl/doc/mapoptions.html)，浏览器读取的实际配置为南 37.41529701977016、北 37.43009876987372、西 112.56960968542592、东 112.60047080315384。
- 开屏替换为用户提供的新视频 `1f1401e40cfccf6cf1557ad74d6c52c6.mp4`，H.264、576×1280、4 秒、59,646 字节。静音保持比例播放，同时加载界面、地图与账号；失败仍有静态图标回退。
- README、协作说明与当前赛事规则统一采用场景创新赛道要求；保留附件 1 / 附件 2 原件及提取文本作为依据。

## 尚需补充的人工坐标

| 地点 ID | 当前名称 |
| --- | --- |
| hospital | 校医院 |
| old-north-gate | 旧北门 |
| chongwen-building | 博雅楼 |
| family-compound | 家属院 |
| workshop-west-1 | 车间（西） |
| workshop-west-2 | 车间（北） |
| physical-chemistry-building | 格物楼 |
| animal-science-building | 生物楼 |
| graduate-dormitory | 研究生宿舍 |
| dining-center | 饮食中心 |
| underpass | 地下通道 |
| apartment-21 | 21号公寓楼 |

补齐后按 ID 写入 `src/data/tencentPoiPositions.js`，不改变既有 ID。采集建筑中心，记录来源、采集时间，并检查相邻建筑没有混淆。

## 云端同步

数据库同学先备份，再执行 `docs/supabase/13-campus-map-calibration.sql`，然后重新部署 `auv-assistant` 和 `campus-information-worker`，同步本次修改的共用地点目录与展示名称。

SQL 可重复执行，保留用户、聊天、评价、开放状态、人流和用户反馈；不自动提升坐标核验标志。本次未修改线上数据库和函数部署。

## 打包结果

- 网页生产构建和 Capacitor Android 同步成功；复用电脑已有 SDK、JDK 和 Gradle 缓存，离线 Android 构建成功。
- 包名 `cn.edu.sxau.campustwin`，版本 1.12，versionCode 13；签名校验成功，证书与此前本机 1.11 APK 相同。
- APK 中新版视频与用户提供文件字节一致，APK 内 JS 与本次 dist 构建一致。
- 手机浏览器预览确认新版视频正常播放（4 秒竖屏），进入腾讯地图后默认 17 级，原生边界非空，未捕获控制台错误。尚未在实际手机上安装本次 APK。
- APK：`docs/apk/OurCampus-1.12-地图校准与新版开屏.apk`，46,897,205 字节。
- SHA-256：`823a2d37327a87ba258915884c74c87313eed7a5deb3290ec576b4c08f1a3da6`。
