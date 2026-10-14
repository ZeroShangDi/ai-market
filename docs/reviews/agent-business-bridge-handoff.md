# Agent 业务桥接原型交接（2026-10-14）

状态：业务桥接已独立提交；Java 模块编译和新增 JUnit 已实际通过，MySQL v59 未应用。宿主默认 Java/Maven 不可用，但续作已找到 HBuilderX 自带 Java 17，并将 Maven 下载到 `/private/tmp`，未全局安装。完整模块回归结果见下方。

## 文件

以下路径均相对于 `apps/ruoyi-vue-pro/yudao-module-callphone/`：

- `src/main/java/cn/iocoder/yudao/module/callphone/controller/mobile/MobileAgentTaskController.java`
- `src/main/java/cn/iocoder/yudao/module/callphone/service/agent/AgentActor.java`
- `src/main/java/cn/iocoder/yudao/module/callphone/service/agent/AgentTaskRelay.java`
- `src/main/java/cn/iocoder/yudao/module/callphone/service/agent/AgentFollowUpService.java`
- `src/main/java/cn/iocoder/yudao/module/callphone/dal/dataobject/agent/AgentFollowUpReceiptDO.java`
- `src/main/java/cn/iocoder/yudao/module/callphone/dal/mysql/agent/AgentFollowUpReceiptMapper.java`
- `src/main/resources/sql/mysql/callphone-v59-agent-followup-receipt.sql`
- `src/test/java/cn/iocoder/yudao/module/callphone/controller/mobile/MobileAgentTaskControllerTest.java`
- `src/test/java/cn/iocoder/yudao/module/callphone/service/agent/AgentFollowUpServiceTest.java`

另修复既有 `service/acquisition/TrackingCodeServiceImpl.java` 一行 `matches.getFirst()` 为 `matches.get(0)`：项目要求 Java 17，但 `List.getFirst()` 为 Java 21 API，实际阻塞整个模块编译；前一行已严格保证列表只有一个元素，因此行为不变。此修复经主任务明确授权。数据库初始化脚本和总体协议文档由主任务更新。

## 已实现边界

- `/api/v1/mobile/ai/tasks` 创建、列表、详情、产物、取消和确认接口。协议使用 `{data:...}`，错误使用 `{error:{code,message}}`；所有业务 ID 在线路上均为十进制字符串。
- 复用 AI 对话入口的管理员会话、设备密钥、设备 scope 和租户校验；内部身份来自登录上下文，不转发客户端内部请求头。
- 创建请求限定 UUID、正数 Long 范围的字符串 ID、2000 字符提示词、TXT/MD 附件和 64 KiB UTF-8 内容。客户端自带的客户快照和身份字段丢弃。
- 查询客户显式限制租户、当前用户、active 状态；只解密 id/name/stage，未向 Agent 提供电话号码、完整自定义字段或其他客户信息。
- `AGENT_SERVICE_URL` 默认 `http://127.0.0.1:48082`，`AGENT_INTERNAL_TOKEN` 至少 32 字符。内部请求附服务 Bearer、X-AI-Tenant/User/Device；创建 Idempotency-Key 等于 request_id。
- 请求并发上限 16，连接超时 3 秒，请求响应头和响应体分别限时 15 秒，响应体最大 1 MiB；不跟随重定向。
- 确认先获取执行服务的权威 task/proposal，再检查 `callphone:followup:save`、客户当前归属、任务状态和建议格式。模型没有业务写入工具。
- 使用 TransactionTemplate 将幂等回执和真实加密跟进事项同时提交；唯一键为 tenant/user/agent_task_id。并发冲突读取胜者回执；重试不会新建第二条事项。
- 业务提交后单独上报执行服务回执。上报失败客户端可重试确认；存在本地回执时允许对 cancelled/completed 执行任务进行回执对账，仍不会为 cancelled 或 completed 且无回执的任务创建新事项。
- GET 详情和列表自动补报本人已提交的回执，防止刷新后已创建事项被显示为可取消的新建议。这类读请求只补报既有提交，不创建业务事项；补报失败返回已提交的 `follow_up_task_id` 和 `confirmation_pending:true`。确认接口提交后补报失败也返回此结果，不将已提交业务伪装成全部失败。
- 已提交回执对账不再要求客户仍为本人 active 客户，避免转移客户后无法补报；新建事项仍严格重查客户归属和 active 状态。
- 跟进 due_at 解析带偏移的 ISO 时间并转 UTC，与现有业务保存时间方向一致。
- 加密结果在事务前校验既有 title/content 密文列长度（1024/4096），避免中文内容 Base64 膨胀造成数据库写入失败。运行服务同步限制 proposal content UTF-8 体积。
- 全部接口关闭附件/产物请求响应日志，并提供本地异常处理，避免进入共享异常日志保存内容。

