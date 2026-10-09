# 线索

所有本页线索域表由 `yudao-module-callphone` 所有，物理表名带 `cp_` 前缀。线索转客户在本模块的服务事务中完成；Yudao CRM 不属于首期运行依赖。用户、团队/部门等身份数据通过 Yudao system API 引用。

## 页面

线索下的第三级页面：线索池、分配与回收、线索跟进、转化记录、无效/重复归档。

## 功能与字段

- **线索池**：按来源、创建时间、状态、负责人筛选；字段含姓名、电话、渠道、来源码、创建时间、评分、负责人、最近跟进、去重标记。批量领取需服务端原子校验。
- **分配与回收**：支持手动单条和批量分配/改派、一次性轮转、可保存的成员轮转规则，以及租户级新线索自动分配和已分配线索超时回收。新线索在创建事务中按规则游标自动分配并写流转审计；超时回收默认关闭，管理员可设 1–90 天，Yudao 定时任务每 15 分钟扫描。存量线索仍可从页面预览和执行规则。
- 规则编辑页用可拖动成员列表维护轮转顺序，同时提供上移/下移按钮；保存后原子替换成员顺序并按现有契约重置轮转游标。键盘或无法拖动时可直接用按钮调整。
- **线索跟进**：跟进时间线、拨打入口、结果、备注、下次跟进时间、负责人；拨打通过“外呼与通话”模块的配对设备派发。
- **转化记录**：线索、客户、转化时间、转化人、渠道归因、转化备注。
- **无效/重复归档**：原因（无效/重复/拒绝联系/其他）、处理人、时间、原始线索和被合并目标；支持按权限恢复。

### 首个可操作页面：线索池

当前首版实现限定为待领取公共线索和当前 Yudao 角色数据范围内已领取线索。列表字段为姓名、脱敏号码、来源码、评分、负责人、状态、创建时间；新增表单收集姓名、号码、来源码和 0–100 评分，领取使用条件更新确保并发时仅一人成功。CSV 导入在浏览器内预览和校验，最多 500 行/5 MB；支持中英文姓名、电话、来源、评分表头别名，拒绝行内号码重复、无效号码和非法来源/评分。用户可只重试失败行；每一行保留同一个幂等键，避免网络超时后的重试重复创建。浏览器不上传或保存原始文件，但有效线索字段会逐条发送至当前配置的 Call Phone 部署服务并进入待领取池。前端本地预览模式将样例和状态写入当前浏览器；正常业务模式调用下列真实接口。

- `GET /callphone/lead/page?pageNo&pageSize&sourceCode&query`：返回公共待领取线索及 Yudao 角色数据范围内的已领取线索；公共未分配池对有列表权限的用户开放，`query` 只匹配脱敏号码展示字段。
- `POST /callphone/lead/save`：新增到公共池；要求 `Idempotency-Key`，请求含 `name,phone,sourceCode,score`，响应为线索 ID。
- `POST /callphone/lead/claim`：请求 `{id}`，响应 `true/false`；`false` 表示已被其他成员领取或不可见。

首版数据表为 `cp_lead`，保存 `name_ciphertext`、`phone_ciphertext`、`phone_display`、`source_code`、`score`、`owner_user_id`、`status` 和幂等键。姓名及完整号码加密保存；列表 DTO 不返回完整号码。DDL 与升级脚本位于 `yudao-module-callphone/src/main/resources/sql/mysql/callphone-outbound-v1.sql`、`callphone-v5-leads.sql`，菜单/权限定义位于 `callphone-menu-v1.sql`。当前权限键为 `callphone:lead:list/create/claim`。

页面预览入口：`/callphone-preview/leads?preview=1`。该模式只用于浏览器内验收，不代表后端已联调。

对本人已领取的线索，列表行操作“记录跟进”会打开既有第三级页面 `/callphone/lead-follow-ups?leadId={id}` 并预选该线索；预览模式使用 `/callphone-preview/lead-follow-ups?preview=1&leadId={id}`。只有当前负责人本人可见此操作，不新增详情路由或复制线索数据。

CSV 导入复用 `POST /callphone/lead/save`，按行串行提交 `{name,phone,sourceCode,score}` 和独立 `Idempotency-Key`；不增加原始文件表或导入批次表，部分成功逐行展示，重试沿用原幂等键。

### 分配与回收

页面复用 Yudao 启用成员精简列表，支持按负责人、待分配/已分配状态、脱敏号码后四位检索。姓名以 AES-GCM 密文保存，当前查询不支持姓名模糊搜索；不能把无法匹配的姓名搜索伪装成有效筛选。管理员可以将公共线索分配给成员、改派已有线索，或填写原因后回收到公共池。目标成员通过 `AdminUserApi.validateUser` 校验为当前租户的有效用户；更新带原负责人和状态条件，避免并发改派覆盖；每个成功动作都追加 `cp_lead_assignment` 事件。

