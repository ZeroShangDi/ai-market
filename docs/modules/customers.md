# 客户

所有本页客户域表由 `yudao-module-callphone` 所有，物理表名带 `cp_` 前缀；用户/角色/租户等只引用 Yudao system 身份，不复制身份主表，也不直接依赖 `yudao-module-crm` 的 DO、Service 或 Mapper。这里的模型为 Call Phone 产品自己的客户工作区，不要求启用模板 CRM。

## 页面

客户下的第三级页面：客户列表、跟进事项、客户阶段、通话记录、企微客户、客户群、客户运营、会话存档、服务质检、风险预警。通话记录与电话派发的完整规格见 [外呼与通话](outbound-calling.md)。

## 功能与字段

- **客户列表**：姓名、脱敏号码、阶段、标签、负责人、来源渠道、最近联系时间、待办状态；支持新建、导入、筛选、批量分配/标签、详情。
- **跟进事项**：待处理/逾期/已完成、客户、内容、负责人、截止时间、关联通话；支持完成、改期、转派。
- 从通话记录详情创建跟进事项会自动带入客户和来源通话；表单显示关联提示，保存后 `source_call_record_id` 用于回溯。
- **客户阶段**：阶段名称、颜色、顺序、客户数；阶段变更记录包含客户、原/目标阶段、操作者来源和时间，只能查看本人有权处理的客户记录。
- **企微客户/客户群/客户运营**：外部客户/群 ID、企微主体、跟进成员、标签、加入时间、最后互动、同步状态、运营活动；需明确企业微信授权范围。
- **会话存档**：授权成员、会话参与者、消息时间、类型、关键词；只索引依法取得的企业微信存档内容。
- **服务质检**：质检规则、抽样范围、命中项、评分、审阅人、复核状态。
- **风险预警**：风险规则、对象、等级、命中时间、处置状态、责任人、处理备注。

### 风险预警首个本地切片（v25）

- 内置规则：未完成且超过阈值的跟进事项、客户资料超过阈值未新增或修改。阈值和等级按当前租户维护；用户手动发起扫描，首期不后台定时扫描，也不自动联系客户或改变客户状态。
- `cp_risk_rule` 保存规则开关/阈值/等级；`cp_risk_alert` 保存预警对象与处置状态。命中详情和处置说明 AES-GCM 加密。按当前登录人筛选其本人客户/跟进事项，租户插件提供租户边界；唯一键阻止相同规则对相同来源产生重复待处理预警。
- 风险列表优先显示待处理预警，同一状态内按发现时间倒序排列；待处理与已处理记录都保留在分页结果中。
- API：`GET /callphone/risk-alert/page`、`GET /get?id=`、`GET /rule-list`、`POST /rule-save`、`POST /scan`、`POST /resolve`。处置需带 `expectedVersion` 和说明；终态通过 CAS 防止重复覆盖。
- 权限：`callphone:risk:alert:list/scan/resolve`、`callphone:risk:rule:manage`。v25 新增数据库及第三级菜单；规则可配置，但首期只提供两种内置条件。
- 本地预览入口：`/callphone-preview/risk-alerts?preview=1`；演示数据保存在当前浏览器。
- 页面检查：主页面、规则抽屉、详情抽屉、处置弹窗均已在浏览器实际打开检查，使用浅色主题；已收窄表格列宽，保证常见桌面视口下发现时间和操作列可见。前端整站构建通过。

### 服务质检首个本地切片（v26）

