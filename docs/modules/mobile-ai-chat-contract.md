# 移动端 AI 会话契约（v1 草案）

2026-10-12：页面预览已实现；以下端点仅为契约，**尚无后端实现，也没有前端真实网络适配器**。当前页面始终使用模拟回复，不受 `VITE_MOBILE_MOCK` 控制；生产资源构建也展示「演示模式」。

## 页面与预览边界

- 工作台小卡片通过 `navigateTo` 打开 `/pages/ai-chat/index`，会话页不展示底部 TabBar，返回后恢复工作台。
- 使用 `@tdesign/uniapp-chat` 的消息、Markdown 和输入组件。支持空状态、快捷问题、模拟增量回复、停止、复制、末轮重新生成、新建、切换、删除会话。
- 预览会话与草稿只保存在当前应用进程内存，不读取客户数据、不调用模型、不写磁盘；刷新页面/关闭应用后清空。离开会话页或进入后台停止生成，部分回复保留并标记停止。
- 未接入真实模型、语音、附件、知识库和客户上下文。快捷问题是通用演示模板，不能把模拟结果当真实业务分析。
- App 页面使用 `softinputMode=adjustNothing`，页面接收键盘高度后缩短可用区域；H5 使用可视视口高度。Android 键盘/安全区仍需实际基座验收。

## 基础约定

沿用 [移动端 API](mobile-api-contract.md) 的服务地址、Bearer 短期令牌、`tenant-id`、配对设备 headers、数据归属和错误信封。新 AI 路径需要单独纳入移动端权限范围，不能直接使用 PC 管理端 `/ai/chat/*` 权限。

- 前缀 `/api/v1/mobile/ai`；业务 ID 均为十进制字符串，时间为 ISO 8601 UTC。
- REST 成功 `{ "data": ... }`，失败 `{ "error": { "code": "...", "message": "..." } }`。
- 创建、发送、停止携带 `Idempotency-Key`（UUID）；发送 body 的 `request_id` 必须与 header 一致。
- 服务端按 `(tenant,user,device,request_id)` 幂等处理。相同键和相同请求不得重复生成、记账；不同内容或会话返回 `IDEMPOTENCY_CONFLICT`。
- 用户只可访问自己有权限的会话，模型密钥留在客户侧后端。服务端校验会话和所有业务上下文，不能信任手机传来的客户资料或授权标识。日志不记录消息正文、模型密钥和令牌。
- v1 输入仅文本，trim 后 1–2000 个 Unicode 字符。`draft` 是客户端状态，不传服务端；未来草稿持久化须按服务/租户/账户/设备隔离并复用安全存储。

## REST 端点

| 方法/路径 | 请求 | 响应 `data` |
| --- | --- | --- |
| `POST /conversations` | `{}` | `{id,title,created_at,updated_at}`，初始标题「新会话」 |
| `GET /conversations?cursor=&limit=20` | limit 最大 100 | `{items:[{id,title,created_at,updated_at}],next_cursor}`，按 updated_at 倒序，ID 作稳定次序 |
| `GET /conversations/{id}/messages?cursor=&limit=50` | limit 最大 100 | `{items:[Message],next_cursor,active_request_id}`，items 按创建顺序排列；cursor 获取更早消息 |
| `DELETE /conversations/{id}` | 无 | `{deleted:true}`，原子取消该会话未完成生成并删除；重复删除本人已删除会话返回成功 |
| `POST /messages/stream` | `ChatStreamRequest` | SSE，见下文 |
| `POST /requests/{request_id}/cancel` | `{}` | `{request_id,status:"cancelled\|complete\|failed"}`；返回服务端最终状态，重复取消幂等 |
| `GET /requests/{request_id}` | 无 | `{request_id,conversation_id,status,assistant_message_id}`；用于断流后查明状态 |

每个会话只允许一个未完成生成，否则返回 `CHAT_BUSY`。会话标题由首条问题截取或后台生成，后续在列表刷新时获取。

`Message`：`{id,role:"user|assistant",content,status:"pending|streaming|complete|stop|error",created_at,request_id?,error_message?}`。正文为纯文本/Markdown 字符串；用户消息按纯文本转义，AI 消息按 Markdown 渲染，禁止执行原始 HTML/脚本。失败时仍保留已生成部分内容。

## 流式发送

`POST /api/v1/mobile/ai/messages/stream`，请求头 `Content-Type: application/json`、`Accept: text/event-stream`，以及上述认证和幂等 headers。

