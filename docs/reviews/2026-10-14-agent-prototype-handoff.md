> 历史存档：本文所述旧资料任务已于 2026-10-15 退役，相关代码、入口与旧演练脚本已删除；不作为当前启动/部署指引。当前能力与清理结果见 [总 issue](../issues/ai-agent-capability-roadmap-issue.md)。

# Agent 原型接力说明

更新时间：2026-10-14（Asia/Shanghai）。用户因额度即将用完要求做好接力准备。

## 用户目标与已确认范围

将现有文字聊天扩展为可持续优化的助手，最大限度复用非业务通用 AI 能力。先跑通：手机上传资料/交办 → 读取资料和授权客户数据 → 生成可下载结果 → 对话确认业务写入 → 离开页面继续执行 → 完成后汇报。实时语音后置，倾向放在桌宠；开放连接器优先，主要维护自有连接器。

用户已授权实现原型，并明确允许并行开发；续做时确认只有 DeepSeek API，并已填写本地密钥以进行联调。用户后续明确确认此前填在 Anthropic 字段的也是 DeepSeek Key，已补填 DEEPSEEK_API_KEY，模型联调授权已明确。用户随后要求本轮按功能拆分提交，提交描述用中文；未要求推送或部署。先前键盘间距修复为独立提交。

## 当前工作树注意事项

共享工作树有其他会话正在修改移动入口、图标、资源、权限与打包等内容。不要 `git add .`、重置工作树或把其他会话改动当作本轮改动。`docs/README.md` 和 AI 页面也有其他改动，只能按内容增量处理。

本轮代码按 Java 兼容修复、Agent 执行服务、业务桥接、移动端、运行配置/验证脚本、契约/验收文档分拆提交。提交审查见 [提交范围与剩余内容](2026-10-14-agent-commit-review.md)。三个开发子任务分别负责执行服务、业务桥接与移动端；接手时查看下面的详细说明和最新源码，不要重新开始。

## 本轮新增实现

### Agent 服务

- `apps/agent-service/`：Node 22+，独立内部 HTTP 服务，默认 48082；Claude Agent SDK 和 Zod 固定依赖及锁文件已安装。
- TaskStore 持久化平台任务，与 SDK 会话分离；排队、事件、取消、超时、待确认/完成、文件产物、幂等、身份隔离、重启中断处理。
- Claude SDK 只暴露自定义 `read_attachment/query_customer/submit_report` 工具。无任意 Bash/文件/网页工具；不复用本机 Claude 订阅凭据。
- 专家/技能资源有版本。默认跟进专家；第二个资料核查专家及 `attachment_metrics` 工具验证复用同一执行循环，当前手机入口仍固定默认专家。
- 新增显式 `AGENT_PROVIDER=anthropic|deepseek`；DeepSeek 使用官方 Anthropic 兼容端点与独立密钥字段，仍复用 Claude Agent SDK，不引入 DeepSeek Harness。DeepSeek 不宣称 SDK 费用估算可作为可靠预算，保留轮数和时间限制。
- `query_customer` 返回后端在提交时读出的授权客户快照，不是执行期间实时查询；后续真正的连接器可替换该适配。
- 真实模型联调发现快照适配将缺失 notes 默认成空字符串，已修复为保留缺失，并明确专家不能把未提供字段解释为无记录；增加实际 HTTP 执行输入回归测试。
- 详细交接见该目录的 `HANDOFF.md`（子任务完成时写入）及 `README.md`。

### 客户后端桥接

