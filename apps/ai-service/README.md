# 轻量 AI 对话服务

独立 Spring Boot 服务，拥有会话、消息、生成请求和数据库迁移。手机仍请求客户后端的 `/api/v1/mobile/ai/*`；后端验证员工、租户、配对设备和 `callphone:ai:chat` 权限，再以内部凭据转发。内部身份由后端生成，不接收手机自报的用户 ID；模型密钥仅存在本服务配置中。

模型调用使用 Spring AI 1.1.8 的单个模型库，不启用 Yudao AI 模块，也不引入向量库、MCP、绘图和工作流。首版支持 Chat Completions 协议兼容服务；其他供应商协议以后通过 `ModelGateway` 扩展。

手机发送 `web_search: true` 时，由内部桥接调用 Agent 服务的真实 WebSearch；未传或为 false 时保留原有普通对话。手机默认开启联网，问题无需实时资料时可直接回答。搜索中 / 正在回答通过 `activity` SSE 展示；实际搜索来源附在正文，随历史和幂等回放一起保存。联网失败明确报错，不自动退回普通回答。联网开关也参与请求幂等校验，不能用相同 UUID 更改模式。

## 本地配置

在项目根目录执行：

```sh
python3 apps/ai-service/scripts/configure-local.py --provider deepseek
```

脚本生成内部认证、存储加密和数据库密码，写入已被 Git 忽略的 `.env.local`，权限为 0600，并给客户后端配置相同内部认证值。重复执行保留原密钥；不会打印秘密。`AI_STORAGE_KEY` 必须和数据库一同备份，否则无法解密已有消息。

当前已预设 DeepSeek。你只需在 `apps/ai-service/.env.local` 修改这一行，保留其余配置：

```dotenv
AI_MODEL_API_KEY=你的DeepSeek_API_key
```

默认地址为 `https://api.deepseek.com`，模型为 `deepseek-flash`，请求路径为 `/chat/completions`，采用非思考模式，最多生成 1024 个输出 tokens。[模型名称与地址](https://api-docs.deepseek.com/zh-cn/)、[思考模式参数](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)。

保存后启动或重启 AI 服务才能读取新 key。Compose 已运行时可在项目根目录执行：

```sh
docker compose -f apps/ruoyi-vue-pro/compose.local.yml -f apps/ai-service/compose.ai.yml --profile ai up -d --force-recreate ai-service
```

若尚未部署，使用下文「Compose 部署」的首次构建命令。API key 不需要放到手机配置，也不需要发送给我。内部认证和存储加密密钥已自动生成，重复执行配置脚本不会替换它们。

未来更换兼容供应商时，可改 `AI_MODEL_BASE_URL`、`AI_MODEL_NAME`、`AI_MODEL_COMPLETIONS_PATH`，并把不支持 DeepSeek 思考扩展的供应商的 `AI_MODEL_THINKING` 留空。供应商不支持流式用量字段时设置 `AI_MODEL_STREAM_USAGE=false`。

缺少密钥或模型时，发送返回 `AI_UNAVAILABLE`，不会落入模拟回复，也不会启动模型请求。已有会话查询可继续使用。

开发运行：

```sh
python3 apps/ai-service/scripts/run-local.py
```

需要 Java 21 和 Maven。本机服务默认只监听 `127.0.0.1:48081`。直接运行的客户后端设置 `AI_SERVICE_URL=http://127.0.0.1:48081`，并加载其 `.env.local`。如果后端在 Docker 中而 AI 服务在宿主机，请使用正确的容器到宿主机地址和受限网络入口。

## Compose 部署

同时启用联网和原生 Work：先运行 `python3 scripts/configure-agent-local.py --provider deepseek --require-model`，再使用 `apps/ruoyi-vue-pro/script/callphone-local-up.sh`。脚本配置三方一致的内部 token、启动 AI 和 Agent，并保留现有数据库；已退役的 v59 旧资料任务回执迁移不再自动执行。单独使用下面仅 AI 的部署命令不会启动联网服务；完整 Compose 需再合并 `compose.agent.yml` 并启用 `--profile agent`。

在项目根目录执行：

```sh
docker compose -f apps/ruoyi-vue-pro/compose.local.yml -f apps/ai-service/compose.ai.yml --profile ai up -d --build ai-service server
```

AI 端口供 Compose 内部服务访问，并仅映射到宿主回环地址供本机语音写入转写；手机使用原客户后端地址。首次加入转发入口需要构建客户后端；后续只改 AI 服务时，只发布该服务：

```sh
docker compose -f apps/ruoyi-vue-pro/compose.local.yml -f apps/ai-service/compose.ai.yml --profile ai up -d --build ai-service
```

现有数据库需执行 `yudao-module-callphone/src/main/resources/sql/mysql/callphone-v58-ai-chat-permission.sql`，再由管理员为需要使用的成员角色授予 `callphone:ai:chat`。全新安装/本地升级脚本已包含该迁移；迁移不会自动扩大现有普通角色权限。授权后重新登录以刷新权限缓存。

## 状态和用量

- 会话归属按租户、用户校验；请求状态和取消额外按设备隔离。
- 发送使用同一个 UUID 作为 `request_id` 和 `Idempotency-Key`。重复请求订阅同一生成或返回已持久化快照；内容冲突返回 409。
- 每个会话只有一个活动请求。重新生成只替换最后一条助手消息，保留用户消息；旧尝试保留状态与用量。
- 提供明确取消、请求状态查询、分页历史、SSE 心跳。断开订阅不会自动启动第二次生成，也不等同于取消。
- 首版默认每用户每分钟 10 次、每用户最多 2 个并行生成、全服务最多 8 个生成；最多 12 条历史消息、12000 个上下文字符、1024 输出 tokens。180 秒总生成超时（可调小，不可超过 180 秒）、60 秒模型无输出超时；不自动重试模型请求。
- 供应商返回的 tokens 用量写入请求记录；未返回用量时为 0，代表未取得统计，不能作为真实账单。当前没有接入计费余额/每日金额额度。
- 标题和消息用 AES-GCM 加密保存。日志不记录消息正文、设备密钥、模型密钥或令牌。

## 当前部署范围

首版使用服务自己的 H2 文件数据库与持久卷，运行一个实例。它独立于客户后端数据库，迁移由 Flyway 管理。服务重启时将中断请求标记为失败并保留已持久化部分内容；不自动重放模型生成。

多实例部署需先换用共享数据库，并实现数据库级会话锁、请求状态与跨实例订阅；不能把本版直接扩成多个副本。未来接入 PC、摘要或知识库时，复用 AI 业务层，增加各自接口适配器，不复制手机的会话逻辑。

## 验证

```sh
python3 -m unittest discover -s apps/ai-service/tests -v
mvn -f apps/ai-service/pom.xml test
npm --prefix apps/call-phone-uni test
npm --prefix apps/call-phone-uni run type-check
npm --prefix apps/call-phone-uni run build:h5
npm --prefix apps/call-phone-uni run build:app
```

服务测试使用本地模型替身和真实 HTTP SSE，不消耗供应商额度。实际 API key 和 Android 真机的增量输出、后台停止、网络切换仍需联调。

聊天/联网本地联调：`python3 scripts/ai-feature-live-smoke.py --exercise`。使用真实模型及合成扫码设备/会话，检查联网来源、历史回放和请求重放，结束后清理测试会话与设备。脚本不再创建客户、旧资料任务或业务待办，也不提供旧任务过滤选项。原生 Work 使用 `node --env-file=apps/agent-service/.env.local scripts/work-native-smoke.mjs` 验证。两者会产生模型费用，不能代替 Android 真机交互验收。