```json
{
  "request_id": "3d1fe27a-3a84-46cb-8a73-e5f86c6b412a",
  "conversation_id": "10001",
  "content": "帮我写一段客户跟进话术"
}
```

重新生成增加 `retry_of`（末轮 assistant message ID）。服务端校验该消息是会话最后一轮的助手回复，且已停止/完成/失败；`content` 必须与它对应的 user 消息一致。保留原 user 消息和 assistant ID，替换原 assistant 内容，不新增重复用户轮次。使用新的 request_id，后台旧尝试可留审计元数据。

SSE 每帧为 `event: 类型`、`id: request_id:sequence`、`data: 单行 JSON`，以空行结束。JSON 的 `type` 与 event 相同，所有事件包含 `request_id,conversation_id,sequence`。sequence 从 1 单调递增；客户端丢弃同一请求的重复/过期事件，禁止跨请求拼接。

```text
event: started
id: 3d1fe27a-3a84-46cb-8a73-e5f86c6b412a:1
data: {"type":"started","request_id":"3d1fe27a-3a84-46cb-8a73-e5f86c6b412a","conversation_id":"10001","sequence":1,"user_message_id":"10002","assistant_message_id":"10003"}

event: delta
id: 3d1fe27a-3a84-46cb-8a73-e5f86c6b412a:2
data: {"type":"delta","request_id":"3d1fe27a-3a84-46cb-8a73-e5f86c6b412a","conversation_id":"10001","sequence":2,"assistant_message_id":"10003","delta":"可以先用一段简短、自然的开场。"}

event: completed
id: 3d1fe27a-3a84-46cb-8a73-e5f86c6b412a:3
data: {"type":"completed","request_id":"3d1fe27a-3a84-46cb-8a73-e5f86c6b412a","conversation_id":"10001","sequence":3,"assistant_message_id":"10003","content":"可以先用一段简短、自然的开场。","finish_reason":"stop"}

```

| 事件 | 附加字段 | 客户端行为 |
| --- | --- | --- |
| `started` | user_message_id, assistant_message_id | 用服务端 ID 替换临时 ID，保持正在等待状态 |
| `delta` | assistant_message_id, delta | 追加正文，变为 streaming |
| `completed` | assistant_message_id, content, finish_reason | 用最终全文校准正文；stop → complete，cancelled → stop |
| `failed` | assistant_message_id, code, message | 保留部分正文，标记 error，展示可读错误和重试入口 |

`failed` 与 `completed` 为互斥终态，每个请求只发一次；终态后关闭连接。心跳用 SSE 注释 `: ping`（每 15 秒），不参与 sequence。代理关闭缓冲和压缩聚合，禁止按网络数据块直接当事件；适配器需支持跨块 UTF-8、CRLF 和多行 data。

建立流之前失败（认证、权限、限额、输入校验）返回 HTTP 非 2xx JSON 错误；建立流之后失败返回 failed 事件。无终态断流、60 秒无事件/心跳视为状态未知：前端停止等待，查询请求状态并刷新消息；不自动重发新请求。v1 不要求 Last-Event-ID 续流。重复发送同一 request_id 时，服务端返回对应请求当前快照，若仍在生成则订阅后续事件，不能启动第二次生成。

取消：前端立即停止渲染并保留部分答案，真实适配器调用 cancel 端点再释放连接；单独断开 HTTP 不能作为服务端已取消的依据。取消与正常完成竞态以服务端最终状态为准，消息刷新时校准。前端离页时释放订阅、使旧回调失效，重新进入先刷新服务端状态。

## 前端适配边界与验收

类型定义在 `src/types/ai-chat.ts`；`ChatTransport.stream(request,onEvent)` 返回可取消句柄。当前仅有 `previewChatTransport`，模拟同样的 started/delta/completed 事件。后续真实适配器负责认证、SSE 解析、网络错误映射到 failed、取消确认和状态恢复；会话列表/创建/删除改为 REST，不把预览内存 ID 直接传给后台。

服务端错误至少包括：`AUTH_REQUIRED`、`FORBIDDEN`、`DEVICE_REVOKED`、`NOT_FOUND`、`VALIDATION_ERROR`、`CHAT_BUSY`、`RATE_LIMITED`、`AI_UNAVAILABLE`、`IDEMPOTENCY_CONFLICT`。前端不能把失败当空回复成功。

接入验收：多端文字增量/Markdown、取消竞态、同键重放、断流查状态、最后一轮重生成、账户/租户隔离、撤销设备、日志遮蔽、长会话分页，以及键盘弹起/返回/后台切换。当前预览仅验证客户端交互，不代表这些后端能力已实现。
