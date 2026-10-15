> 历史存档：旧资料任务已于 2026-10-15 从当前源码移除。本文仅保留此前协议证据，不是可调用接口；当前入口见 [原生 Work 契约](../../apps/agent-service/README.md)。

# 移动端 Agent 任务原型契约

日期：2026-10-14。本文描述首条链路的实现边界，真实 SDK/业务/真机验证结果另见交付记录。

## 职责与数据流

移动端仍以 AI 对话为入口。普通聊天沿用原接口；资料任务使用独立平台任务，SDK 会话只是任务的关联字段。

手机 → 客户后端（员工/租户/设备/权限及客户归属校验）→ 独立 Agent 服务 → 受限工具及 Claude Agent SDK → 跟进建议 Markdown 文件与待确认建议 → 用户确认 → 客户后端创建真实待办 → Agent 服务记录业务结果。

首版上传 UTF-8 `.txt/.md` 内容，最大 64 KiB。它是 JSON 文本附件，不是通用二进制文件上传/Office 解析接口。手机可选择支持的文件；不支持选取的运行环境可显式粘贴资料。语音和实时桌宠语音不属于此次实现。

## 移动端接口

所有接口复用移动端 Bearer/配对设备认证及 `tenant-id`，身份不能由请求体覆盖。读取、创建及取消要求 `callphone:ai:chat`；确认写入另外要求 `callphone:followup:save`。

| 方法与路径 | 输入/结果 |
|---|---|
| POST `/api/v1/mobile/ai/tasks` | 输入见下文；成功返回任务快照 |
| GET `/api/v1/mobile/ai/tasks?conversation_id=…` | `{data:{items:Task[]}}`，限当前执行身份和会话关联 |
| GET `/api/v1/mobile/ai/tasks/{uuid}` | `{data:Task}` |
| POST `/api/v1/mobile/ai/tasks/{uuid}/cancel` | `{}`；返回任务快照，已提交的业务写入不能撤回 |
| GET `/api/v1/mobile/ai/tasks/{uuid}/artifact` | `{data:{name,content,mime_type}}`，客户端保存为文件；无公开下载 URL |
| POST `/api/v1/mobile/ai/tasks/{uuid}/confirm` | `{}`；从服务端取待确认建议，创建业务待办，返回更新后任务快照 |

创建输入：

```json
{
  "request_id": "UUID",
  "conversation_id": "十进制字符串",
  "prompt": "请结合沟通资料生成跟进建议",
  "customer_id": "十进制字符串",
  "attachment": { "name": "沟通资料.md", "content": "用户提供的 UTF-8 文字" }
}
```

`Idempotency-Key` 与 `request_id` 相同。任务 ID 为 UUID，与已有业务实体的十进制 ID 区分。客户 ID、会话 ID、待办 ID 都以字符串传输，避免长整型精度损失。提示词上限 2000 字。

## 任务与事件

任务字段：`id/request_id/conversation_id/customer_id/status/summary/events/created_at/updated_at`，可选 `error_message/proposal/artifact/follow_up_task_id/engine_session_id/engine/expert/confirmation_pending`。

状态路径：`queued → running → awaiting_confirmation → completed`；执行阶段可进入 `failed/cancelled`。有业务建议时等待用户决定，确认创建待办后完成；没有业务建议的报告任务可直接完成。不要把“模型生成完成”直接当成“业务写入成功”。

- `events`：有序 `{sequence,type,message,created_at}`。首版用轮询获取快照，前端以稳定任务 ID 合并，不重复创建卡片。
- `proposal`：`{title,content,due_at}`，UTC ISO 8601 日期。确认卡片展示实际对象和参数，确认接口不接受客户端覆写建议。
- `artifact`：`{name,mime_type}`；内容通过鉴权接口读取，`mime_type=text/markdown`。
- 返回结果不包含源附件全文、内部凭据、执行目录或完整客户快照。
- 离开页面只停止轮询，不调用任务取消。回到页面重新获取状态；退出账号/更换配对设备清空本地状态并忽略旧响应。

## 内部执行接口

服务默认 `127.0.0.1:48082`，内部前缀 `/internal/v1/agent`，资源路径同上。要求独立 `AGENT_INTERNAL_TOKEN` 及可信 `X-AI-Tenant/X-AI-User/X-AI-Device`。客户后端不转发客户端的内部身份头、Bearer 或设备密钥。

内部创建额外携带 `customer_snapshot`，仅含经授权读取的客户必要字段。工具 `query_customer` 返回此任务提交时的授权快照，不是实时查询接口；未来需要实时刷新时扩展业务连接器。`read_attachment` 读取提交的资料；模型没有任意数据库/文件/Bash 权限。

内部确认 `{follow_up_task_id}` 仅记录客户后端已经提交的业务结果。待办创建与幂等回执在客户数据库事务内提交；随后通知 Agent 服务。若通知失败，确认响应带上已创建的 `follow_up_task_id` 与 `confirmation_pending:true`；用户重试确认时复用已创建的待办，不再次插入。后续 GET/list 会核查持久化回执并尝试补送；即使 Agent 被并发取消，已提交业务的回执仍能恢复为完成。补送失败时继续显示业务已创建、结果同步中，不能显示为未创建。

租户 ID 允许 `0`，与现有认证约定一致；用户、设备及业务实体 ID 要求正数。同键重试时刷新后的可信客户快照不会引起冲突，任务继续使用第一次持久化的快照；客户端提示词、附件或客户 ID 变化仍构成冲突。

## 持久化与部署限制

Agent 任务、执行目录和产物使用私有数据目录。首版单实例，文件系统持久化；任务归属按租户、用户和设备限定，不宣称目录划分等于完整操作系统隔离。服务重启使未完成执行明确失败，不自动重放。待确认/已完成状态保留，按实现的恢复规则读取。

真实模式必须显式配置模型 API Key；不复用本机 Claude 订阅登录态。测试使用注入的本地执行替身，明确区分测试与真实执行，不做生产回退。

首次接入执行 SQL `callphone-v59-agent-followup-receipt.sql`。全新安装脚本包含该版本；已部署数据库仍需按升级流程执行。服务并未在此契约中承诺自动部署或更新现有生产环境。

## 首期验证

- 本地任务 lifecycle：身份隔离、同键重放/冲突、取消竞态、客户端断开后继续、重启中断、产物访问、确认状态。
- 客户后端：身份推导、客户归属、写入权限、真实待办加密存储及重复确认幂等。
- 移动端：隐藏/恢复观察、身份切换和过期响应、文件大小、确认和下载错误。
- 真实 SDK、实际客户后端/数据库、Android 文件下载分别记录证据；替身测试通过不能替代真实联调。
