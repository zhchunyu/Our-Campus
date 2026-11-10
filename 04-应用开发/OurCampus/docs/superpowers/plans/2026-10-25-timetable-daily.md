# 每日课表 Implementation Plan

> For agentic workers: 使用分工实施并独立审查，禁止修改685a的原有脏工作区。

**Goal:** 每日快速看下一课，修复打开回到第一周；用户已授权自主确定呈现方式。

**Architecture:** 纯日历/课程函数与账号查看偏好负责可测试的数据规则；每日页面/导航hook负责状态与交互；保留本机存储与既有云JSON兼容边界。

**Tech Stack:** React19、现有Vite/Vitest、Intl Asia/Shanghai；不加新依赖或数据库迁移。

## Task 1：日期与下一课

Files: src/data/timetable.js、timetable.test.js、timetableImport.js、timetableImport.test.js。

- [x] 先以固定2026-10-25时钟复现默认周日日期返回1。
- [x] 为以下接口写有意义失败用例，运行 npx vitest run src/data/timetable.test.js src/data/timetableImport.test.js 确认RED，再实现GREEN。
- [x] getShanghaiCalendar(now=new Date()) -> {date,weekday,minutes}；getMaxTeachingWeek(timetable)；currentTeachingWeek(timetable,now)保留原调用并统一有效范围。
- [x] calendarDateForDay(timetable,week,weekday)返回YYYY-MM-DD或null；calibrateTimetable(timetable,currentWeek,now)返回复用termStart/dateConfirmed的已确认课表。
- [x] getNextClassState(timetable,now) -> {status:'unconfirmed'|'active'|'upcoming'|'empty',date:string|null,courses:[]}，同时上课的多门并列；只查询真实日历未结束课程。
- [x] loadTimetableView(userId,timetable,now)->{week,weekday}：已校准默认今天；未校准恢复账号+学期的查看位置。saveTimetableView(userId,timetable,{week,weekday})校验范围，存储失败不阻断浏览。
- [x] 新导入termStart为空、dateConfirmed=false，保留已有存储。

## Task 2：每日界面和导航

Files: src/features/timetable/TimetablePage.jsx、timetable.css、必要useTimetableNavigation.js与测试、每日内容组件测试。

- [x] 先用真实时间线/导航回归证明旧问题，再实现下一课卡、当天时间线、七天日期条、当前周/回今天、周次选择及前后台刷新。
- [x] 导航与数据接口按Task1约定；若需更名，先向root同步，避免并发接口漂移。
- [x] 校准接受本周周次或有效周一；保存课表成功后立即刷新定位，错误可见且不假称成功。未校准不宣称今天课程。
- [x] 不打断手动浏览，预览取消恢复原位置；切号和关闭页忽略迟到回调；Esc/Android返回与焦点逻辑保持一致。
- [x] 已有可选云回调兼容，但当前App不新增整套云模块。空态、本机/云端说明真实。

## Task 3：独立验证与交付

- [x] 根代理复跑新测试和完整前端，失败与11项发行基线对照；npm run build通过。
- [x] 独立审查日期、时区、课程边界、未知状态、账号隔离及UI窄屏可用性。
- [x] 记录Supabase只读检查：campus_timetables=0，无需数据修复或RLS放宽。
- [x] 更新现有待打包修复分支和PR，附新课表说明；不把源码提交当作手机已升级。

## 最终证据

课表5文件50项通过；完整前端370项中359通过、11项既有失败；生产构建通过，独立审查无剩余P1/P2，浏览器320/390px及重开/校准实操通过。详见docs/reviews/2026-10-25-timetable-daily.md。

- [ ] 原签名APK与真实手机安装验收：尚未执行，由队友在原打包环境接手；源码提交不等于手机已升级。
