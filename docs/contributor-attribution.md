# Li-Jun / ldgsad 贡献者归属核验（2026-11-10）

本报告仅记录只读调查结果，未改写提交历史、账户邮箱、仓库权限或任何提交作者。

## 已确认身份

GitHub 公开用户资料：登录名 `ldgsad`，显示名 `Li-Jun`，用户编号 `222528426`。资料入口：https://github.com/ldgsad 。

仓库已更名为 https://github.com/zhchunyu/Our-Campus ，默认分支为 `main`。

## 实际原因

调查时的公开 contributors API 返回：zhchunyu 22 条、匿名 wes 2 条、henji6 1 条。没有 ldgsad，并非前 100 名限制。

1. main 中两条旧提交使用 `wes <johndoe@3436427059.com>`，GitHub 当前把它们列作匿名，而不是关联到 ldgsad：
   - `530cfff2cc82b04319630acf3760268036655d24`：1.7 源码、安卓工程与文档。
   - `61438024a2b14058fd91af2b584cd1ad86ef7f75`：1.11 图标开屏、校园推送与餐厅评价。
2. 新的真实 ldgsad 提交邮箱已正确映射到账号，但还在非默认分支：
   - `f4fcc2ddb812a9ae915611cc09b651466ed72620`：发布 1.19 主动通知；GitHub commit API 的 author/committer 都识别为 ldgsad。
   - `2dcdf1d86b4431545ef87b465a3b35dc6bd4ab6b`：1.19 发布交接记录。
3. PR #10 仍未合并，目标是开发分支 codex/profile-avatars-app-updates，单独合并到这条开发分支仍不满足默认分支统计条件。
4. PR #9 是 ldgsad 本人提交的旧署名修复，仍未合并且与 main 冲突。其正文明确认领 1.16/1.18 两条：
   - `369b93d` → `4a37386`
   - `962727b` → `9286ab3`
   修复前后最终文件树一致，声明保留其他人的作者和日期。这个认领并不逐条证明 main 中 1.7/1.11 两条是谁完成，不宜把所有旧 wes 提交一律改归属。

PR 证据：
- https://github.com/zhchunyu/Our-Campus/pull/9
- https://github.com/zhchunyu/Our-Campus/pull/10
- https://github.com/zhchunyu/Our-Campus/commit/f4fcc2ddb812a9ae915611cc09b651466ed72620

## 建议修复

将 1.19 真实作者提交保留为祖先，处理新旧应用目录迁移冲突后正常合并进 main。不要 squash 掉作者信息、伪造共同作者或强制重写公共历史。合并后先核对 main 的祖先关系和 GitHub commit API 识别，再看贡献者统计是否刷新；统计可能延迟，不应承诺瞬时出现。

旧历史若要进一步精确恢复，应由 Li-Jun 确认 1.7/1.11 两条是否也由他完成。已有 PR #9 的两条认领可作为明确证据，但不要扩大到没有证明的提交。

`.mailmap` 可改善本地 Git 显示，但未找到 GitHub 官方当前支持它修正贡献者图的文档。官方社区支持答复称未支持，2026-02 仍有相同反馈，不能将加 mailmap 宣称为 GitHub 统计已修复。仅供本地显示的严格姓名+邮箱映射候选如下，未添加到仓库：

```
ldgsad <222528426+ldgsad@users.noreply.github.com> wes <johndoe@3436427059.com>
```

## 官方规则

GitHub 文档明确：未进入默认分支的提交不会出现在仓库贡献者图；提交邮箱需关联到账号；合并提交和空提交不作为图中的贡献。原提交可由 merge 保留为祖先，统计刷新与真实作者归属应分别验证。

- https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors
- https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions
- https://git-scm.com/docs/gitmailmap
- https://github.com/orgs/community/discussions/22518

以上为本次调查时点状态；主代理正在处理发布与合并，后续状态应以最终远端核验为准。


## 本轮整合方式

整合分支通过普通merge保留1.19的 f4fcc2d 与2dcdf1d原提交，并与main目录迁移合并；不强推或改写旧作者。main发布后由祖先关系和GitHub作者查询复核，侧栏刷新单独观察。
