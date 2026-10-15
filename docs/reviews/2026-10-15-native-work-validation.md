# 官方 SDK 原生 Work 接入验证

> 后续部署状态：已核对 Workbuddy 的运行容器代码，并补齐手机监听及 Docker 沙箱兼容配置；从真实 Tailscale 手机入口验证文件处理、下载与续会话通过。以 [部署记录](2026-10-15-work-deployment.md) 为准，以下保留各阶段历史。

日期：2026-10-15，北京时间。范围和后续清单统一维护在 [总 issue](../issues/ai-agent-capability-roadmap-issue.md)。本记录为本地测试证据，不表示已部署或真机验收。

## 实际环境

- Claude Agent SDK 固定 0.3.211，未升级；macOS / Node 24.21.0。
- 当前配置提供方 DeepSeek，实际 init 模型 deepseek-flash；未切换提供方。此次验证 SDK 能力与兼容协议，不宣称 DeepSeek 模型行为/效果与 Claude 相同。
- Java 17（HBuilderX 自带 Corretto）、Maven 3.9.9，使用已有离线依赖缓存，无依赖版本改动。
- 无本机 Docker，因此未构建/运行新镜像；镜像所配置文档库、Linux bubblewrap 隔离不能当作已实测。

## 真实模型与 SDK

运行 `node --env-file=apps/agent-service/.env.local scripts/work-native-smoke.mjs`；脚本通过 WorkStore 与生产原生执行器使用 SDK query，不是替身模型或纯开关断言。只使用合成资料，不接触业务数据。未批准额外高风险动作；脚本仅自动答复合成测试问题。

最终通过运行的证据：系统临时目录 `work-native-smoke-2786Dv/evidence.json`，SDK session `edfc8835-6f17-4c4d-8a3d-b193e788c0cd`，三个 run 均正常返回。临时证据不提交仓库，重复运行生成新目录和新 session。

| 检查 | 实际结果 |
|---|---|
| 无客户、无附件 | 创建独立产品会话映射，完成工作区任务 |
| 受管理 Skill | 实际调用 Skill 加载 workspace-files |
| MCP | 实际 work.workspace_info 与 work.present_files；init 显示 connected |
| 原生提问 | AskUserQuestion 下发表名及选项，答复 test.csv 后继续 |
| 原生命令与文件 | Bash 前台命令生成 CSV，Read 核对，产物发布；服务端读取字节断言为 `name,count\nalpha,1\n` |
| 增量/工具结果 | text_delta、tool_start/tool_delta、完整 tool_call/tool_result、audit、interaction、artifact、result 均实际产生 |
| 重启后继续 | 关闭并重建 WorkStore，从磁盘重新读映射；resume 仍为同一 SDK session，记住此前代号 native-work-1015 |
| 文件修改 | 后续命令只追加 beta,2，不重建旧内容；最终字节 `name,count\nalpha,1\nbeta,2\n` |
| 私有目录边界 | Bash 实际读取本会话私有 mapping.json 被拒，输出 PRIVATE_READ_BLOCKED |
| 命令凭据隔离 | Bash 仅测试变量是否存在，不打印值；输出 ENV_HIDDEN，模型和内部服务凭据不可见 |

调试时曾出现 CC 在工作区临时目录创建通信 socket，导致普通文件检查误拦截；已将运行临时目录放到独立私有 runtime 并规范化真实路径，再完成以上通过运行。没有通过放宽沙箱或绕过路径检查解决。

## 离线契约与编译回归