- `GET /callphone/lead/assignment-page?pageNo&pageSize&status&ownerUserId&query`，需要 `callphone:lead:assign`；`query` 只匹配脱敏号码（即号码后四位），不匹配姓名。
- `GET /callphone/lead/assignment-history?pageNo&pageSize&leadId`，分页返回所选线索的分配、改派、回收、领取、转化与归档事件，包含来源/目标负责人、操作人、原因和时间。权限复用 `callphone:lead:assign`；查询前先通过线索主表的租户和负责人数据范围校验，未授权或不存在时返回空页，不直接暴露审计表。
- `POST /callphone/lead/assign`，请求 `{id,toUserId,reason}`；响应 `true/false`。
- `POST /callphone/lead/assign-batch`，请求 `{leadIds,toUserId,reason}`，最多 100 个不重复 ID；目标成员验证一次，每条线索独立进行状态和原负责人的条件更新，部分冲突不回滚其他成功行。响应逐条返回 `{id,success,outcome}`，`outcome` 为 `assigned/already_assigned/not_found/not_assignable/conflict`；成功改派逐条写入 `cp_lead_assignment`。复用 `callphone:lead:assign` 权限和现有表，无需新增迁移。
- `POST /callphone/lead/assign-round-robin`，请求 `{leadIds,toUserIds,reason}`；线索数最多 100、目标成员数为 2–20，ID 均须唯一且成员必须是当前租户启用用户。服务端按请求顺序轮转目标成员，逐条执行与批量分配相同的状态/负责人条件更新和审计，响应 `{id,toUserId,success,outcome}`。页面在提交前展示逐条分配预览，冲突按行返回；权限复用 `callphone:lead:assign`，事件继续落入 `cp_lead_assignment`，无需新增表或迁移。这是管理员触发的一次性轮转分配，不是后台定时/持续规则；持久轮转仅在保存的团队规则中提供。
- `GET /callphone/lead/assignment-rule/page?pageNo&pageSize&query`：分页读取当前租户规则及有序成员 ID/名称、启停状态、轮转游标、乐观锁版本；复用 `callphone:lead:assign`。
- `POST /callphone/lead/assignment-rule/save`：请求 `{id?,expectedVersion?,ruleName,enabled,memberIds}`；成员须为 2–20 个不重复的当前租户有效成员。创建版本从 1 开始；更新须带当前 `expectedVersion`，成员顺序变化会重置游标；名称在租户内唯一。停用规则仍可编辑，不会删除历史审计。
- `POST /callphone/lead/assignment-rule/preview`：请求 `{ruleId,expectedVersion,leadIds}`，最多 100 条线索；按保存的成员顺序和当前游标返回 `{leadId,toUserId,toUserName}`，不推进游标。客户端预览与执行之间若规则版本变化，执行会被拒绝。
- `POST /callphone/lead/assignment-rule/apply`：请求 `{ruleId,expectedVersion,leadIds,reason}`；仅启用规则可执行。每个请求以版本条件原子推进轮转游标，然后逐条按负责人和状态条件更新线索；即使单条遇到状态冲突也会消耗该次轮转位置，避免后续任务反复偏向同一成员。冲突按行返回 `{leadId,toUserId,success,outcome}`，成功记录在 `cp_lead_assignment.rule_id` 关联规则；规则版本冲突会阻止整批执行。
- `GET /callphone/lead/assignment-rule/auto-config`：返回当前租户 `{ruleId?,version,recycleEnabled,recycleAfterDays}`；无配置时 `ruleId=null, version=0, recycleEnabled=false, recycleAfterDays=7`。
- `POST /callphone/lead/assignment-rule/auto-config`：请求 `{ruleId?,recycleEnabled,recycleAfterDays,expectedVersion}`；传空 `ruleId` 停用新线索自动分配，传规则 ID 则要求规则启用且成员有效；回收时限须为 1–90 天。租户策略存于 `cp_lead_assignment_auto_config`，以版本 CAS 防止并发覆盖。回收策略默认关闭、默认时限 7 天。
- 新线索自动分配只在 `POST /callphone/lead/save` 新建成功时运行；CSV 逐行导入也复用此入口。自动处理使用规则自己的版本 CAS 和持久游标；短暂竞争重试 5 次，若仍冲突或成员已停用则保留公共池状态并写服务日志，不阻断线索创建。关闭或停用规则会让后续新线索留在公共池。该规则不会追溯改派存量线索。
- 超时回收复用 Yudao `infra_job` 注册 `callPhoneLeadTimeoutRecycleJob`，每 15 分钟按租户执行，每批最多扫描 100 条。仅回收状态为 `claimed` 且负责人非空、线索最近更新时间达到租户时限的记录；最近有跟进活动或存在 `queued/accepted` 手机派发时跳过。最终更新同时校验租户、状态、负责人、原更新时间、活动记录和派发状态，使用条件更新处理并发；成功后写 `cp_lead_assignment` 的 `action=recycle` 审计，系统操作者 ID 为 0，页面显示“系统自动回收”。新建跟进和手机通话结果回填会更新时间；v50 迁移还会将旧活动的最近时间回填到线索，避免近期跟进被立即回收。
- `POST /callphone/lead/recycle`，请求 `{id,reason}`；响应 `true/false`，回收后负责人清空、状态回到 `new`。
- 流转事件保存 `lead_id/from_user_id/to_user_id/actor_user_id/rule_id/action/reason`，作为审计历史，不与 Yudao CRM 表关联。手工和一次性轮转的 `rule_id` 为空；保存规则触发的事件关联规则 ID，并在原因前记录规则名称。
- 分配页在行内打开流转时间线；详情保留在当前第三级页面侧栏，不新增菜单项。公共池以空负责人 ID 表示；停用成员的历史仍显示“成员已停用”。

