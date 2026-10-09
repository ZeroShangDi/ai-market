# 公共数据库与 API 契约规则

> 所有业务模块文档都继承本页规则。产品 API 是稳定边界；接入 Yudao 时，由 Controller/转换层映射到 Yudao 的 `/admin-api`、`/app-api` 及 `tenant_id`，PC 和手机不直接依赖 Yudao 的内部 DTO。

## 1. 数据所有权与部署

- 客户业务数据归客户 workspace 所在的数据平面。产品方控制平面只存部署注册、授权、功能权益、调用配额和风控信号。
- 每张业务表只能有一个模块所有者。跨模块关联使用稳定 ID 和公开 API/领域事件，不复制客户、成员或设备主记录。
- `docs/modules/*.md` 中的简短表名是逻辑实体名；Call Phone 自有表在物理 MySQL schema 中统一使用 `cp_` 前缀（如 `customers` → `cp_customers`），避免和模板现有 `crm_*` 表及未来模板升级冲突。复用的 Yudao 系统表沿用原表名，不复制出 `cp_users`、`cp_roles` 等第二套身份表。
- 文档中的 `workspace_id` 是逻辑隔离范围。首期 Yudao 部署一个 workspace 对应一个 `tenant_id`，物理 schema 使用 Yudao `tenant_id`，不重复存两列；若以后一个租户需要多个 workspace，再显式增加 `workspace_id`。
- workspace/tenant 从有效会话推导，客户端不得通过请求体覆盖。全量、导出、异步任务、文件访问都执行相同租户和数据范围条件。
- 除需对账的金额/统计快照外，统计数字从数据平面计算；不得从产品授权服务读取客户统计。

## 2. 数据库类型、审计与约束

- 主键使用 Yudao 雪花 `BIGINT`；JSON 统一以十进制字符串表示 ID，避免 JavaScript 精度损失。外键 ID 也使用字符串传输。
- 物理库首期 MySQL/InnoDB、`utf8mb4`。业务时间以 UTC 毫秒精度保存为 `DATETIME(3)`；界面按 workspace 时区显示。所有范围筛选使用左闭右开 `[from,to)`。
- 新业务表包含 `tenant_id`、`creator`、`create_time`、`updater`、`update_time`、`deleted`（遵循 Yudao BaseDO/租户实现）。业务归档使用 `archived_at`/状态事件，不将软删除当作归档。
- 外部来源 ID、幂等键和设备事件 ID建立租户范围的唯一约束。状态变化应写追加式事件或操作日志；不可通过更新当前状态抹去历史。
- 枚举值用稳定小写 snake_case key；数据库不使用中文 label。面向用户的名称、排序、是否启用由字典/配置表管理。
- 可编辑配置增加 `version` 或 `updated_at` 条件更新；写接口传 `expected_version`，冲突返回 `VERSION_CONFLICT`，避免覆盖他人的更改。

## 3. 敏感字段

- 姓名、手机号、邮箱、会话内容和录音属于敏感数据。响应按权限返回掩码字段与独立的明文权限能力；无权时不返回空字符串伪装为有权。
- 手机号如需在静态数据库备份中降低暴露，保存加密值；精确重复检查可另存密钥化 HMAC 搜索值。禁止把原号码放进普通索引、日志、埋点、异常和 AI 审计正文。
- 手机号全文模糊搜索不作为默认能力。确有业务需求时仅在后端执行受权限控制的后缀/精确匹配，并记录审计；HMAC 不能直接支持任意子串查询。
- 录音、附件放客户控制的私有对象存储；数据库只保留 object key、校验值、大小、保留期和授权状态。读取通过一次鉴权后发放短时访问能力。
- 产品方 AI API 只接收用户当前操作所必需且确认授权的最小字段；禁止上传客户 ID、完整手机号、联系人映射、原始录音或本机路径。若业务必须处理录音，需单独设计脱敏/转写、同意、保留和删除合同。

## 4. HTTP 与 JSON

- 客户 API 稳定前缀 `/api/v1`；HTTPS only。API Base URL 由客户部署配置提供。`/api/v1` 的领域资源不带 Yudao 的 admin/app 内部前缀。
- JSON 使用 `snake_case`；ID 以 string 返回；时间为 ISO 8601 UTC，例如 `2026-10-04T01:02:03.456Z`；枚举返回稳定 key 和显示 label（如字典项）。
- 成功信封 `{ "data": ..., "meta": ... }`；错误信封 `{ "error": { "code": "...", "message": "...", "details": ..., "request_id": "..." } }`。错误码稳定、可本地化文案由 UI 映射，不让客户端解析后端异常文本。
- 分页：`page` 从 1 开始，`page_size` 默认 20、最大 100；返回 `meta.total,page,page_size`。列表 sort 必须由字段 allowlist 校验，禁止把客户端字符串直接拼接 SQL。
- 列表筛选参数使用模块文档列出的白名单；日期统一 `[from,to)`。搜索只定义可查字段，不能自动遍历所有文本/敏感列。
- HTTP 方法：GET 只读；POST 新建或执行命令；PATCH 修改局部配置/备注；DELETE 只用于可安全删除且无历史引用的草稿资源。业务历史优先使用 archive/disable/revoke 命令。

## 5. 身份、权限、幂等与状态

- PC 会话、移动设备凭据和产品方服务凭据相互独立。移动端采用设备可撤销的刷新令牌；服务端存令牌哈希，访问 token 短期有效。
- 每个端点声明 permission key 和数据范围。服务端检查 tenant + 角色权限 + 行范围 + 字段范围；前端菜单/按钮隐藏不构成授权。
- 会造成新增/扣额/上传/派发的命令需 `Idempotency-Key`；响应重复键返回首次结果。移动插件回调另带 `device_event_id` 并受唯一约束保护。
- 状态机转移只能经领域命令执行；重复完成可幂等返回，非法后退返回 `STATE_CONFLICT`。返回当前状态和允许操作，客户端不自行推断。
- 错误至少区分 `AUTH_REQUIRED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_ERROR`、`VERSION_CONFLICT`、`STATE_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`RATE_LIMITED`、`SERVICE_UNAVAILABLE`。避免用 404 泄漏超出用户范围的资源存在性。

## 6. 异步操作与文件

- 批量导入/导出、海报渲染、AI 生成、知识解析、备份/恢复是异步资源，返回 `job_id,status`；通过 `GET /api/v1/jobs/{job_id}` 轮询状态。作业绑定发起用户、tenant、筛选快照、取消能力与结果保留期。
- 导出重新按当前用户数据范围计算；下载前再次授权。文件名与错误行不得泄漏没有权限的记录。
- 上传先创建上传会话/凭证，再直传客户对象存储，最后由数据平面校验大小、MIME、校验和、病毒扫描状态后入库。任何 API 不接受客户端任意远程 URL 作为服务端下载地址。
- 页面必须为 loading、empty、partial failure、no permission、offline/pending sync、expired/failed job 等状态预留数据字段和错误码。

## 7. API 文档到实现的完成定义

每个页面/API在开始实现前须有：请求/响应 DTO、字段来源与是否敏感、枚举、校验、权限 key/数据范围、错误码、幂等/版本条件、状态转移、所属表/索引、审计要求、对应 Yudao 模块及迁移方式。没有后端持久化能力的 mock 展示要在契约中标记 `prototype_only`，不能当成已实现接口。
