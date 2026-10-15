# Agent 执行服务

独立 Node.js 服务，通过固定版本官方 Claude Agent SDK 提供原生 Work 和联网问答。Java 侧验证可信租户、用户、配对设备与产品会话，手机不直连内部接口。

## 运行

需要 Node.js 22 或更新版本。

```sh
cd apps/agent-service
npm ci
cp .env.example .env.local
```

在 `.env.local` 配置随机至少 32 字符的 `AGENT_INTERNAL_TOKEN`，与 Java 后端保持一致。模型提供方通过 `AGENT_PROVIDER=anthropic|deepseek` 显式选择，默认 `anthropic`；不会读取本机 Claude 登录凭据或继承订阅认证。缺少对应提供方密钥或 SDK 时执行明确失败，不使用模拟输出替代真实执行。

- `AGENT_PROVIDER=anthropic`：配置 `ANTHROPIC_API_KEY`，默认模型 `claude-sonnet-4-6`。
- `AGENT_PROVIDER=deepseek`：配置 `DEEPSEEK_API_KEY`，默认模型 `deepseek-flash`；服务只使用固定官方 `https://api.deepseek.com/anthropic`，通过 `ANTHROPIC_AUTH_TOKEN` 认证，并清空子进程 `ANTHROPIC_API_KEY`。不会混用 Anthropic key，也不接受任意代理地址。