页面预览入口：`/callphone-preview/lead-assignments?preview=1`。预览分配提供演示成员选项，改动与线索池共用同一份浏览器数据。

规则存储：`cp_lead_assignment_rule` 保存租户内规则名、启停状态、游标和乐观锁版本；`cp_lead_assignment_rule_member` 保存有序成员；`cp_lead_assignment_auto_config` 保存新建线索自动规则指针、超时回收开关、时限和乐观锁版本。成员顺序更新在同一事务内替换；流转审计通过 `cp_lead_assignment.rule_id` 可追溯到规则。规则表升级脚本为 `callphone-v46-lead-assignment-rules.sql`，租户自动配置表见 v49，回收配置列、扫描索引和定时任务见 `callphone-v50-lead-timeout-recycle.sql`；复用 `callphone:lead:assign/recycle`，不新增菜单或权限。

### 线索跟进

线索跟进页仅列出当前成员已领取的线索。可逐条记录电话、消息、会议或其他触达方式，标注沟通结果、加密说明和可选的下次跟进时间。当前版本不伪造通话录音；真实拨号/通话结果由外呼模块完成后，后续通过 `call_record_id` 关联。

- `GET /callphone/lead/activity/page?pageNo&pageSize&leadId`：按当前成员和线索分页查询跟进记录，需要 `callphone:lead:follow`。
- `POST /callphone/lead/activity/save`：请求 `{leadId,activityType,outcomeCode?,note,nextFollowUpAt?}`，仅线索负责人可写；跟进说明加密入库。
- `cp_lead_activity` 保存负责人、操作成员、类型、结果、密文说明、下次跟进时间和可选通话记录 ID。升级 SQL 为 `callphone-v10-lead-activities.sql`。
- 线索外呼复用 `POST /callphone/call-dispatch/create`，传 `leadId,deviceId,source=lead_followup,nextFollowUpAt?,requestNote?` 和 `Idempotency-Key`；服务端校验当前用户仍是有效负责人，号码在手机接受派发后才下发。
- 手机完成该派发后，通话结果事务性地创建一条电话跟进，包含 `leadId,callRecordId,outcomeCode,note,nextFollowUpAt`；`note` 使用现有 PII 加密，`UNIQUE(tenant_id,call_record_id)` 防止同一通电话重复生成活动。跟进列表会显示关联通话，并可跳转至通话记录详情。通话记录和派发同时关联 `lead_id`，客户 ID 允许为空。升级 SQL 为 `callphone-v38-lead-outbound.sql`。
- 本地预览入口：`/callphone-preview/lead-follow-ups?preview=1`。先在线索池领取一条演示线索后，可以手动记录跟进或模拟“发送到手机 → 接受/拒绝/过期 → 回填结果”，演示活动保存在浏览器，不会创建真实呼叫。

### 线索转化记录

线索池中本人已领取的线索可通过行操作“转为客户”。服务端在单个事务内复制加密姓名/电话快照、脱敏展示号和渠道来源到 `cp_customer`，将客户阶段设为 `new`，写入 `cp_lead_conversion` 转化快照，再把原线索状态改为 `converted` 并记入流转审计。通过 `Idempotency-Key` 和租户内线索唯一键防止重复建档。转换只允许线索当前负责人操作。

