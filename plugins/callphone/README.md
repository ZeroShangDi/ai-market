# 客户业务插件：首轮线索导入

本轮仅完成一个入口：上传 CSV，发送“请把附件中的线索导入系统”，查看检查结果并授权导入，获取逐行回执。获客活码、分配和手机拨号任务留在能力清单中，未在此实现。

## 所属内容

- `work-plugin.json`：工具名称、展示标签和风险声明。
- `index.js`：插件激活与导入授权字段。
- `leads.js`：CSV 解析、预览、导入 MCP 工具及后台连接器。
- `skills/import-leads/SKILL.md`：模型执行该任务的步骤。
- `test/fixtures/work-leads.csv`：三条虚构测试线索，名称标记“勿拨号”；仅用于导入验证。

后台业务适配位于 callphone 模块的 `controller/admin/leads/LeadPluginController` 与 `service/leads/LeadPluginImportService`，复用 `LeadCreationService`。原页面创建与插件导入使用相同创建和自动分配规则。Work 通用接口不承载这些领域规则。

## 配置与权限

启用本插件路径，并设置 `WORK_BUSINESS_URL` 为固定的后台 `/admin-api/callphone/plugin/leads/import` 地址，设置与后台一致的 `AGENT_INTERNAL_TOKEN`。Docker 编排包含地址与插件路径配置；密钥仍沿用部署配置，不放入技能或模型命令环境。

连接器携带服务端绑定的租户、用户和内部凭据；后端每批校验凭据、租户、启用用户及 `callphone:ai:chat`、`callphone:lead:create` 权限。客户端不能通过模型参数切换用户。

## 当前边界

仅 UTF-8 CSV，最多 5 MiB、500 行数据、40 列；支持中文表头和明确字段映射。先预览并生成文件/映射指纹，授权后复验，再按最多 50 行分批提交。错误行不写入，网络结果不确定时停止后续批次并明确显示未知/未执行。

幂等键基于用户、文件/映射指纹及行号，保障同一原文件重试。它不是手机号去重；修改或重新生成文件可能产生新导入，请先核对。沿用后台自动分配设置；本轮没有新增分配流程。

## 验证方式

插件测试随 agent-service 的 `npm test` 执行。仓库根目录运行 `node --env-file=apps/agent-service/.env.local scripts/work-lead-import-smoke.mjs --exercise` 可进行真实模型演练，需要已配置模型凭据。演练使用隔离内存业务替身，不写真实数据库；自动批准仅限脚本中的三条测试数据。

2026-10-16 已通过真实模型发现技能、检查附件、导入授权、首次导入、重复导入与 WorkStore 重启后结果回放。后台接口及业务服务由 Java 测试验证。尚未部署、连接真实数据库完成端到端验收或真机验证；不得把模型演练当作生产导入成功。

## 标准 MCP 独立入口

在本目录执行 `npm ci`，由受信任部署者配置环境后运行 `node server.js`。其他 MCP 客户端使用自己的 stdio 配置连接，不依赖 Agent SDK。原 Work 适配继续使用 `work-plugin.json`，共用同一工具实现。

环境：`WORK_WORKSPACE`（授权文件目录）、`WORK_RESOURCES_FILE`（受管理的附件数组 JSON，每项含 id/name/path/sha256）、`WORK_TENANT_ID`、`WORK_USER_ID`，以及原业务连接器 `WORK_BUSINESS_URL` / `AGENT_INTERNAL_TOKEN`。这是服务端受管理部署入口，不应向普通用户分发内部令牌。外部普通用户管理工作请使用 `../work-control` 的账号鉴权入口。

独立 MCP 导入仍校验原文件摘要、字段映射与预览指纹，通过 MCP 用户表单确认写入；不支持表单的客户端只能预览，不能绕过审批。
