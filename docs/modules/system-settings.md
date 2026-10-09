# 系统设置

## 页面

系统设置下第三级页面：成员管理、团队与角色、数据权限、手机设备、电脑与配对、账户与授权、业务字典、客户字段、阶段与结果配置、本地备份与恢复、诊断与日志、扩展服务配置。

## 功能与字段

- **成员管理**：姓名、账号、状态、团队、角色、加入时间、最近登录；邀请、停用、重置会话、调整成员归属。
- **团队与角色**：团队树、角色名称、成员数、权限集、继承规则；危险操作显式显示影响范围。
- **数据权限**：角色/成员、对象、范围（本人/团队/全工作区）、字段级查看/编辑、导出权限。
- **手机设备/电脑与配对**：设备名、平台、版本、在线状态、最后同步、配对主体、令牌状态；支持撤销配对，不显示设备凭据。
- **账户与授权**：方案名称、功能额度、授权到期日、已配对设备数、续期状态。
- **业务字典**：字典键、选项、显示名、排序、启停；已被业务数据引用的选项只允许停用，不物理删除。
- **客户字段**：字段名、键、类型、必填、可见角色、列表展示、选项和顺序；字段键和类型创建后不可修改，已有枚举选项不可删除；停用字段保留客户历史密文值。
- **阶段与结果配置**：客户阶段/通话结果/无效原因等字典，颜色、顺序、终态标记；系统固定结果不可删除。
- **本地备份与恢复**：备份时间、范围、加密状态、校验结果、恢复预览；实际恢复需要二次确认和操作审计。
- **诊断与日志**：组件状态、错误码、时间、请求关联 ID、脱敏消息、导出状态；禁止展示令牌和原始敏感号码。
- **扩展服务配置**：集成名称、连接状态、授权范围、同步周期、最近错误、撤销授权；密钥仅通过专用密钥存储管理。

### 扩展服务配置（v28）

当前页面为企业微信、Call Phone AI 核心服务和私有对象存储维护单租户连接配置。凭据 JSON 使用部署密钥 `CALLPHONE_PII_ENCRYPTION_KEY` 通过 AES-GCM 加密写入 `cp_integration_connection.credential_ciphertext`，列表只返回 `hasCredentials`，绝不回传密文或明文。创建时 provider 固定为白名单之一；对象存储必填 `accessKey/secretKey/bucket`，`region` 可选，缺省 `us-east-1`；旧版三字段凭据仍兼容。更新留空表示保留原密文，提供新凭据时必须提交完整必填键集合。撤销会清除密文并增加版本，配置更新/撤销/检测均用 `expectedVersion` 做 CAS。只接受 HTTPS endpoint（不含 userinfo、fragment、query）。Yudao 操作日志只记录配置 ID/provider 与动作，不记录凭据。

