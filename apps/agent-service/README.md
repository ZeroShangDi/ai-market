# Agent 执行原型

独立 Node.js 服务，接入官方 Claude Agent SDK。现有 Java 业务服务验证租户、员工、配对设备和客户权限后，传入可信客户快照。手机不能直连此内部接口。会话 ID 用作当前执行身份内的任务关联，首版尚未另行核验聊天服务中的会话记录归属。

首条任务：读取 `.txt` / `.md` 资料，查询绑定客户快照，生成可下载的 Markdown 跟进建议，提出可选待办。SDK 仅能调用三个内置进程 MCP 工具：`read_attachment`、`query_customer`、`submit_report`；业务待办由 Java 在用户确认后创建，再回传持久化回执。

## 运行

需要 Node.js 22 或更新版本。

```sh
cd apps/agent-service
npm ci
cp .env.example .env.local
```

在 `.env.local` 配置随机至少 32 字符的 `AGENT_INTERNAL_TOKEN`，与 Java 后端保持一致。模型提供方通过 `AGENT_PROVIDER=anthropic|deepseek` 显式选择，默认 `anthropic`；不会读取本机 Claude 登录凭据或继承订阅认证。缺少对应提供方的 API key 时任务明确失败，缺少 SDK 的错误另行说明，不会用模拟输出替代真实执行。

- `AGENT_PROVIDER=anthropic`：配置 `ANTHROPIC_API_KEY`，默认模型 `claude-sonnet-4-6`。
- `AGENT_PROVIDER=deepseek`：配置 `DEEPSEEK_API_KEY`，默认模型 `deepseek-flash`；服务只使用固定官方 `https://api.deepseek.com/anthropic`，通过 `ANTHROPIC_AUTH_TOKEN` 认证，并清空子进程 `ANTHROPIC_API_KEY`。不会混用 Anthropic key，也不接受任意代理地址。

