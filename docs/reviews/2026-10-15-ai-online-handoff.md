# AI 联网与现有功能闭环交接

> 后续已完成：真实联网与资料任务连续五项验收通过，1.0.9安装包已本地签名并校验。以下保留当时的断点历史；最新状态见 [验收记录](2026-10-15-ai-online-validation.md)。

更新时间：2026-10-15 00:45，北京时间。用户因短期额度接近耗尽要求交接，下个周期/切账号后继续；**明确不用安排自动续跑**。没有创建自动化，也没有提交本轮代码。工作区修改与运行中的真实服务均保留。

## 用户目标与授权

用户要求至少实现联网，检查现有功能，不允许留下半条链路，并询问当前对话流支持的展示类型。最终回答需要回应标注并包含 `:codex-annotation{index="1"}`。不要把未通过的资料任务链路说成已验收。

之前已完成远端同步及正式安心包 1.0.6。用户允许必要时将 Android 模块配置、应用图标、桌宠原生插件代码交给 DCloud；业务前端与私有签名证书留本机。该限定授权持续有效，无需再次询问。本轮可复用已签名 1.0.7 原生包，在本地替换编译资源、对齐和签名，不必重新云编译。

提交要求：`类型(范围): 中文说明`，实际代码提交同次更新根 CHANGELOG.md。根 AGENTS.md、CHANGELOG.md 和多个修改由其他会话正在新增/编辑，不能混入本任务提交或覆盖。不要 git add .。

## 已实现且验证

- 真实联网：Agent SDK + DeepSeek 官方 Anthropic 兼容端点的内置 WebSearch。只开放 WebSearch，独立 HOME/配置、禁用其他工具、不继承凭据；提取真实工具结果来源，附在 Markdown 回答。搜索失败明确报错，不伪装为联网成功。
- Java AI 服务增加可选 `web_search` 请求字段，保留普通聊天兼容；联网模式参与幂等校验；内部 SSE 桥接、活动状态与心跳；最终回复及来源保存、可历史恢复/回放。
- 手机默认联网开关，显示搜索/回答状态；Markdown 链接打开浏览器、图片预览；资料报告由纯文本改为同一 Markdown 组件。
- 补齐 Agent 部署、三服务内部认证配置、一键启动和 v59 待办回执迁移；真实 Docker 服务均已启动，原数据库和 Tailscale 地址保留。
- 资料任务提交与列表增加真实聊天会话归属核验，再读客户快照；待办时区按业务服务器 ZoneId.systemDefault 转换，修正可能 8 小时偏移，含 Shanghai 单测。
- Android 原本 uni.chooseFile 路径不可靠，增加 SAF 系统文件选择，UTF-8 TXT/MD、64 KiB、取消/句柄释放，保留粘贴入口。仅代码/替身测试，**尚未 Android 真机验收**。
- Agent 离线测试 29/29；AI Java 18/18；后端相关 15 个单测通过；移动测试当时 136/136（其他会话新增测试后总数会变），后续文件选择/Markdown针对性 4/4；类型检查、H5/App 编译通过。最新类型检查进程 51405 已完成 exit0。
- 完整公网模型手机 API 联调已通过：真实 QR 范围 session、device、owned conversation → DeepSeek 搜索 → SSE searching → 真实来源 → 历史一致 → 同 UUID 回放一致。使用合成客户与虚拟设备，清理成功，不拨号。

## 当前未解决的断点（优先处理）

`python3 scripts/ai-feature-live-smoke.py --exercise --task-only`：会话/设备通过，非法会话403通过，但正式 POST `/api/v1/mobile/ai/tasks` 返回 **503 AGENT_UNAVAILABLE**。所以真实客户快照 → 报告 → 手动确认 → MySQL → PC 的完整链路仍未验收，不能称完成。

最新诊断已部署：MobileAgentTaskController 和 AgentTaskRelay 仅记录异常类型/代码位置，绝不记录异常 message、请求正文、令牌。服务日志确认：

```
AI task transport failure type=IOException
```

断点位于 AgentTaskRelay 的 HttpClient 传输，而非会话归属（后者失败会给 AI_UNAVAILABLE）。待进一步区分 `client.send` 与 `readNBytes`、HTTP/2 升级/响应读取等问题，不能凭猜测改。

新做的安全独立 Java 诊断：`/private/tmp/AgentHttpDiagnostic.java` / `.class`，通过 `docker cp` 放在 ai-service `/tmp`。同样默认 HttpClient 向 `http://agent-service:48082/internal/v1/agent/tasks` POST 合成文本但缺 customer_snapshot，**正常返回400**（未启动任务）。Node fetch 使用内部认证空输入同样400。因此基础认证、DNS、Java连接可用，可能只在正常任务响应/Java服务实际路径发生。下一步可增加受限诊断：仅日志异常原因类和堆栈位置；模拟正常 create 后立刻 cancel，或者保存一次有效创建请求用于复现，均用合成资料，避免读取真实客户。

验收脚本早先联网失败是脚本只认 `data: `，Spring合法 SSE 是 `data:`；已经修正，联网实际通过，不需要再修服务。脚本目前增加 `--chat-only`、`--task-only`，HTTP错误只打印安全错误码。最终完整验收预期五条 PASS。若模型耗时长，脚本可补定时 heartbeat；真正手机已有心跳，不应通过取消设备检查绕过。

最终资料验收内容：提交幂等、非法会话拒绝、真实SDK读取授权客户和附件、Markdown产物、离页回列表、确认前不写业务、重复确认同一ID、数据库 receipt/待办各1条、PC可以解密读回标题、dueAt与proposal时间相同。清理只针对本轮合成fixture，审计保留。

## 运行环境与续跑

