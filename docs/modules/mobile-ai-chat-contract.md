# 移动端 AI 会话契约（v1）

2026-10-13：已实现轻量独立 AI 服务、客户后端手机适配入口和 App 真实流式适配器。生产使用真实接口，开发环境显式 `VITE_MOBILE_MOCK=true` 时保留预览。模型 API key 尚待配置；供应商真实联调和 Android 真机增量输出尚待验收。部署与配置见 [AI 服务说明](../../apps/ai-service/README.md)。

## 页面与运行模式

- 工作台小卡片通过 `navigateTo` 打开 `/pages/ai-chat/index`，会话页不展示底部 TabBar，返回后恢复工作台。
- 使用 `@tdesign/uniapp-chat` 的消息、Markdown 和输入组件。支持空状态、快捷问题、增量回复、停止、复制、末轮重新生成、新建、切换、删除和分页会话。
- 真实会话保存在独立 AI 服务的加密数据库中；草稿仅保留在当前进程内存。账户或设备身份变化时清空客户端状态。预览模式不请求网络、不写磁盘。离开会话页或进入后台发起明确取消，下次进入刷新服务端最终状态。
- 首版只发送用户主动输入的文本和有限会话上下文；不自动读取客户、待办数据，不包含语音、附件、知识库。预览模式的回复为模拟内容。
- App 页面使用 `softinputMode=adjustResize`，由系统缩小窗口，页面保持 `100vh`，不再重复扣减键盘高度；输入组件关闭自动上推，键盘高度事件仅用于收起底部安全区留白和滚动至最新消息。H5 使用可视视口高度。Android 键盘/安全区仍需实际基座验收。

## 基础约定

沿用 [移动端 API](mobile-api-contract.md) 的服务地址、Bearer 短期令牌、`tenant-id`、配对设备 headers、数据归属和错误信封。真实手机入口要求 `callphone:ai:chat` 权限，并校验配对设备。扫码令牌仍只访问 `/api/v1/mobile/*`，不放开 PC 管理端 `/ai/chat/*`。客户后端验证身份后，以内部服务凭据和可信 tenant/user/device 上下文转发；不转发手机令牌、设备密钥。

- 前缀 `/api/v1/mobile/ai`；业务 ID 均为十进制字符串，时间为 ISO 8601 UTC。真实存储 ID 由服务端分配，不使用预览 ID。
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
| `GET /conversations/{id}/messages?cursor=&limit=50` | limit 最大 100 | `{items:[Message],next_cursor,active_request_id,busy}`，items 按创建顺序排列；cursor 获取更早消息 |
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

类型定义在 `src/types/ai-chat.ts`；`ChatTransport.stream(request,onEvent)` 返回可取消句柄。真实适配器 `remoteChatTransport` 使用 H5 XMLHttpRequest 和 App `plus.net.XMLHttpRequest` 的增量文本读取，处理跨块事件、CRLF、心跳和多行 data。建立流前的认证过期只刷新一次，并保留同一请求 UUID；流中断不启动新生成，查询原请求状态并刷新消息。`previewChatTransport` 仅用于明确的开发模拟模式。会话列表/创建/删除使用 REST；较早消息和更多会话可分页加载。未获得服务端确认的本地失败消息，重试时按新发送处理，不把临时 ID 用作服务端重生成 ID。

服务端错误至少包括：`AUTH_REQUIRED`、`FORBIDDEN`、`DEVICE_REVOKED`、`NOT_FOUND`、`VALIDATION_ERROR`、`CHAT_BUSY`、`RATE_LIMITED`、`AI_UNAVAILABLE`、`IDEMPOTENCY_CONFLICT`。前端不能把失败当空回复成功。

接入验收：多端文字增量/Markdown、取消竞态、同键重放、断流查状态、最后一轮重生成、账户/租户隔离、撤销设备、日志遮蔽、长会话分页，以及键盘弹起/返回/后台切换。当前自动测试覆盖会话幂等、取消、重生成、分页、账号/租户/设备隔离、重启恢复、SDK 调用、本地 HTTP SSE 和客户端解析；供应商真实调用及 Android 真机键盘/网络/后台场景尚待验收。

## 首版实现范围

- AI 运行一个实例，使用独立 H2 持久库与 Flyway 迁移。标题和正文加密存储，客户后端不访问 AI 数据表。
- 请求状态按 `(tenant,user,device,request_id)` 隔离。会话历史本人多设备可读；`busy` 指示其他设备正在生成，此时只刷新历史，不能取消其他设备请求。
- 心跳每 15 秒；模型 60 秒无输出或总生成达到 180 秒转失败。服务重启将活动请求标为失败并保留持久化部分文字，不重放生成。
- 发送幂等、创建会话幂等、取消和删除幂等已实现；创建的重复请求返回同一会话的当前摘要。cancel 的 UUID header 校验格式，最终状态由目标 request_id 决定。
- 速率与并发额度在单实例内维护；请求与供应商用量持久化。具体限额及多实例升级条件见服务说明。
