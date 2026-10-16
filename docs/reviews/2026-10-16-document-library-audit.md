# docs 外部文档归档审查

日期：2026-10-16。范围：「外部」按本仓库内 `docs/` 之外的项目文档理解；未扫描仓库外个人文件。依据为文档用途、目录、历史日期及当前代码结构，本次不重新验证所有文档记载的技术行为。

## 结论与处理

| 原位置/类别 | 归属决定 | 本次处理 |
|---|---|---|
| 根目录 `BUG修复记录.md` | 属于历史排查证据，应入 `docs/reviews/` | 移至 [2026-10-05 后台 BUG 修复](2026-10-05-backend-bug-fixes.md)，保留原内容并标明历史范围 |
| `apps/agent-service/HANDOFF.md` | 旧任务原型交接，应入历史库 | 正文移至 [2026-10-14 Agent 服务交接](2026-10-14-agent-service-handoff.md)，原路径保留跳转；补充旧链路退役提示 |
| 根目录 `AGENTS.md`、`CONTRIBUTING.md` | 仓库协作与执行入口 | 保留原位，避免规则入口失效 |
| 根目录 `CHANGELOG.md` | 全项目、跨版本的实际变更记录 | 保留原位，从文档库链接 |
| 手机、AI、Agent、Call Phone 模块 README 与 `LOCAL-DEV.md` | 与代码一起维护的启动/部署/契约入口 | 保留原位，从文档库索引，不整份复制 |
| `tools/app-update`、`tools/assets` README | 工具的使用说明 | 保留工具旁 |
| `resources/branding`、`resources/icons` 及两处 `static/app-icons` README | 素材来源、构建与同步约束 | 保留资源旁；两处图标目录用途不同，不能因文字类似直接合并目录 |
| 手机 `device-readiness`、`assets`、`mobile-pet` 和 `portable-pet-overlay` README | 可复用模块及原生插件说明 | 保留组件旁，便于独立迁移时一起携带 |
| 桌宠 `elf-v3-prompts.md` | 素材制作来源 | 保留素材旁，不作为产品需求或实现状态记录 |
| Agent `security/README.md` 与许可证 | 策略来源与随附许可 | 保留配置旁 |
| `.agents/**/SKILL.md`、服务内运行技能、第三方模板教程与许可证 | 工具发现入口、运行资源或上游文件 | 保留原位；本次不修改未提交技能，也不把上游说明当成本项目文档归档 |
| 后端 LiveKit PoC README | 随实验环境维护的操作说明 | 保留原位；启动示例仍写 `tools/livekit-poc`，与现路径不符，列为待单独核对项 |

## 统一记录现状

此前已有三个载体，但入口分散：`CHANGELOG.md` 记录实际提交变化，`docs/issues/` 记录需求和讨论，`docs/reviews/` 保存审查、验证及交接证据。旧根目录 BUG 文档只覆盖 2026-10-05 的六项问题，并不是持续维护的全项目 BUG 台账。

按用户确认，实际改动统一记录在根目录 [CHANGELOG](../../CHANGELOG.md)，不额外维护重复的变更台账。「继续处理」调整已在「未发布」中记录，随其他需求提测。待实施需求和必要的验证报告继续使用既有 issues/reviews 目录。

## 发现的文档债务

- `docs/README.md` 原标题是「Call Phone PC 初稿设计」，且把已接入的应用更新模块描述为“待实现”。本次改为项目文档库入口，保留 PC 初稿基线，并修正更新模块入口摘要。
- 手机 README 混有 1.0.4–1.0.7 的发布/验证历史；建议后续逐段归档到对应 review，留下当前启动与模块说明，避免在本次简单搬迁中改变历史含义。
- `page-implementation-status.md` 混有逐页状态和长篇排查过程；后续可按日期拆出必要证据，不把整篇视作当前最新验收结论。
- Call Phone 模块 README 的本地接入只列 v2–v28，而页面状态文档已提及更晚迁移。迁移操作需要对照当前初始化脚本单独核对，本次不改写执行步骤。
- 已归档 Agent 交接提及的 `src/tasks.js`、`src/claude.js` 和专家注册已不在当前执行服务目录，现有实现为原生 Work。因此旧交接只保留作追溯，当前服务以自身 README 为入口。

本次归档是文档组织审查，不构成对上述历史功能、构建命令或部署状态的重新验收。