- 首期按本人已结束通话提供服务流程抽检队列，检查客户身份确认、沟通礼貌、需求/未接通原因记录、通话结果准确性和后续安排清晰度，五项各 20 分；低于 80 分必须填写改进意见。
- `cp_service_review` 按租户和通话唯一保存评分、检查项、状态、质检人、时间及乐观锁版本。质检说明使用 AES-GCM 加密；页面与 API 都校验通话归属和已结束状态。`GET /callphone/service-review/available-calls`、`GET /page`、`POST /save`。
- v26 迁移新增 `callphone:service:review:list/save` 权限和客户下第三级菜单。v48 新增 `callphone:service:review:recording` 独立权限、`GET /callphone/service-review/recording?id=` 和 `cp_call_recording_access_audit`；只允许播放当前操作人名下、已结束且有可用录音的通话。播放成功后记录通话 ID、操作者、用途和时间，不把录音字节或客户信息写入审计表。
- 录音采用外呼模块 v47 的客户部署本地 AES-GCM 私有卷；页面列表与只读/编辑抽屉均显示录音状态和播放器。角色需单独分配录音播放权限。预览数据没有真实录音文件，不伪造播放。
- 本地预览入口：`/callphone-preview/service-review?preview=1`。演示数据只保存在当前浏览器。
- 前端检查：主页面和质检抽屉已在浏览器目视检查为浅色；实际保存过 100 分通过和 60 分需改进两条记录，确认待检数量和质检历史联动。低于 80 分的说明为必填。

## 当前落地的数据模型（客户列表切片）

客户列表、跟进事项和阶段配置首批切片使用模块自有表 `cp_customer`、`cp_follow_up_task`、`cp_customer_stage`：

| 字段 | 含义 | 保护方式 |
|---|---|---|
| `id` / `tenant_id` | 主键与租户 | 雪花 ID / Yudao 租户隔离 |
| `name_ciphertext` | 姓名 | AES-256-GCM 加密 |
| `phone_ciphertext` | 完整号码 | AES-256-GCM 加密 |
| `phone_display` | 脱敏号码 | 列表可展示；号码后缀筛选 |
| `stage` / `tags` / `source` | 阶段、逗号分隔标签、来源 | 普通业务字段 |
| `owner_user_id` / `status` | 负责人、active/archived | 客户数据读/改/归档由 Yudao 角色数据范围约束；新建与导入默认归当前操作人 |
| `import_key` | CSV 行幂等标识 | 仅用于同一账号安全重试；不含姓名或手机号 |

`callphone-outbound-v1.sql` 用于新库初始化；`callphone-v2-customer-fields.sql` 实际用于增加阶段、来源和标签列。客户详情以客户列表页侧栏呈现，编辑在同页弹窗完成，不新增菜单页。完整手机号不会通过客户列表接口返回。

API：