- `GET /callphone/integration/list`：读取当前租户配置元数据，不读取凭据。
- `POST /callphone/integration/save`：body 保存 `{id?, provider, displayName, endpointUrl?, scopes, syncIntervalMinutes, expectedVersion}`；凭据使用 `X-CallPhone-Integration-Credentials` 请求头传输，内容为 UTF-8 JSON 的 Base64，避免 Yudao 默认访问/错误日志记录请求体时收集密钥。部署代理也须配置为不记录该请求头。
- `POST /callphone/integration/revoke?id=&expectedVersion=`：撤销并清除凭据。
- `POST /callphone/integration/test?id=&expectedVersion=`：企业微信仅调用固定官方域名的凭据与跟进成员只读权限接口，不保留返回的成员 ID；凭据应使用企业微信“客户联系 Secret”，或已加入“可调用应用”列表的自建应用 Secret。AI 核心服务复用授权查询，通过 `CALLPHONE_CORE_ALLOWED_HOSTS` 精确主机白名单与禁止重定向策略校验授权。对象存储复用 Yudao Infra 的 AWS S3 SDK，发起限时、签名、只读 `HeadBucket` 检测，不列举对象或读写文件；凭据至少需要目标 Bucket 的 `s3:ListBucket` 权限。成功返回 `connected`，失败只保存通用 `verification_failed` 和检测时间，不保存上游响应正文。三种 provider 的检测均不传输客户资料。接口权限说明见[企业微信官方客户联系接口文档](https://open.work.weixin.qq.com/api/doc/92284)。
- 权限 `callphone:integration:list`、`callphone:integration:manage`；SQL `callphone-v28-integrations.sql`。
- 自动同步仍禁用；仅企业微信与 AI 核心服务可手动检测。浏览器演示凭据只用于本地持久化 UI 流程，不发送到服务端，演示模式的连接检测按钮禁用。
- 本地预览入口：`/callphone-preview/integrations?preview=1`。

### 账户与授权（v29）

授权事实保留在 Call Phone 产品核心服务。客户侧本地后端仅代理读取方案状态、到期时间、设备额度和功能额度，不把摘要写入数据库，也不允许以客户本地可修改的数据作为核心功能的授权判断。AI 与其他受保护能力每次请求仍须由产品核心服务独立验权。客户姓名、手机号、通话记录等客户业务内容不会随授权查询上传；请求仅携带已配置的服务 API Key。

- `GET /callphone/entitlement/current`：读取授权摘要；`POST /callphone/entitlement/refresh`：重新查询产品服务。未配置/不可用状态返回明确状态和安全提示，不回传上游响应正文、凭据或地址。
- 上游接口为已配置核心服务基址下的 `GET /v1/entitlements/current`。响应包含 `status`、`planCode`、`planName`、`expiresAt`、`pairedDeviceCount`、`pairedDeviceLimit`、`features[]` 与可选账单链接；接口不接收客户业务字段。
- 配置 `CALLPHONE_CORE_ALLOWED_HOSTS` 为受信任的 HTTPS 精确主机名列表。后端拒绝未列入白名单的主机和重定向，连接/读取分别限制为 3/5 秒；上游账单链接也须命中相同白名单。
- 菜单权限 `callphone:entitlement:view`，迁移 `callphone-v29-entitlement.sql`；复用 `cp_integration_connection` 中加密保存的 `ai_core` 凭据，无新增授权缓存表。
- 本地预览入口：`/callphone-preview/entitlement?preview=1`；预览明确不生成套餐、授权和额度样例。

### 电脑与配对交互状态

- 「生成配对码」打开当前页面内的弹窗；配对码绑定当前工作区，默认 300 秒失效、一次性使用。弹窗展示倒计时、手机端操作路径、重新生成与关闭操作；不把配对密钥或 token 展示给用户。
- 手机确认后，当前列表刷新为已配对并展示手机名称、平台、最后活动时间和配对状态；过期码可重新生成，已使用码不可再次认领。
- 配对只关联已登录用户的桌面与手机设备，不扩张客户数据范围。撤销配对后，服务端立即撤销相关设备令牌并清除待处理外呼派发。
- 初稿画板：[电脑与配对 · 生成配对码弹窗](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-1218)。

### 手机设备

手机设备页复用当前成员的配对设备查询与撤销接口，按在线、离线、已解绑状态统计并可筛选设备名。撤销操作要求二次确认，并同步让服务端设备密钥失效、终止排队派发。重新绑定从“电脑与配对”页开始，不回显设备凭据。

- `GET /callphone/device/list`：返回设备名称、平台、在线状态和最近心跳；`POST /callphone/device/revoke`：请求 `{id}`，当前设备所有者可撤销。
- 第三级页面：系统设置 → 手机设备；页面权限复用 `callphone:device:pair:manage`。
- 本地预览入口：`/callphone-preview/phone-devices?preview=1`。

### 业务字典

本页复用 Yudao 的 `system_dict_type` / `system_dict_data` 与 service，不复制字典基础表。Call Phone 管理接口只列出并接受严格匹配 `callphone_[a-z0-9_]+` 的类型；选项更新必须保持原 Call Phone 字典类型，不能借此修改其他模块的条目或将条目迁出本模块。可创建类型和选项、调整名称/排序/颜色，并启停选项；被客户、线索或通话记录引用的值应停用保留历史。类型与选项底表是 Yudao 全局字典，Call Phone 单独的菜单权限不会授予 `system:dict:*` 通用写权限。

- `GET /callphone/dictionary/type/list`：读取严格符合命名规则的 Call Phone 字典类型。
- `GET /callphone/dictionary/data/page?pageNo&pageSize&dictType`：读取指定 Call Phone 类型的选项。
- `POST /callphone/dictionary/type/create`、`POST /callphone/dictionary/data/create`、`PUT /callphone/dictionary/data/update`：管理 Call Phone 类型和选项；读取权限为 `callphone:dictionary:list`，写入权限为 `callphone:dictionary:manage`。实现复用 Yudao `DictTypeService` / `DictDataService` 并在控制器强制命名空间边界。
- 不开放物理删除接口；被业务记录引用的选项应停用。
- 迁移 `callphone-v51-business-dictionary-boundary.sql` 添加模块专属权限，不建新业务表。
- 本地预览入口：`/callphone-preview/business-dictionaries?preview=1`；演示数据保存在浏览器中，不写入 Yudao 字典表。

### 成员管理与团队/角色

成员管理使用 Yudao 用户、部门、角色模型；团队与角色页面允许在部门和角色两个页签中维护结构、角色状态、Call Phone 菜单访问权及数据范围。模块不复制用户、部门或角色数据表。菜单 SQL 新增 Call Phone 的第三级页面入口及模块专属菜单授权权限；部门与角色本身仍使用 Yudao 的系统管理权限，业务数据访问由已有的数据权限组件和后端规则执行。

- 成员查询/维护复用 `/system/user/page`、`/system/user/create`、`/system/user/update`、`/system/user/update-status` 等接口及 Yudao `UserForm`、角色分配表单。
- 团队查询/维护复用 `/system/dept/list`、`/system/dept/create`、`/system/dept/update`，负责人候选来自 `/system/user/simple-list`。
- 角色查询/维护复用 `/system/role/page`、`/system/role/create`、`/system/role/update`；数据范围复用 `/system/permission/assign-role-data-scope` 和 Yudao `RoleDataPermissionForm`。页面权限读取使用 `GET /callphone/team-role/menu-options?roleId=`，保存使用 `POST /callphone/team-role/menu-permissions`，body 为 `{roleId, menuIds}`；后端只返回当前租户启用的 Call Phone 菜单，拒绝越界菜单 ID，并在更新时保留角色已有的其他模块授权。授权操作使用 `callphone:team:permissions:manage`，部门、角色和数据范围操作仍使用对应 Yudao 权限。
- 本地预览入口：`/callphone-preview/teams-roles?preview=1`。预览数据保存在浏览器本地，预览权限不等同服务端授权。
- 页面字段包括部门名称、上级部门、负责人、排序、状态；角色名称、编码、数据范围、状态；Call Phone 页面权限按菜单资源配置。未从服务端取数的演示数量不显示，避免把样例数据误作真实统计。
- 组织与授权关系沿用 Yudao 的 `system_dept`、`system_role`、`system_menu`、`system_user` 及角色菜单/角色部门授权关联表；v52 仅新增 Call Phone 专属页面授权按钮权限，不新增业务表。

### 数据权限

按角色查看和调整既有 Yudao 数据范围，列出受相同范围约束的客户、线索和通话记录对象。当前设置沿用 Yudao 的角色级范围，而不是字段级授权。Call Phone 模块通过自有 MyBatis 数据权限规则，把 Yudao 的全部/本人/部门/自定义部门范围映射到业务表的 `owner_user_id`；租户边界仍由 Yudao 租户插件提供。客户、线索（未分配公共池除外）、跟进事项和通话记录的列表及单记录读取已接入该规则，通话汇总 SQL 也显式执行相同负责人范围。每新增一个带负责人字段的业务表或自定义 SQL 查询，都必须补充并核验范围规则，不能依赖页面提示。

- `GET /system/role/page?pageNo&pageSize` 和 `GET /system/dept/simple-list` 提供角色及自定义部门数据。
- `POST /system/permission/assign-role-data-scope` 接收 `{roleId, dataScope, dataScopeDeptIds}`；操作权限 `system:permission:assign-role-data-scope`。
- Yudao 数据范围编码：`1` 全部数据，`2` 自定义部门，`3` 本部门，`4` 本部门及下级，`5` 仅本人。
- 本地预览入口：`/callphone-preview/data-permissions?preview=1`；本地演示修改浏览器保存。
- 此页面不新增数据表。角色授权元数据保存在 Yudao 的 `system_role` 与授权关联表；Call Phone 业务表行级过滤由模块接口负责实施。

### 客户字段

维护租户级客户字段定义：标识、名称、类型（文本/数字/日期/单选/多选/布尔）、选项、必填、可见角色、启停、列表展示和排序。标识和类型创建后不可修改，避免已加密的历史 JSON 值按错误类型解码；`select`/`multi_select` 选项可以追加或重排，但已有选项不可删除。要停止使用字段时停用定义，保留配置和历史引用，不做物理删除。客户字段值存于客户行的加密 JSON，不建立明文索引。

- `GET /callphone/customer-field/list`：返回按排序排列的字段定义。
- `POST /callphone/customer-field/save`：新增或修改字段定义；枚举字段 `optionsJson` 必须为非空、无重复的字符串数组。编辑时字段键/类型固定，旧选项必须保留。
- `POST /callphone/customer-field/status`：请求 `{id, enabled}`，启用/停用定义。
- `GET /callphone/customer-field/options`：读取当前用户角色可见的启用字段；客户保存接口验证值类型、枚举选项和必填规则后加密写入 `cp_customer.custom_fields_ciphertext`。
- 页面权限为 `callphone:customer:field:list` 和 `callphone:customer:field:save`；元数据表为 `cp_customer_field`，升级 SQL `callphone-v12-customer-field-config.sql`。
- v13 增加 `visible_role_codes_json` 与客户字段密文列 `custom_fields_ciphertext`；角色范围按 Yudao 角色编码判定。
- 本地预览入口：`/callphone-preview/customer-fields?preview=1`；预览定义存在当前浏览器。

### 阶段与结果配置

这是一个组合页面，分为“客户阶段”和“通话结果与业务选项”两个页签，分别复用 Call Phone 客户阶段配置页和业务字典页。客户阶段写入 `cp_customer_stage`；通话结果使用 Yudao 字典类型 `callphone_call_result`。客户阶段停用会检查是否仍有客户引用，字典项停用保留历史值。

- 客户阶段接口：`GET/POST /callphone/customer-stage/list|options|save`，权限 `callphone:customer:stage:list/save`。
- 通话结果读取和维护：复用业务字典页的 `/callphone/dictionary/*` 适配 API，权限 `callphone:dictionary:list/manage`；字典选项仍存放于 Yudao 全局字典表。
- 本地预览入口：`/callphone-preview/phase-result-config?preview=1`。

### 本地备份与恢复（v34 基础，v42 加固，v43 业务 schema）

备份只导出当前租户的 `cp_*` 业务表（含 `id` 和 `tenant_id` 的表），明确排除全部 `cp_local_backup_*` 元数据、审计与恢复令牌表以及所有 Yudao 系统表。新备份记录当前业务 schema v43；恢复前还会验证租户 ID、完整业务表集合和每张表的列名/顺序。旧版本备份只有物理 schema 与当前完全兼容时才可恢复。备份文件为加密 ZIP，使用 AES-GCM；密钥从部署密钥 `CALLPHONE_PII_ENCRYPTION_KEY` 通过域分离 HMAC 派生。文件保存在服务端 `CALLPHONE_BACKUP_DIR`，默认 `./data/callphone/backups`；本地 compose 将其挂载到持久化卷。若丢失密钥，备份不可解密，因此部署方必须独立保管密钥。

- `GET /callphone/system/local-backup/page?pageNo&pageSize`、`GET /get?id=`：读取当前租户已完成的备份元数据。
- `POST /create`：在本地服务器生成加密备份，返回元数据与 SHA-256 校验值。
- `GET /download?id=`：下载前重新校验文件 SHA-256；响应内容仍为密文。
- `POST /restore-preview`，body `{backupId}`：校验密文、租户、完整表集合和每张表列结构，给出逐表当前行数和恢复行数；生成绑定当前用户与备份摘要的 10 分钟随机令牌，数据库只保存其 HMAC。
- `POST /restore`，body `{backupId, previewToken, confirmText}`：要求 `confirmText` 精确为 `REPLACE CALLPHONE DATA`；与数据替换在同一事务内通过条件更新原子消费令牌，并作废同一备份的其他预览令牌。令牌过期或重复使用会被拒绝。事务只替换当前租户各 `cp_*` 业务表行，不覆盖备份元数据、审计记录、令牌记录或系统表。写回期间逐表校验归档文件恰好出现一次，实际恢复行数必须与已校验 manifest 中的行数一致；任何缺表、重复表或行数不符都会使事务回滚。恢复、预览、下载均追加加密摘要审计。
- 菜单迁移 `callphone-v34-local-backup.sql` 创建基础备份表与页面动作权限 `callphone:backup:list/create/download/restore`；v42 创建 `cp_local_backup_restore_token`，v43 将新备份 schema 默认标记更新为 v43。恢复令牌表也排除在备份之外。
- 本地预览入口：`/callphone-preview/local-backups?preview=1`。预览展示真实功能边界，保持无模拟备份、无创建/下载/恢复操作。

恢复前建议先创建当前数据备份；本地真实数据库的创建/下载/恢复往返和并发令牌竞争验证仍待完成。版本字段作为快照提示，实际兼容性由完整表集合和列结构校验决定；缺表、缺列、多列或列顺序变化会在预览阶段拒绝。恢复实现另外按 manifest 校验归档内表文件集合及每表恢复行数，避免不完整归档静默清空当前表数据。

### 诊断与日志首个本地切片（v27）

- 页面使用 Yudao 已有 `infra_api_access_log` 和 `/infra/api-access-log/page`，固定传入 `requestUrl=/callphone/` 由服务端做模糊过滤；不新增重复日志表或直接依赖模板 DO/Mapper。
- 仅需有 `callphone:diagnostics:view` 页面访问权并由管理员分配既有 `infra:api-access-log:query` 查询权。前端只显示时间、方法、去掉 query string 的接口路径、操作名、耗时、结果码和 trace ID；详情与导出均不包含请求参数、响应正文、IP 或 UA。
- 失败/成功筛选只作用于当前已分页的请求结果，因此页面明确标注“当前页”；慢请求阈值为 1.5 秒。刷新状态只表示日志 API 和底层日志查询当前可用，不等价于所有依赖组件健康。
- 本地预览入口：`/callphone-preview/diagnostics?preview=1`；演示日志带有虚构 query 参数以验证其不会出现在路径和导出中。真实环境的接口日志只有接入管理员查询权限后可用。
- 浏览器检查：主列表和追踪详情抽屉均为浅色；已筛出失败请求，并确认演示请求中的 query string 不出现在列表路径或详情中。CSV 导出字段在代码中限定为脱敏摘要列。

## 数据模型

- 用户、部门、角色与菜单授权使用 Yudao 的 `system_user`、`system_dept`、`system_role`、`system_menu` 及既有关系表，不在 Call Phone 模块复制建模。
- `data_scopes(id, workspace_id, subject_type, subject_id, resource, scope_type, field_policy_json)`。
- `devices(id, workspace_id, device_type, display_name, platform, app_version, status, last_seen_at, revoked_at)`；`device_pairs(id, workspace_id, desktop_device_id, mobile_device_id, paired_by, paired_at, revoked_at)`，明确关联一台桌面与一台手机。
- `desktop_pairing_codes(id, workspace_id, desktop_device_id, code_hash, status, expires_at, claimed_by, claimed_device_id, claimed_at, created_at)`。配对码只存哈希，一次性使用，过期/撤销后不可认领；明文只在创建响应中返回一次。
- `workspace_entitlements(id, workspace_id, plan_key, status, expires_at, limits_json, updated_at)`。
- `dictionary_sets(id, workspace_id, dictionary_key, label, version)`；`dictionary_items(id, set_id, item_key, label, sort_order, enabled, is_system)`。
- `audit_events(id, workspace_id, actor_id, action, resource_type, resource_id, request_id, before_json, after_json, occurred_at)`；审计内容做字段级脱敏。
- `integration_connections(id, workspace_id, provider, status, credential_ref, scopes_json, sync_config_json, last_error_code, updated_at)`。
- 备份元数据：`backup_jobs(id, workspace_id, status, scope_json, artifact_ref, checksum, encrypted, created_by, created_at, finished_at)`。

## API 草案

- `GET/POST /api/v1/admin/users`、`PATCH /api/v1/admin/users/{id}`、`POST /api/v1/admin/invitations`。
- `GET/POST /api/v1/admin/teams`、`GET/POST /api/v1/admin/roles`、`PUT /api/v1/admin/roles/{id}/permissions`、`GET/PUT /api/v1/admin/data-scopes/{subject_type}/{subject_id}`。
- `GET /api/v1/admin/devices`、`POST /api/v1/admin/devices/{id}/revoke`、`GET /api/v1/admin/device-pairs`、`POST /api/v1/admin/device-pairs/{id}/revoke`；桌面配对码创建与手机认领见[移动端 API 契约](mobile-api-contract.md)。
- `GET /api/v1/admin/entitlement`、`GET/POST /api/v1/admin/dictionaries`、`POST /api/v1/admin/dictionaries/{id}/items`、`PATCH /api/v1/admin/dictionary-items/{id}`。
- `GET/POST /api/v1/admin/customer-fields`、`PATCH /api/v1/admin/customer-fields/{id}`、`GET/PUT /api/v1/admin/stage-result-config`。
- `GET/POST /api/v1/admin/backups`、`GET /api/v1/admin/backups/{id}`、`POST /api/v1/admin/backups/{id}/restore-preview`、`POST /api/v1/admin/backups/{id}/restore`。
- `GET /api/v1/admin/diagnostics`、`GET /api/v1/admin/audit-events`、`GET/POST /api/v1/admin/integrations`、`POST /api/v1/admin/integrations/{id}/revoke`。

所有管理写入都必须记录审计事件、使用服务端权限校验并提供并发版本控制；撤销配对/集成后立即使旧访问令牌失效。
