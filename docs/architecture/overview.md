# 当前仓库架构

日期：2026-11-17。本文描述清理后的实际结构，不沿用旧 CallPhone 41 页或 `apps/` 时代的路径。

## 顶层

```
applications/   手机端（uni-app）
container/      容器：PC、移动壳、公共后端、验收
servers/        独立服务
docs/           文档
_reference/     本地参考，忽略提交
_trash/         待删备份，忽略提交
```

## applications

`applications/call-phone-uni` 是当前唯一的手机应用：Agent 消息、联系人、聊天、审批/选择/填空弹层、语音与桌宠。原生拨号适配从 `shared/mobile` 迁入应用内 `shared/mobile`。

## container

- `container/backend`：芋道 framework/system/infra 后端，负责登录、组织权限、配置、文件、通知、应用版本
- `container/pc`：PC 管理端 Vue3
- `container/mobile`：移动 H5 壳
- `container/shared`：容器共享的 client、entries、diagnostics、multipart
- `container/acceptance`：独立 MySQL/Redis 启停与验收
- `container/scripts`、`container/tools/app-update`：仓库级钩子、CHANGELOG 检查、发布工具

## servers

### agent-link

`servers/agent-link` 是 TypeScript npm 包，负责局域网手机与桌面 Agent 的：

- 二维码 + 6 位配对码、token
- 双向消息、长轮询、保留策略
- 审批与问题弹层（`/api/host/approval`、`/api/host/question`）
- 宿主控制接口（`/api/host/*`），供 DSH 等插件作为客户端接入

手机不直连宿主；宿主也不在插件里复制配对/消息实现。

### 数据流

```
手机 App  ──HTTP──▶  servers/agent-link  ◀──HTTP──  宿主客户端（DSH 插件等）
                         │
                         └── 配对页 / 二维码 / 审批与问题
```

## 本地目录

- `_reference/`：`ruoyi-vue-pro`、`voice-service`、旧 `plugins`、`mobile-pet-archive`
- `_trash/`：旧 `apps`、`next`、旧 scripts/docs
- `docs/_references/`：外部项目文档

这三个目录均不提交；确认不再需要后可自行删除。