- `GET /admin-api/callphone/customer/page?pageNo&pageSize&query&stage`：分页返回当前 Yudao 角色数据范围内的客户，`query` 匹配脱敏号码后缀。
- `POST /admin-api/callphone/customer/save`：新建/修改；姓名及新增号码加密后存储，修改时号码留空代表不变。
- `POST /admin-api/callphone/customer/import`：最多 500 行逐行导入；每行传 `rowNo,name,phone,stage?,source?,tags?,customFields?,idempotencyKey`，返回逐行 `imported/duplicate/failed` 和汇总计数。CSV 文件由浏览器本地解析，原文件不上传；服务端逐行新事务写入，加密姓名、号码和扩展字段，并写阶段审计。相同 idempotencyKey 重试会返回已存在客户，不会重复新建。
- `POST /admin-api/callphone/customer/archive?id`：对当前角色数据范围内且拥有归档动作权限的客户软归档。
- `GET /admin-api/callphone/customer/get?id`：读取当前角色数据范围内的客户详情，供所属页面内编辑或创建跟进时使用。
- `POST /admin-api/callphone/customer/assign-batch`：一次调整 1–100 位活动客户负责人；所有记录必须存在且落在当前租户及角色数据范围内，否则整批回滚。使用 Yudao 的成员校验，不在 Call Phone 复制用户主表；每条变更写 `cp_customer_owner_change`。
- `POST /admin-api/callphone/customer/tags-batch`：一次追加、覆盖或清空 1–100 位活动客户标签。追加会保留原标签并去重；标签总字段上限 512 个字符，单个标签最多 32 字符。超范围客户、状态变化或非法标签会拒绝整批。
- `GET /admin-api/callphone/customer/simple-list?query`：外呼候选（姓名匹配及号码后缀匹配，候选上限 100 条、返回上限 20 条）。
- `GET /admin-api/callphone/follow-up-task/page?pageNo&pageSize&status`：按 Yudao 角色数据范围分页，并返回同一范围内待办/逾期/已完成/已取消计数。
- `POST /admin-api/callphone/follow-up-task/save`：仅关联当前角色数据范围内的客户/通话后创建或修改待办；标题和内容均 AES-256-GCM 加密。新建待办归当前操作人；修改仅限当前可见且待处理的记录，并受 `callphone:followup:save` 权限控制。
- `POST /admin-api/callphone/follow-up-task/complete?id`：幂等完成并记录完成时间。
- `GET /admin-api/callphone/customer-stage/list`：阶段设置页读取启用/停用状态和各阶段客户数；首次读取时幂等初始化四个默认阶段，并发初始化时以租户/阶段唯一键协调。
- `GET /admin-api/callphone/customer-stage/options`：客户列表读取实际启用阶段；不会在接口异常或阶段全停用时伪造可选项。
- `POST /admin-api/callphone/customer-stage/save`：新增/修改名称、颜色、顺序或启停；阶段编码创建后不可改，有客户使用的阶段不能停用，并发锁定启用阶段集合以保证至少保留一个启用阶段；重复编码、仍被使用和最后一个启用阶段分别返回明确错误。
- `GET /admin-api/callphone/customer/stage-history`：按当前操作者分页读取本人客户创建和阶段编辑记录；可按目标阶段筛选，不返回其他负责人的客户姓名。
- `GET /admin-api/callphone/customer-field/options`：返回当前用户可见的启用字段定义和枚举选项。
- 客户 `GET page/get` 响应只含当前角色可见的自定义字段；`POST save` 接受 `customFields`，服务端验证字段类型、选项、必填及角色范围后加密保存。

权限码：客户列表 `callphone:customer:list/save/archive/import/assign/tags`，跟进事项 `callphone:followup:list/save/complete/cancel`，客户阶段 `callphone:customer:stage:list/save`；外呼候选检索单独使用 `callphone:customer:query`。PC 页面按各自权限码隐藏新增/编辑、导入、归档、外呼、安排跟进、阶段配置和批量操作入口；服务端仍独立校验权限。批量更新单次最多 100 条，在事务内锁定当前可见的活动客户并全成全败；负责人变更审计只保存客户 ID、操作者和前后负责人，不写姓名、号码或标签正文。v55 新增审计表、批量操作权限和备份 schema 55；v49–v54 备份可在恢复时缺少新审计表，其余表仍须完整匹配。客户读取/修改由 Yudao 租户插件和角色数据范围共同限制；新建与导入归当前操作人。角色需在菜单管理中分配页面和按钮权限。

## 后续数据模型