- 新增 `MobileAgentTaskController`、`service/agent`、`dal/dataobject/agent`、`dal/mysql/agent`。
- 复用员工、租户、配对设备认证和 AI 权限，读取当前用户所属的活动客户，最小快照只含 ID/姓名/阶段。
- 确认取服务端建议，再检查 `callphone:followup:save` 与客户归属，事务提交加密跟进待办和唯一幂等回执，再通知执行服务。
- `callphone-v59-agent-followup-receipt.sql`；初始化脚本上限从 58 调整为 59。已有数据库没有自动执行该迁移。
- 已处理业务提交后取消/回执失败：优先读取已有回执；GET/list 自动尝试补送，失败返回已提交待办 ID 与 `confirmation_pending:true`；内部权威回执可把取消状态对账为完成，不重复写入。已有回执不因客户随后转移而丢失。
- 待办内容限制 3000 UTF-8 字节，并核验加密后的列容量；编译时发现并修复既有 `TrackingCodeServiceImpl` 的一行 Java 17 兼容问题（已检查单元素列表后 `getFirst()` 改 `get(0)`）。
- 详细交接见 `agent-business-bridge-handoff.md`（子任务完成时写入）。

### 移动端

- 新增 `AgentTaskPanel.vue`、`services/ai-task.ts`、`services/ai-task-files.ts`、`types/ai-task.ts` 与相关测试。
- 对话内资料任务入口，选客户/文件或粘贴资料、任务进度、待办确认、结果预览/保存。
- 离页暂停轮询，不取消服务端任务；回页刷新；身份变化清空，旧响应不回灌。
- 演示模式资料任务明确禁用，不向真实 API 发送请求、不冒充真实执行。
- 待办回执待同步时显示已创建，支持核对同一确认；普通取消任务仍不可确认。纯资料任务会话点击新会话生成新 ID。提交/确认/取消期间暂停轮询，防止覆盖结果。
- H5 保存使用 Blob；App 保存到私有目录并尝试打开。App 文件选择是否可用依赖平台，支持明确粘贴回退；真机尚未验证。
- 详细交接见 `agent-mobile-handoff.md`（子任务完成时写入）。

### 主任务集成

- `docs/contracts/mobile-agent-task-contract.md`：共享 API、状态和边界。
- `scripts/configure-agent-local.py`：生成并保留 Agent/客户后端匹配的内部令牌，忽略文件权限 0600，不打印秘密。已执行，`.env.local` 未纳入 Git；保留已有配置。
- `apps/ai-service/compose.agent.yml`：独立 agent profile 部署覆盖文件，数据卷挂载 `/data`，与 Dockerfile 一致。
- `scripts/agent-prototype-smoke.mjs`：显式本地执行替身的 HTTP 演练；不调用模型、不读写真实 CRM。可选输出 Markdown 文件路径。
- `scripts/agent-sdk-transport-smoke.mjs`：真实 SDK 与 CLI 执行进程连接显式本地 Messages API 模型替身，验证四轮传输、三个工具及报告提交；不使用真实密钥。该检查捕获并修复 SDK 不允许 fallbackModel 等于主模型的问题。
- `scripts/agent-model-smoke.mjs`：显式真实模型联调入口，虚构资料与客户、不连接业务数据库；运行需本地 provider 密钥。

## 已核验结果

- Agent 最新 23 项离线测试通过，提交审查增加未完成首次保存目录、排队取消释放容量、实际磁盘故障回执重试回归；此前生命周期、身份、工具、专家、provider、缺失字段和竞态测试仍通过。
- 移动端此前共享工作区 115/115 测试通过；提交前另用仅本轮改动的独立快照验证 106/106 通过，包括新增 6 项实际组件并发行为测试。快照不含其他会话的图标/应用入口测试，因此不能直接比较数量。
- 主任务 HTTP 演练通过：排队 → 执行 → 待确认 → 完成、产物读取、同键重放、重复回执。样例产物位于 `/private/tmp/agent-prototype-follow-up.md`，明确标为测试产物；不是模型真实生成。
- 配置脚本在临时目录验证通过：保留已有字段、重复运行不换令牌、两端匹配、冲突拒绝、0600 权限。
- 真实 SDK/CLI 本地传输冒烟最终回归通过：4 轮 Messages 请求，实际读取资料/客户工具、报告提交；无外部模型调用、无真实业务写入。`fallbackModel` 初始化问题已修复后重新验证。
- **真实 DeepSeek 联调通过**：使用用户明确配置的 Key、虚构客户和资料，Claude Agent SDK 实际调用两个读取工具并提交报告，TaskStore 持久化为 awaiting_confirmation，产物鉴权读取成功。最终报告 1360 字符，含用户确认前的待办建议，未读写真实客户数据库。共三次真实模型任务，第二/第三次针对已发现的事实边界问题复核；最终样例明确写出“未提供备注/历史资料”，不再被适配为空值。见 [验证记录](2026-10-14-agent-deepseek-validation.md) 与 [真实模型虚构样例](artifacts/2026-10-14-deepseek-synthetic-follow-up.md)。
- `git diff --check` 通过。
- 移动类型检查及 App/H5 构建通过；仅现有 Sass 弃用提示。浏览器工具不可用，未完成视觉验收；本轮预览服务已关闭。
- Java 主代码及测试源实际编译成功；Call Phone 全模块 136/136 测试通过，包括新增 10 项桥接/回执测试。使用 HBuilderX 自带 Java 17 与 `/private/tmp/apache-maven-3.9.9`，未全局安装；日志 `/private/tmp/ai-market-agent-java-all-test.log`。未连接真实数据库。