`AGENT_MODEL` 可留空采用提供方默认；DeepSeek 模式只接受 `deepseek-` 模型名，同时把主模型和 SDK 的 Claude 型号别名都映射到所选 DeepSeek 模型。不配置 fallbackModel，不自动切换模型。这里仍然使用 Claude Agent SDK 执行循环，通过 DeepSeek 官方 Anthropic API 兼容层调用模型，没有引入 DeepSeek Harness。协议兼容不代表模型任务质量、工具判断或行为与 Claude 相同，需要真实场景验收。官方依据：[Anthropic API 兼容](https://api-docs.deepseek.com/guides/anthropic_api/)、[Claude Code 接入](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)。

```sh
npm start
```

默认只监听 `127.0.0.1:48082`。可配置 `AGENT_BIND_HOST`、`AGENT_PORT` 和 `AGENT_DATA_DIR`。Docker 镜像只在受限内部网络使用，数据挂载 `/data`；容器以非 root 用户执行。不返回 CORS。

## 原生 Work 契约

Work 使用独立入口，普通聊天沿用原接口。旧资料任务已移除。SDK 固定 0.3.211；使用 claude_code 工具和提示词预设、includePartialMessages、原生 session 保存与 resume。服务只补产品对话映射、消息投影、顺序事件、交互和产物引用，不另建执行循环。

内部前缀 `/internal/v1/agent/work/sessions`，沿用内部 Bearer 与可信身份头。手机前缀 `/api/v1/mobile/work/sessions`，Java 复用手机身份、配对设备、AI 权限及产品会话校验，不接受模型指定租户/用户。Work 按租户/用户/对话归属，不要求客户或附件。

| 方法与后缀 | 输入/结果 |
|---|---|
| POST 空后缀 | `{conversation_id}`；同一所有者/产品对话幂等创建，返回 Session |
| GET `/:id` | 状态、用户/最终消息、交互、资源、产物、恢复副本引用和 sequence |
| POST `/:id/messages` | `{request_id,prompt,resource_ids?}`，Idempotency-Key 匹配；相同内容复用；最多 12000 字符；执行时拒绝另一条输入（409） |
| GET `/:id/events?after=N` | 内部支持 JSON 批次或 SSE；手机 SSE `event:work`、`id:sequence`。Java 将持久批次投影为 SSE，断开观察不打断模型；55 秒轮换，按游标重连 |
| POST `/:id/interactions/:interactionId` | 原样 binding；批准 `{approved:boolean}`；提问 `{answers:{问题原文:答复}}`。绑定参数和 run，重复同答复幂等，冲突/重启失效返回 409 |
| POST `/:id/interrupt` / `/:id/close` | `{}`；打断执行或关闭会话；关闭保留记录，后续需新建产品对话 |
| POST `/:id/files` | `{name,content_base64}`；原始字节最多 8 MiB，返回 resource；下一条指令选择资源 ID |
| GET `/:id/artifacts/:artifactId` | 内部返回原始字节 base64；手机返回安全下载头的二进制；手机 `.../content` 提供鉴权 JSON 供 H5 下载 |

事件固定 `{sequence,type,data,run_id,created_at}`，包括 status、capabilities、text_delta、assistant、tool_start/tool_delta/tool_call/tool_result、progress、interaction/interaction_answered、audit、snapshot、artifact、error、result。增量保留原生 message_id、工具 id/index、parent_tool_use_id；完整结果独立保存。仅原生 result 决定 SDK 本次执行结束；success 不保证用户业务目标达成，仍看工具回执和产物。idle/running/waiting/interrupted/failed/closed 是 Work 状态，不改旧 Task。

单条事件最多 8 MiB，JSON 回放批次最多 100 条/约 10 MiB；超大工具结果明确报错，不静默截断或自动重试已执行操作，大数据应写成产物文件。

每会话独立持久 config/HOME/workspace/runtime；临时通信文件不放用户工作区，transcript 由 SDK 保存。等待交互保留 SDK 进程，最长 30 分钟、40 轮；同时最多两条执行，无隐式排队。重启将运行/等待标记 interrupted，旧 pending 交互过期；仅后续新指令触发 SDK resume，不自动重放。只支持单进程/单份目录，勿用两个实例写同一卷。

原生 Bash 必须成功启用 SDK OS 沙箱，禁止关闭沙箱和后台参数；本地写入前保存恢复副本。默认命令无网络，不能读私有会话/凭据目录；文件工具另做真实路径、受保护配置和链接检查。64 MiB 是工具前检查，不是 OS 磁盘硬配额；部署层应配置卷配额、磁盘告警及保留周期。副本在私有 snapshots 目录供运维恢复，尚无手机一键回滚。

三级检查在每次实际调用前通过 PreToolUse 执行，SDK 记住一次批准也不能跳过：受限可恢复工作区操作为 1；MCP 声明为 2/3 时均逐次批准；未知 MCP 默认 3。开放命令网络后 Bash 一律 3，子 Agent 前台执行需逐次批准；动态调度、工作树和原生对外消息工具不开放，业务操作走 MCP。不向原生命令传业务凭据，并通过沙箱隐藏模型凭据。

### 受管理能力配置

默认加载 `resources/work-skills/workspace-files`，不读取宿主个人 .claude。可配置 `WORK_MANAGED_CONFIG=/opt/managed/work.json`，仅由管理员提供：

```json
{
  "skillsDir": "/opt/managed/skills",
  "plugins": ["/opt/managed/plugins/reviewed-plugin"],
  "mcpServers": {"business": {"type": "http", "url": "https://business-mcp.example/mcp", "headers": {"Authorization": "Bearer operator-managed-secret"}}},
  "toolRisk": {"mcp__business__query_owned_customers": 1, "mcp__business__prepare_import": 2, "mcp__business__dispatch_call": 3},
  "networkDomains": []
}
```

示例未连接真实业务。配置/插件由运营方审阅，禁止放入用户工作区、Git、产物或日志，密钥不能写进技能。HTTP/SSE MCP 的 X-AI-Tenant/User 由服务覆盖；stdio 从专用进程的 WORK_TENANT_ID/WORK_USER_ID 获取身份。所属后端仍须验证内部认证、原用户数据范围和业务权限，不能信任工具参数中的身份。

Docker 镜像配置 bubblewrap、socat、Python 3、Poppler 和固定版 pypdf/python-docx/openpyxl/python-pptx。Linux 宿主须支持非特权沙箱，缺依赖或不支持时拒绝执行。文件原样传输不限扩展名，实际格式能力以 [验证记录](../../docs/reviews/2026-10-15-native-work-validation.md) 为准；DOC/XLS/PPT、扫描 OCR 尚未承诺。

显式真实验证（从仓库根目录运行，会调用当前模型并产生费用）：

```sh
node --env-file=apps/agent-service/.env.local scripts/work-native-smoke.mjs
```

只生成虚构文件，验证技能/MCP/提问/命令/读取/产物、重建映射后续会话及凭据/私有文件隔离。临时目录保留证据，不打印密钥，不写业务系统。

## 联网内部契约

联网对话使用 POST `/internal/v1/agent/chat/stream`，同样要求内部凭据和可信身份。输入 `{turns:[{role,content}]}`，返回 SSE `activity(searching|answering)`、`chunk(text)`、`usage(input_tokens,output_tokens)`、`done` 或 `error`。只允许内置 `WebSearch`，不允许读取文件、Shell、客户查询或业务写入；每次运行隔离 HOME/配置并在结束后删除。最多 6 轮、2048 输出 tokens、170 秒、两条并行请求；15 秒心跳，断开即取消上游。真实搜索结果中提取的 HTTP(S) 来源附在 Markdown 正文并由 AI 服务保存。搜索无可核对来源或未正常结束时明确失败，不切换为无来源回答。

DeepSeek 的原生 WebSearch 通过官方 Anthropic 兼容层及 Agent SDK 执行，会产生额外模型请求；普通离线对话仍走 AI 服务原有接口。依据：[DeepSeek Claude Code / Agent SDK 接入](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)。

## 验证与数据保留

```sh
npm run check
npm test
```

当前 18 项离线测试覆盖 Work 生命周期、原生工具/MCP、提问批准、幂等、恢复、二进制与产物、身份隔离、联网 SSE 及提供方配置，不调用付费模型。旧资料任务测试随实现退役，有价值的 SDK MCP schema、认证、文件选择与提供方检查已迁移到现有能力测试。

固定客户、单个 TXT/MD、Markdown 跟进报告和确认创建待办的旧链路已删除，包括手机入口、专用 REST 接口、执行器/队列、专家定义、业务适配和专用联调脚本。原 `/internal/v1/agent/tasks` 不再注册（404），服务不读取/恢复旧任务目录。

磁盘原报告/任务 JSON、已有数据库回执和真实业务待办保留，不自动迁移为 Work，也不自动重放或删除。v59 建表 SQL 仅作已部署历史保留，启动迁移不再运行它。后续业务 MCP 应复用领域用例，并落实提交去重、查询回执和结果不确定时先核验；不保留一套无人调用的旧 Agent 业务服务。

真实模型测试使用上文 work-native-smoke，当前证据见 [原生 Work 验证](../../docs/reviews/2026-10-15-native-work-validation.md)。普通聊天/联网联调见 AI 服务文档。