- `cp_customer` 将逐步扩展至 `customers(id, workspace_id, name, phone_ciphertext, phone_search_hash, stage_id, owner_user_id, source_channel_id, profile_json, created_at, updated_at, archived_at)` 对应能力；完成迁移前不把目标模型误作已上线结构。
- 字段定义使用 `cp_customer_field`（见 `callphone-v12-customer-field-config.sql`），按租户约束字段键、类型、必填、选项、可见角色、列表展示、启停和顺序。字段键/类型创建后不可修改；单选/多选值可追加或重排但不能删除旧选项，避免已有密文值失去可解释定义。v13 增加 `cp_customer.custom_fields_ciphertext`，动态字段值作为整体 JSON 使用 AES-256-GCM 加密；不对自定义字段值建立明文索引。客户列表只解密并返回被角色允许且配置为列表展示的字段，详情与编辑只返回当前用户有权读取的字段。
- `customer_tags(id, workspace_id, name, color)` 与 `customer_tag_links(customer_id, tag_id, added_by, created_at)`。
- `cp_follow_up_task` 落地跟进事项；标题与内容使用密文列，字段包括客户、负责人、截止时间、状态、来源通话与完成时间。
- `cp_customer_stage(tenant_id, stage_code, name, color, sort, enabled, system_default)` 为租户内阶段配置；`stage_code` 与客户表 `stage` 关联，不依赖 CRM 字典。
- `cp_customer_stage_event(tenant_id, customer_id, from_stage, to_stage, changed_by, changed_at, source)` 在 v37 新增，仅记录阶段变更元数据；查询按当前操作者和租户过滤，姓名通过当前本人客户记录读取。
- `customer_stage_history(id, workspace_id, customer_id, from_stage_id, to_stage_id, changed_by, reason, changed_at)`。
- 企业微信领域：`wecom_contacts`, `wecom_groups`, `wecom_sync_events`；会话存档与质检数据应基于授权的存档源、保留策略和审计记录。
- `service_reviews(id, workspace_id, source_type, source_id, rule_id, score, findings_json, reviewer_id, review_status, created_at)`；`risk_alerts(id, workspace_id, rule_id, subject_type, subject_id, severity, status, owner_user_id, payload_json, created_at, resolved_at)`。

## API 草案

- `GET/POST /api/v1/customers`，`GET/PATCH /api/v1/customers/{id}`，`POST /api/v1/customers/import`，`POST /api/v1/customers/bulk-actions`。
- `GET/POST /api/v1/follow-up-tasks`，`PATCH /api/v1/follow-up-tasks/{id}`，`POST /api/v1/follow-up-tasks/{id}/complete`。
- `GET /api/v1/customer-stages`，`PATCH /api/v1/customer-stages/{id}`，`POST /api/v1/customers/{id}/stage-transitions`。
- `GET /api/v1/wecom/contacts`、`GET /api/v1/wecom/groups`、`GET /api/v1/wecom/sync-status`。
- `GET /api/v1/conversation-archives`、`GET /api/v1/service-reviews`、`POST /api/v1/service-reviews/{id}/review`、`GET /api/v1/risk-alerts`、`POST /api/v1/risk-alerts/{id}/resolve`。

导入、企微同步、会话检索均需任务状态、错误行/失败游标和审计信息。服务端必须执行字段级读写权限，不能只在 UI 隐藏敏感字段。

## 企业微信页面实现契约

企微数据只由客户部署的 `yudao-module-callphone` 通过其已配置的企业微信凭据直连 `qyapi.weixin.qq.com`；数据落在本租户的 `cp_wecom_*` 表，不上传 Call Phone 产品核心服务。同步范围始终由管理员指定员工或群状态，不默认拉取全企业。手机号、客户名、备注、外部联系人 ID、消息正文和会话参与人 ID 都按敏感字段处理；可查询的 ID 索引存不可逆摘要，业务字段密文使用 AES-GCM。访问页面不等同于允许读取 PII，列表/详情响应要经服务端单独字段权限裁剪。第三方接口错误只映射为稳定错误码，不存原始请求/响应正文或 access_token。

### 企微客户