## 已完成检查

- `git diff --check` 成功；注意 Git 对未跟踪文件不显示 diff，需要提交前再次检查新文件。
- 检查 ApiAccessLog 只允许 METHOD，已将注解放置于每个接口方法。
- 核对已有 FollowUpTaskDO、CustomerMapper、PiiCryptoService 和现有跟进保存逻辑。
- 写入并实际执行新增 JUnit 测试：输入剥离、UTF-8 限制/字符串 ID、设备租户身份、权威建议确认顺序、加密写入和 UTC 时间、已提交回执取消对账、归属和权限拒绝、建议格式拒绝、刷新自动回执及失败 pending 状态、密文膨胀拒绝。总计 10 项。
- Maven reactor 编译全部 Call Phone 主代码和测试代码，完整 Call Phone 模块回归 **136/136 通过，0 失败、0 错误、0 跳过**，包含新增 10 项测试。最终 `BUILD SUCCESS`。日志 `/private/tmp/ai-market-agent-java-all-test.log`，Surefire 报告在模块 `target/surefire-reports/`。测试运行时 Mockito 需要 JVM 自附加权限，受限沙盒第一轮无法附加；获自动授权后在离线环境运行通过。
- 查验 Spring Boot 3.5.15 实际依赖类：`TransactionAutoConfiguration$TransactionTemplateConfiguration.transactionTemplate(PlatformTransactionManager)` 存在。真实应用启动仍需具备事务管理器；测试使用 mock 模板，不等同运行期 Bean 联调。

## 下一步验证

在 `apps/ruoyi-vue-pro` 运行（已实际执行）：

```sh
JAVA_HOME=/Applications/HBuilderX.app/Contents/HBuilderX/plugins/amazon-corretto /private/tmp/apache-maven-3.9.9/bin/mvn -B -o -pl yudao-module-callphone -am test '-Dtest=%regex[cn/iocoder/yudao/module/callphone/.*Test.class]' -Dsurefire.failIfNoSpecifiedTests=false -Dmaven.repo.local=/private/tmp/ai-market-agent-m2 -Dflatten.skip=true
```

下一步应用 v59，启动 Java 与独立 Agent 服务并做真实用户/设备联调。重点验证：

1. 同一任务并发确认，在真实 MySQL 上只创建一条事项；源码 mock 测试不能证明数据库并发行为。
2. 业务事务提交后强制令 Agent 回执失败，重复确认恢复为同一 follow_up_task_id。
3. 业务提交与取消交错时，Node 接受已提交回执并完成对账。已与执行服务开发者对齐实现，但未做 Java/MySQL/Node 端到端验证。取消不撤销已提交的跟进事项。
4. 其他租户/用户无法访问任务或客户，设备撤销无法继续访问，前端可下载中文文件。
5. 运行环境注入 TransactionTemplate、MyBatis 新 mapper 扫描以及 HTTP 响应体关闭超时按预期工作。

待后续工程完善：已提交回执可增加后台对账任务，当前通过详情/列表刷新和重复确认补报；Conversation ID 当前只验证格式，不调用聊天服务检查实际存在，可能产生本人名下的孤立任务，但无法访问其他用户任务。连接器租户身份不由前端指定。