- Node 使用 `/Users/shangjunhao/.nvm/versions/node/v24.14.1/bin` 放 PATH 前；默认环境有旧 Node。
- JDK21：`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`。
- Docker 容器：`yudao-local-server-1`、`yudao-local-ai-service-1`、`yudao-local-agent-service-1`、mysql、redis。最新后台镜像 `39c1208904e6`（含安全诊断），AI `5c977eb23d93`，Agent `e87c99adc4a0`。后台/AI/Agent当前健康。
- API `http://127.0.0.1:48080`，手机 Tailscale `100.87.254.68:48080`，保留。
- `.env.local` 与 `.android-signing.local.json` 为忽略的真实凭据，**不要打印/提交/打包**。脚本支持 admin默认本地账户，令牌不输出。
- 后端增量包：Maven `-pl yudao-server -am package -DskipTests`；测试另跑相关模块。已有 `/private/tmp/ai-market-api-runtime/Dockerfile` 从当前后台镜像只复制 jar；把 `apps/ruoyi-vue-pro/yudao-server/target/yudao-server.jar` 拷到该目录 `app.jar`，`DOCKER_BUILDKIT=0 docker build -t yudao-local-server ...` 后用完整Compose重建server，避免Docker整套Maven重复下载。
- 完整Compose在 apps/ruoyi-vue-pro：`CALLPHONE_TAILSCALE_IP=100.87.254.68 docker compose -f compose.local.yml -f compose.tailscale.yml -f ../ai-service/compose.ai.yml -f ../ai-service/compose.agent.yml --profile ai --profile agent up -d --no-build --wait --wait-timeout 180 server ai-service agent-service`。不重置卷。
- Node22 官方镜像首次拉取网络失败，已通过公开镜像 `docker.m.daocloud.io/library/node:22-bookworm-slim` 获取并标记；依赖锁已固定，实际SDK可在容器联网。
- Browser Bridge 技能已读，代理 `/root/chat_display_verify` 报告：daemon/extension连通，但 access disabled，Chrome后台；tabs ACCESS_DENIED。按技能停止，无页面实际点击验证，也未反复请求Enable。可继续静态与组件验证；若用户开启访问再测页面。mock预览5202进程21047已停止；其他真实服务保留。

## 本任务文件（均当前未提交，保留）

- Agent：src/web-chat.js、test/web-chat.test.js、src/main.js、src/server.js、package.json、.dockerignore、README.md。
- AI：src/main/java/cn/callphone/ai/{WebChatGateway,ChatService,ModelGateway,Protocol,SpringAiModelGateway}.java，src/test/.../{WebChatGatewayTest,ChatServiceTest}.java，.env.example、compose.agent.yml、README.md。
- 手机：src/pages/ai-chat/index.vue、src/components/AgentTaskPanel.vue、src/services/{ai-chat,ai-chat-sse,ai-task-files,ai-task-android-file}.ts、src/types/ai-chat.ts、src/ui/chat-markdown.ts、tests/{ai-chat,chat-markdown,ai-task-android-file}.test.cjs。
- 后端：script/callphone-local-up.sh，module-callphone controller/mobile/MobileAgentTaskController.java，service/agent/{AgentFollowUpService,AgentTaskRelay}.java，service/ai/MobileAiRelay.java，test/.../MobileAgentTaskControllerTest.java、AgentFollowUpServiceTest.java（其他对应已有测试未改）。
- scripts/configure-agent-local.py、scripts/ai-feature-live-smoke.py、本交接文档。

日志：/private/tmp/ai-market-agent-web-tests.log、ai-market-ai-web-final-tests.log、ai-market-mobile-web-tests.log、ai-market-complete-api-final-tests.log、ai-market-api-observability-build.log、ai-market-mobile-ai-final-type.log。

其他会话的导航/图标/更新/Changelog/Git hooks/manifest/README等修改不属于本轮，详情看 git diff，不覆盖。最新 manifest 1.0.7(105)，已有包 `apps/call-phone-uni/dist/release/apk/tongzige-1.0.7-20261014-fix.apk`，新包若要制作应以它为基础，不能退回1.0.6。编译资源 dist/build/app 当前曾通过构建，但结束前需重新核对最新改动。

## 展示类型的准确回答

已接组件：普通/流式文本、Markdown标题/列表/加粗斜体删除线/引用/分隔线、表格、行内代码/代码块（语言标签和横向滚动，无语法高亮）、HTTP(S)图片及预览、网页来源链接及打开、资料任务状态/事件/Markdown报告、待办确认卡/完成回执。

未实现：语音气泡/音视频播放、PDF/Office预览与读取、外部连接器、交互图表、HTML应用、Mermaid/LaTeX专用渲染。模型输出这些内容不代表可以执行或渲染。语音/PDF/Office暂未本轮扩散实现；用户强调至少联网、现有完整，先完成剩余真实任务闭环。

## 继续完成顺序

1. 保留工作区先定位 task POST503，修复并跑 task-only；不要重复付费联网测试来诊断任务。
2. 真实确认链路通过后整理验收证据，运行受改动影响的测试；安全日志改动目前编译/部署通过，还需相关测试。
3. 如完成移动交付，用最新1.0.7固定原生APK替换最新App编译资源，移除旧签名并16KiB对齐、用本地原证书重签，核验新资源/原生dex&so&图标/证书一致，避免把UTS源码或凭据放入APK。既有 `/private/tmp/callphone-finish-safe-pack.py` 是旧1.0.6脚本，只作参考，不直接运行。
4. scoped Git提交及CHANGELOG需避免混入其他会话（可先协调共享日志状态）。最终向用户说明已修复的真实断链、展示类型和仍待真机验收边界，附 APK/验收文档。