- Agent：36 项 Node 测试。覆盖原有资料任务/联网、无附件会话、幂等/串行、隔离、原生工具配置、提问、批准同意/拒绝、重复/失效答复、重启过期、二进制字节、不可变产物、路径/链接、打断、SSE 断开和游标。
- Java：144 项 callphone 测试全部通过，包括新增 MobileWorkController 所有权、身份剥离、请求标识、下载字节及安全头；现有任务/聊天适配回归通过。命令见下。
- 手机：当前 162 项测试全部通过，其中本轮新增 5 项 Work 契约。新增覆盖离页不打断、返回回放、未知提交复用请求标识、切换身份丢弃迟到响应、离页时解除界面锁、精确答复及明确打断、旧快照不能覆盖新最终状态；总数包含工作区内其他任务新增的既有功能测试。
- vue-tsc 类型检查通过；App 构建通过（存在工具链原有 Sass deprecation 提示）。尚未安装到手机测试。

```sh
# apps/agent-service
node --test test/*.test.js
# apps/call-phone-uni
node --test tests/*.test.cjs
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p app
# apps/ruoyi-vue-pro；本机离线缓存，不作为部署配置
JAVA_HOME=/Applications/HBuilderX.app/Contents/HBuilderX/plugins/amazon-corretto /private/tmp/apache-maven-3.9.9/bin/mvn -B -o -pl yudao-module-callphone -am test '-Dtest=%regex[cn/iocoder/yudao/module/callphone/.*Test.class]' -Dsurefire.failIfNoSpecifiedTests=false -Dmaven.repo.local=/private/tmp/ai-market-agent-m2 -Dflatten.skip=true
```

## 追加：旧资料任务退役后的验证

原生接入完成后，用户要求评估并清理旧资料任务。此前“保留旧任务接口”的选择已撤回；上文 36/144/162 是清理前的阶段记录。当前源码删除旧链路并复核：

- Agent 18 项全部通过：保留 Work/联网/提供方检查；新增已退役路由返回 404、忽略旧任务目录且不改原文件的测试；实际官方 SDK 的 MCP schema/调用验证已迁到 work-sdk.test.js。
- 后端 134 项全部通过：共享身份和安全错误处理提取到 MobileAgentAccess，转发提取到 AgentRelay；原客户、跟进等业务回归通过。编译产物中不再存在旧任务 Controller、确认写入服务或回执映射类。
- 手机 145 项全部通过，类型检查通过：删除旧面板/专用状态与测试，将通用 Android 选择器及原始字节/回调/资源释放验证保留为独立能力。
- App 构建通过；启动脚本 shell 语法、简化后的聊天联调脚本 Python 语法通过；未运行会写业务系统的旧联调流程。
- 只移除代码和自动迁移入口，未连接/清空生产任务目录、数据库回执或已有业务待办。历史 v59 SQL 原文保留，不主动运行。

当前可调用能力以 [总 issue](../issues/ai-agent-capability-roadmap-issue.md) 和 [服务契约](../../apps/agent-service/README.md) 为准；历史手册已标为退役存档。

## 追加：Android 安心打包

- 补齐账号云端证书正常 APK 入口，保留现有个人证书正式包与公共证书调试基座入口；3 项打包契约测试通过，覆盖配置、令牌脱敏及“仅编译成功不能算提交成功”。手机全量测试现为 148 项，全部通过。
- 经用户明确授权本次原生编译材料上传，2026-10-15 17:58:51 HBuilderX 确认“已成功提交到云端”，任务为 Android 云端证书，版本仍为 1.0.9（107）。记录时处于队列中，未取得本次成品 APK，未安装验收。
- 用户当前手机配对家中 100.87.254.68 的后端，本机未能连接，按用户要求仅打包，未更新该服务器。安装新包不代表家中后端已具备本次 Work 接口。

## 后续验收

手机 Android 原始二进制选择、Office/PDF 打开及下载持久保存；目标服务器 Docker 构建及 Linux 沙箱；外部插件与业务 MCP；Office/PDF 各格式实际处理；子 Agent 真实模型执行及继承边界。它们已有接入路径或配置，不冒充真实验收通过。长期等待在当前 30 分钟进程预算和重启过期规则内，不等于持久流程调度。原生执行成功字段不替代业务完成核验。