`AGENT_MODEL` 可留空采用提供方默认；DeepSeek 模式只接受 `deepseek-` 模型名，同时把主模型和 SDK 的 Claude 型号别名都映射到所选 DeepSeek 模型。不配置 fallbackModel，不自动切换模型。这里仍然使用 Claude Agent SDK 执行循环，通过 DeepSeek 官方 Anthropic API 兼容层调用模型，没有引入 DeepSeek Harness。协议兼容不代表模型任务质量、工具判断或行为与 Claude 相同，需要真实场景验收。官方依据：[Anthropic API 兼容](https://api-docs.deepseek.com/guides/anthropic_api/)、[Claude Code 接入](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)。

```sh
npm start
```

默认只监听 `127.0.0.1:48082`。可配置 `AGENT_BIND_HOST`、`AGENT_PORT` 和 `AGENT_DATA_DIR`。Docker 镜像只在受限内部网络使用，数据挂载 `/data`；容器以非 root 用户执行。不返回 CORS。

## 内部契约

前缀 `/internal/v1/agent/tasks`。每次请求必须包含 `Authorization: Bearer <AGENT_INTERNAL_TOKEN>` 和可信的数字 `X-AI-Tenant`、`X-AI-User`、`X-AI-Device`。租户允许 `0`（与现有服务一致），用户、设备、会话、客户及待办 ID 必须为正数。所有业务 ID 在 JSON 中返回十进制字符串，任务 ID 是 UUID。

| 操作 | 请求 | 响应 |
| --- | --- | --- |
| POST `/tasks` | `Idempotency-Key=request_id`；JSON `request_id,conversation_id,customer_id,prompt,attachment:{name,content},customer_snapshot:{id,name,stage,notes?}` | `{data:Task}` |
| GET `/tasks?conversation_id=...` | 会话 ID | `{data:{items:Task[]}}`，最多最近 100 项 |
| GET `/tasks/:id` | UUID | `{data:Task}` |
| POST `/tasks/:id/cancel` | `{}` | `{data:Task}` |
| GET `/tasks/:id/artifact` | UUID | `{data:{name,content,mime_type:'text/markdown'}}` |
| POST `/tasks/:id/confirm` | `{follow_up_task_id:string}`，仅 Java 业务提交成功后的回执 | `{data:Task}` |

Task：`id,request_id,conversation_id,customer_id,status,summary,error_message?,events,proposal?,artifact?,follow_up_task_id?,created_at,updated_at,engine_session_id?,engine,expert`。事件含 `sequence,type,message,created_at`；proposal 含 `title,content,due_at`；artifact 仅含 `name,mime_type`。Task 响应不包含附件和客户快照。

状态：`queued → running → awaiting_confirmation → completed`，无提案可直接完成，也可失败或取消。平台状态独立 SDK 会话，按租户／用户／设备隔离。重复请求复用同一任务，客户端内容不一致返回 409；重试时可信客户快照的刷新不构成冲突，继续使用第一次已持久化的快照。客户端断开不影响执行。确认相同业务回执幂等；回执不同返回冲突。取消不能撤回 Java 已提交的业务写入：有提案的已取消任务收到可信持久化回执时会完成并明确记录这个事实。

请求正文最多 512 KiB（含 JSON 转义）；附件仅 UTF-8 `.txt` / `.md` 且最多 64 KiB，禁止目录路径；任务指令最多 2000 字符；待办内容最多 2000 字符且 3000 UTF-8 字节，保证加密后可写入现有业务存储。SDK 最多 12 轮，宿主执行超时 180 秒；全服务并行 2、队列总量 32，每用户最多两个运行或排队任务。Anthropic 使用 SDK 1 美元预算；SDK 的费用估算基于 Claude 定价，不能保证 DeepSeek 实际账单，因此 DeepSeek 不使用该金额作为可靠预算，仍执行轮数和时间限制。

## 持久化与边界

私有数据目录每任务单独工作目录，JSON 原子替换，文件权限 0600、目录 0700。只适用单进程实例；磁盘保存明文资料与报告，部署方需配置受限磁盘、备份及生命周期管理。服务重启将排队／运行任务明确标记失败，不自动重试；待确认任务、报告和回执保留。本版没有自动恢复执行、多实例队列、加密存储、自动清理、实时语音、PDF/Office、外部连接器和任意 Shell 权限。

SDK `tools: []` 移除全部内置工具，只注册自定义 MCP；每任务独立 HOME 和配置目录，`settingSources: []`，不继承宿主配置或其他凭据。任务输入和资料仍是非可信内容；业务写入不能由模型直接执行。

专家和技能定义位于 `resources/`，独立于平台持久化。默认 `customer-follow-up/v1`；第二个 `document-review/v1` 增加通用 `attachment_metrics` 工具，提交核查报告且不提出待办。离线扩展测试验证同一执行循环可加载第二个专家和工具，无需改动任务流转；HTTP 入口当前固定默认专家，未来客户端选择专家需要单独增加权限与版本校验。当前没有任意插件安装能力。

固定 SDK 的 `createSdkMcpServer({alwaysLoad:true})` 确保工具 schema 在首轮可见；`strictMcpConfig:true` 限制为本次注册的 MCP。实际 SDK MCP `tools/list` 测试验证三个工具都有 `anthropic/alwaysLoad:true` 元数据，不依赖被禁用的 ToolSearch。

## 验证

```sh
npm run check
npm test
```

23 个离线测试使用显式注入 `engine=test` 的执行器，覆盖认证和身份隔离、幂等冲突与快照刷新、校验、缺失备注与明确空值区分、任务生命周期、报告、确认回执、取消释放执行槽及排队容量、防止迟到产物、超时、关闭等待写入结束、重启状态与未提交目录、真实磁盘写失败后的确认重试、真实执行器缺少密钥或依赖、提供方配置与凭据隔离、SDK 调用参数隔离、第二专家扩展和实际 SDK MCP 工具发现。测试不会请求付费模型 API。

提交前审查修复：初次保存中断遗留的空目录或仅临时文件目录不阻断重启，已提交的损坏 JSON 仍明确报错；取消排队任务立即释放队列容量；确认回执先保存新副本再更新内存，相同回执重试也重新持久化，磁盘失败不会被误报为已保存成功。

从仓库根目录运行 `node scripts/agent-sdk-transport-smoke.mjs` 可启动真实 SDK 执行进程并连接显式本地模型替身，验证四轮 Messages API 传输、三个实际 MCP 调用及报告提交。此脚本不使用真实密钥、不写业务数据库，且不改变生产执行器默认行为。它验证 SDK 集成，不能代表真实模型输出质量。

2026-10-14 另行完成真实 DeepSeek API 的虚构资料联调，实际读取工具、报告提交、持久化待确认状态和产物读取均成功；未连接真实业务数据库。联调发现并修复可选备注被补成空字符串的问题。[验证记录与样例](../../docs/reviews/2026-10-14-agent-deepseek-validation.md)。需重复真实模型测试时，从仓库根目录显式运行 `node --env-file=apps/agent-service/.env.local scripts/agent-model-smoke.mjs`，会产生模型费用，不属于 npm test。

依据官方文档：[自定义 MCP 工具](https://code.claude.com/docs/en/agent-sdk/custom-tools)、[SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)。固定依赖版本见锁文件。
