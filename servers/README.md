# servers

独立后端服务。与 `container/`（客户端壳与验收）、`applications/`（手机应用）并列。

| 服务 | 状态 | 说明 |
| --- | --- | --- |
| `agent-link/` | 已落地 | 局域网 Agent 配对、二维码、token、消息与交互（审批/选择/填空），TypeScript npm 包 |
| `voice/` | 待迁移 | 来自 `apps/voice-service`，需先核对其他项目语音插件的改动 |
| `cmb/` | 待评估 | `codex-mobile-bridge`，先评估是否整体迁入，避免与 auth 重复 |

原则：服务只暴露稳定的 HTTP/WS 契约；宿主插件（DSH、Codex 等）作为客户端接入，不在插件里复制业务实现。