提交前另修复五处问题：首次保存中断的目录导致全服务启动失败、取消排队任务仍占队列、回执保存失败却在内存标完成、旧产物响应覆盖最新点击、成功提交清空用户新资料。独立移动快照类型检查及 App/H5 构建通过，证明本轮可独立于其他未提交 UI 功能提交。

## 尚未验证与阻塞

1. Java 编译/测试已完成；真实 v59 数据库迁移与客户后端启动尚未执行。
2. Docker/MySQL 命令不在当前环境，尚未构建部署镜像/验证 Compose。不要误报已部署。
3. 手机 → 真实客户后端 → 真实模型 → 数据库确认写入的完整链路尚未联调。模型单链路已通过，不等于业务端到端验收完成。
4. 浏览器视觉验收，以及 App 文件选择、文件打开、离页/后台返回和实际键盘布局需真机验收。
5. 目前是单实例原型，无全量生产多租户进程沙箱、加密任务存储、清理策略和断点续跑；私有目录不等于完整隔离。

## 接手顺序与命令

先阅读此文、三个子任务交接和共享契约，检查新增代码与当前工作树，再按顺序：

1. 检查最新源码与记录；离线测试/构建已通过，无新变化不重复大量检查。
2. 真实 SDK 传输替身回归已完成；只有执行器再变更才需要重跑。
3. DeepSeek 配置及真实模型 smoke 已完成，无新执行器/输入边界变化不重复付费测试。不输出密钥值，不把凭据交给前端。
4. 执行 v59、启动 Agent/客户后端，在一个已授权测试客户上跑真实链路；使用专门测试待办核验重复确认不会重复插入。
5. 核验真机保存/返回与产物内容；第二专家扩展离线验证已完成。
6. 本轮已按功能提交，提交描述中文；后续仅暂存本轮相关文件/增量，不把其他会话代码混入。

```sh
# 仓库根目录，本地替身演练，需允许本机回环端口监听
node scripts/agent-prototype-smoke.mjs /private/tmp/agent-prototype-follow-up.md
node scripts/agent-sdk-transport-smoke.mjs
# 用户授权且 provider 密钥已正确配置后，真实模型，虚构资料，无数据库写入
node --env-file=apps/agent-service/.env.local scripts/agent-model-smoke.mjs /private/tmp/agent-deepseek-follow-up.md

# 执行服务
cd apps/agent-service
npm test
npm run check
npm start

# 移动端，在 apps/call-phone-uni 下；直调现有依赖避免 pnpm 自动尝试重装
node --test tests/ai-task.test.cjs
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p app
node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build

# Compose 在仓库根目录，有环境/迁移且确认要启动测试部署后执行
docker compose -f apps/ruoyi-vue-pro/compose.local.yml -f apps/ai-service/compose.agent.yml --profile agent up -d --build agent-service server
```

`npm start` 从服务目录读取已忽略的本地配置。对应 provider 的 API Key 为空时真实任务明确失败，是预期行为。不要把测试替身启动成生产默认模式。
