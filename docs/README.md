# 项目文档

## 仓库结构

```
applications/     手机端（uni-app）
container/        容器：PC、移动壳、公共后端、验收
servers/          独立服务（agent-link 等）
docs/             文档
_reference/       本地参考，忽略提交
_trash/           待删备份，忽略提交
```

## 当前文档

### 架构

- [当前仓库架构](architecture/overview.md)

### 模块

- [通用应用更新模块](modules/app-update-module.md)
- [手机端本地诊断日志](modules/mobile-diagnostics.md)

### 待办

- [多应用入口边界](issues/multi-app-entry-boundaries-issue.md)
- [实时语音与桌宠](issues/pet-realtime-voice-issue.md)
- [Work 对话页体验](issues/work-conversation-experience.md)
- [外部应用打开文件异常](issues/work-external-file-open-bug.md)

### 发布

- [发布说明](releases/README.md)
- [1.0.26 发布清单](releases/1.0.26.json)

### 外部资料

- `docs/_references/`：外部项目文档，忽略提交。

## 已归档

旧的 CallPhone 41 页契约、历史 reviews、旧模块文档、旧架构/技术选型已移到本地 `_trash/docs/`，不纳入版本库；需要时仍可在本机查阅，git 历史中也保留。

## 写作约定

- 只记录当前仍有效的架构、契约、模块和待办。
- 一次性验收记录、过期设计稿不留在 `docs/`，放 `_trash/docs/` 或对应项目的提交历史。
- 代码/配置变化仍需在根 `CHANGELOG.md` 追加条目，由 `.githooks/pre-commit` 使用 `container/scripts/check-changelog.mjs` 检查。