- 字段：脱敏姓名、外部联系人类型、跟进员工、添加时间、最近同步时间、标签与同步状态；企微基础通讯录接口不提供最近互动时间，接入会话存档授权后再补。详情侧栏显示备注、描述和标签，仅在用户显式请求且拥有 `callphone:wecom:contact:pii` 权限时返回敏感内容。关闭权限时服务端只返回带短摘要的匿名姓名。
- API：`POST /callphone/wecom/contact/page`（筛选字段走请求体，避免客户姓名出现在 URL/请求行日志）；`GET /callphone/wecom/contact/get?id&includePii`；`GET /callphone/wecom/contact/pii-permission`；`GET /callphone/wecom/follow-user/options`；`POST /callphone/wecom/contact/sync`（员工范围+幂等键，返回 job ID）；`GET /callphone/wecom/sync-job/get?id`。
- `cp_wecom_contact` 保存 `external_user_id_hash`（唯一索引）、`name_search_hash`、`external_user_id_ciphertext`、`name_ciphertext`、`profile_ciphertext`、`external_type`、`first_added_at`、`last_interaction_at`（当前保留为空）、`last_synced_at`、`version`；`cp_wecom_contact_owner` 保存加盐域分离摘要和密文员工 ID、密文员工姓名、跟进资料。`cp_wecom_sync_job` 记录范围、幂等键、queued/running/completed/partial/failed、计数和稳定错误码，不存 access_token 或上游错误正文。
- 已实现本地加密投影、成员范围异步同步、精确姓名 HMAC 查询、服务端 PII 字段裁剪及本地空态页面。仍需真实企微授权、数据库迁移与部署联调；限制单次员工同步最多 5000 个联系人，超限任务失败并提示检查范围。
- 同步按员工执行，异步逐条读取并持续写入进度；单任务最多 5000 个联系人，同一租户同一员工最多一个活动 job。权限：`callphone:wecom:contact:list/sync`、`callphone:wecom:contact:pii`。断开企业微信连接后停止新同步；已同步的租户本地副本可由管理员按保留策略清除。

### 客户群

- 字段：群名、同步成员、状态、成员数、建群时间、最近同步、同步异常；成员详情走抽屉。企微通讯录接口不提供最近发言时间，首期不显示互动热度。
- API：`POST /callphone/wecom/group/page`（群名筛选走请求体）；`GET /callphone/wecom/group/get?id&includePii`；`GET /callphone/wecom/group/follow-user/options`；`GET /callphone/wecom/group/pii-permission`、`GET /callphone/wecom/group/sync-permission`；`POST /callphone/wecom/group/sync`；`GET /callphone/wecom/group/sync-job/get?id`。
- v31 `cp_wecom_group` 保存 tenant 域 chat ID HMAC、chat ID 密文、加密群资料、员工标识摘要/密文、状态/成员数/时间；`cp_wecom_group_member` 保存 tenant 域成员标识摘要/密文、密文姓名及原始成员资料、成员类型、入群时间/场景、群主标识和当前群成员状态。共享同步任务表通过 `resource_type` 区分联系人与客户群任务。群 ID 和成员 ID 不用于跨租户关联。
- 已接企业微信只读列表和详情 API、按员工授权范围同步、同步进度与稳定失败码、解散群快照标记；PII 只有显式请求且 `callphone:wecom:contact:pii` 权限通过才返回。同步最多 5000 个群，单群最多 5000 名成员。
- 权限：`callphone:wecom:group:list/sync`。首期只读同步，不从该页添加/移除群成员或发送群消息；需要真实企业微信授权与数据库迁移后才可联调。

### 客户运营