- `POST /callphone/lead/convert`：请求头 `Idempotency-Key`，请求 `{id,note?}`，返回客户 ID；冲突状态返回业务错误。
- `GET /callphone/lead/conversion-page?pageNo&pageSize&query`：按脱敏号码查询当前成员自己的转化快照，返回原线索名、客户名、号码掩码、来源快照、转化人、时间和说明。需要 `callphone:lead:convert`。
- 新增字段：`cp_lead_conversion` 保存 `lead_id/customer_id`、加密姓名快照、`phone_display/source_code`、转化人/时间、加密说明和幂等键。唯一索引约束同一租户线索只转化一次。
- 菜单为线索下第三级页面“转化记录”；转化详情与前往客户列表动作留在本页，不额外建菜单。
- 本地预览入口：`/callphone-preview/lead-conversions?preview=1`。浏览器预览支持“线索池领取 → 转为客户 → 客户列表/转化记录”连续操作；演示存储不代表后端联调。

转化、归档与恢复的写事务由 Call Phone `LeadLifecycleService` 承担；Controller 只负责权限、参数校验和响应映射。转化在同一事务内建立客户快照、转化记录、线索状态和流转审计；归档保存加密原因及原状态，条件更新失败时整笔回滚；恢复只允许归档操作者执行且只对仍为 archived 的线索成功。模块目标测试覆盖转化快照/幂等重放、归档原因加密和恢复状态冲突。

### 无效 / 重复归档

页面分“待处理线索”和“归档记录”两个标签。归档时必须说明原因；重复项还必须选有效目标线索。服务端记录姓名密文/号码掩码、原负责人和原状态，再以条件更新将线索标记为 `archived`，并写入分配审计。恢复会回到归档前的公共池或负责人状态，且要求填写恢复原因。

- `GET /callphone/lead/archive-page?pageNo&pageSize&archiveType`：返回当前成员创建的归档记录和恢复状态，需要 `callphone:lead:archive`。
- `POST /callphone/lead/archive`：请求头 `Idempotency-Key`，请求 `{leadId,archiveType,reason,targetLeadId?}`，归档类型为 `invalid/duplicate/rejected/other`。
- `POST /callphone/lead/restore`：请求 `{id,reason}`，需要 `callphone:lead:restore`；只能恢复当前成员归档且仍处于归档状态的线索。
- `cp_lead_archive_event` 以追加事件保留加密原因和原负责人/状态。升级 SQL 为 `callphone-v11-lead-archive.sql`。
- 本地预览入口：`/callphone-preview/lead-archives?preview=1`，可归档当前可见线索并恢复演示记录。

## 隐私与日志

客户、线索、跟进说明和归档原因均在 Call Phone 业务表加密保存；涉及明文字段的写请求不进入芋道 API 访问日志。在 `local` 配置中同时关闭芋道开发拦截器对请求体的控制台日志，避免它在加密前打印姓名、电话和说明。

## 数据模型

- `leads(id, workspace_id, customer_id nullable, name, phone_ciphertext, phone_search_hash, source_channel_id, source_code_id, status, score, owner_user_id, team_id, duplicate_of_id nullable, invalid_reason_code nullable, created_at, updated_at, archived_at)`。
- `lead_assignments(id, workspace_id, lead_id, from_user_id nullable, to_user_id nullable, rule_id nullable, action, reason, actor_id, occurred_at)`；`action`：`assign/reassign/claim/recycle/restore`。
- `lead_activities(id, workspace_id, lead_id, actor_id, activity_type, outcome_code, note, next_follow_up_at, call_record_id nullable, created_at)`。
- `lead_conversions(id, workspace_id, lead_id, customer_id, converted_by, converted_at, attribution_snapshot_json, note)`。
- `lead_archive_events(id, workspace_id, lead_id, archive_type, reason_code, target_lead_id nullable, actor_id, created_at, restored_at nullable)`。

## API 草案

- `GET /api/v1/leads`、`GET /api/v1/leads/{id}`、`POST /api/v1/leads/{id}/claim`。
- `POST /api/v1/leads/assignments`（批量 `lead_ids,to_user_id,reason`），`POST /api/v1/leads/{id}/recycle`。
- `GET/POST /api/v1/leads/{id}/activities`，`POST /api/v1/leads/{id}/convert`（幂等；可传新客户字段或已存在 `customer_id`）。
- `POST /api/v1/leads/{id}/archive`、`POST /api/v1/leads/{id}/restore`，`GET /api/v1/lead-conversions`，`GET /api/v1/leads/archives`。
- 分配规则：`GET/POST /api/v1/lead-assignment-rules`，`POST /api/v1/lead-assignment-rules/{id}/preview`；租户级自动分配和超时回收配置存于 `cp_lead_assignment_auto_config`（v49 建表、v50 增加策略列），继续复用 `callphone:lead:assign`。手机完成派发期间不会触发超时回收。

手机号不用于模糊全文索引；重复检测使用标准化号码的受控哈希和权限校验。所有批量操作返回逐条成功/失败结果，避免部分失败被误报为全部成功。