- 首期只实现运营活动草稿与本地人群预估，不自动发送消息、不触达客户。字段：活动名、内容草稿、目标员工/标签/时间范围、预计触达数（只根据本地已同步快照估算并标记时间）、负责人、草稿/待审核/已通过/已驳回/已撤回状态。
- 页面：`/callphone-preview/wecom-campaigns?preview=1` 可查看本地预览。编辑抽屉提供活动名称、目标跟进成员、精确标签筛选与运营内容；保存、估算、提交审批、撤回均有独立状态与版本校验。预览模式不伪造活动数据，且明确禁用会写入或改变状态的操作。
- API：`POST /callphone/wecom/campaign/page`；`GET /callphone/wecom/campaign/get?id=`；`GET /callphone/wecom/campaign/audience-options`；`POST /callphone/wecom/campaign/save`；`POST /callphone/wecom/campaign/estimate`；`POST /callphone/wecom/campaign/submit`；`POST /callphone/wecom/campaign/withdraw`。
- 内部审批闭环：`POST /callphone/wecom/campaign/approve` 将待审活动原子更新为 `approved`；`POST /reject` 要求填写驳回原因并更新为 `rejected`。审批接口使用 `expectedVersion` 做状态 CAS，审批/驳回与撤回竞争时只允许一个状态转换成功。驳回原因加密写入既有 `cp_wecom_campaign_audit.note_ciphertext`，草稿发起人可编辑驳回活动并重新估算、提交。`GET /audit-list?id=` 返回按时间排序的状态事件、操作人和解密后的审核意见；仅在租户内、拥有列表权限时可读。`approved` 只代表内部审核通过，不会触达企微。
- v32 `cp_wecom_campaign` 保存加密活动名、内容及筛选条件、预估快照时间、发起人、版本与状态；`cp_wecom_campaign_audit` 保存提交/撤回审计元数据。人群估算只读取本地已同步快照，不向企微发送数据；估算 30 分钟过期，修改后清除旧估算。草稿/审核状态绝不呈现为“已触达”。只有后续完成企业资质/授权范围与消息模板审核后，才增加单独的真实发送命令和逐项回执。
- 权限：`callphone:wecom:campaign:list/save/estimate/submit/withdraw/review`；审核权限单独控制通过与驳回；不新增任何发送权限。v56 只新增审核权限菜单项，未改变业务表结构；本地初始化脚本已包含该版本。
- 页面检查：主页面空态、活动编辑抽屉已在浏览器实开目视检查；内容区、表单、输入框与弹窗均采用浅色主题，预览模式的保存/估算/提交按钮禁用，符合“不伪造数据、不落库”的约定。真实同步成员选择、审批状态变更和数据库读写需服务与企微授权恢复后联调。

### 会话存档

- 需企业已购买并开通会话内容存档，且完成成员授权和法定告知。没有授权时页面显示“服务未启用”，不模拟消息样例。
- 页面：`/callphone-preview/wecom-archive?preview=1`。按时间、会话类型和消息类型查询；列表不返回消息正文，正文操作要求内容权限、填写用途并写入访问审计。保留策略支持按租户配置 30–3650 天并用版本 CAS 更新。
- API：`POST /callphone/wecom/archive/page`；`GET /callphone/wecom/archive/sync-status`；`POST /callphone/wecom/archive/content`（消息 ID + 业务用途）；`GET /callphone/wecom/archive/retention`；`POST /callphone/wecom/archive/retention/save`；`POST /callphone/wecom/archive/retention/cleanup`（单批最多删除 500 条并返回剩余量）。
- v33 `cp_wecom_archive_message` 使用 `message_id_hash` 幂等去重，消息正文、会话 ID、成员标识和客户标识密文保存；列表索引仅包含租户、时间、会话/消息类型及摘要。`cp_wecom_archive_sync_cursor` 保存加密游标和同步状态；`cp_wecom_archive_access_audit` 加密保存查看和清理用途。v54 增加 `actor_type` 和租户过期查询索引；用户操作和系统自动清理可区分。查询过滤已过期消息，正文读取再次检查权限、过期时间并审计；手动与每 15 分钟任务均按租户锁定一批、最多 500 条后物理删除密文行，避免逻辑删除让密文长期残留。
- 页面、过滤条件、加密表、元数据分页、受控正文读取/审计、保留策略 CAS 和物理清理已落地。官方存档 SDK、成员同意流程与数据采集 worker 未接入前，状态接口明确返回未启用且不产生消息样例；不宣称真实同步已完成。权限：`callphone:wecom:archive:list/view-content/manage-retention`。旧 schema v50–v53 备份可在恢复时为审计表补齐默认 `actor_type=user`。
