# 外呼与通话

## 实现进度（2026-10-06）

- 已实现并通过 Maven 编译：通话记录分页/详情读取、按负责人数据范围查询、PC 外呼派发创建/幂等复用/状态查看/撤回、5 分钟过期处理；电脑一次性配对码、移动端认领、设备密钥哈希/心跳、派发拉取/接受/拒绝、拨号开始与结果回填 API。v44 对完成事件保存设备密钥 HMAC 指纹，重放同 ID 但不同 payload 返回幂等冲突。撤回、过期、手机接受/拒绝、解绑时失败的条件状态更新及审计落在 Call Phone `CallDispatchWorkflowService` 事务中；外呼流程目标测试 6 项通过。PC 前端有通话记录详情、发起外呼状态面板、电脑配对和客户列表页面；uni-app 的“我的 → 本机与配对”可领取 PC 六位码，客户页前台每 15 秒拉取派发并刷新心跳。
- 配对码过期轮询使用条件更新；若手机认领并发胜出，电脑端回读当前数据库状态并显示 `claimed`，不再把已配对设备误显示成 `expired`。`DevicePairingControllerTest` 并发回读用例 1/1 通过。
- 数据库初始化 DDL、逐版升级脚本（业务 schema 源码推进至 v44；v45 是仅新增权限的菜单 SQL）、Call Phone 菜单/页面权限 SQL 已写入模块目录；本地 MySQL 最近一次确认已应用至 v43，最近一次只读核对为 49 张 `cp_*` 表、41 个第三级页面菜单和 80 项 Call Phone 权限，迁移前保留了数据库快照。v42 新增备份恢复令牌表，v43 新增 HTTPS 活码落地页和匿名扫码日汇总表；v44 增加手机完成事件的设备密钥 HMAC 请求指纹，拒绝同一幂等事件 ID 携带不同结果/时间/备注的重放，事件表不保存明文备注；v45 增加通话记录 Excel 导出的独立权限。v44/v45 待运行环境恢复后应用；恢复令牌/备份元数据不属于业务备份范围。真实业务写入往返、角色授权差异和手机 HTTP/真机闭环仍待逐项验收。
- 录音闭环已补入代码：手机只为自己的已结束通话上传最多 25 MiB 的 WAV/AMR/MP4(M4A)/AAC/MP3；服务端校验设备、负责人、通话状态及文件头，以独立派生密钥 AES-GCM 加密后写客户侧私有卷，MySQL 只存元数据与 SHA-256。Spring multipart 文件上限已同步到 25 MiB；唯一键并发冲突会做锁定读，重复上传 ID 与同一内容幂等成功，不同内容/通话返回冲突，失败时清理孤立密文对象。通话详情播放要求通话查询权限和负责人数据范围；质检页使用独立播放权限且只允许本人已结束通话。每次成功读取都会写入 `cp_call_recording_access_audit`，不记录音频字节或客户 PII。v47 新增 `cp_call_recording_asset`；v48 新增录音访问审计表与服务质检播放权限。Compose 挂载录音数据卷；本地备份将加密录音对象一并写入客户端加密归档，恢复先暂存并校验对象后随事务提交落盘。Call Phone 后端测试 65/65 通过；当前运行环境尚未应用 v47/v48 或重建 API 镜像。uni-app 录音上传失败可在应用进程内重试，退出应用后队列仍不能恢复；原生插件路径是否能在 Android 真机上直接上传、iOS 插件是否提供录音文件，仍需设备联调。预览样例不是真实录音，不提供播放。
- **移动端契约适配已接入，真实联调待完成**：uni-app 保留 `/api/v1/mobile/*`，Call Phone 模块内适配器映射到外呼服务。完成结果按 URL 路径读取 call ID；对外雪花 ID 使用字符串；配对、设备心跳、本人客户读取、派发接受/拒绝、拨号开始和结果回填已有实现。拨号请求必须按 `source` 提供 `dispatch_id` 或 `customer_id`；字段缺失不再返回成功空值，而是返回 Call Phone 请求错误。仍需使用登录账号、在线数据库及 Android/iOS 原生插件完成端到端验证。

> 优先设计模块。对应菜单：客户 → 电话沟通 → 通话记录。该叶子菜单保持唯一页面；通过客户表格的拨打操作、通话记录详情侧栏和手机端配对完成外呼工作流，不新增菜单层级。

## Figma 初稿与交互态

- [通话记录主页面](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=62-24)：唯一的菜单页面。
- [发起外呼抽屉（发送前）](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-602)、[派发状态抽屉](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-802)、[通话详情抽屉](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-1011) 是该页面的交互状态，不是新的菜单路由。
- [电脑与配对页面的配对码弹窗](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-1218) 对应系统设置下既有「电脑与配对」菜单。
- 上述画板均为 Figma 可编辑图层；展示数据均为虚构示例。

## 功能边界

1. PC 用户从客户列表或线索跟进中选择一个客户，将客户卡片推送到已配对手机；手机端由用户确认并使用系统电话能力拨号。
2. PC 不假设存在云端自动拨号器、PBX、预测式拨号或录音录制能力。若未来接入电话服务商，再扩展 `provider` 与 webhook 适配层。
3. 手机端返回通话结果、通话时间、设备与可用录音引用；客户阶段仍由 PC 流程更新。写入通话结果不自动推进客户阶段。
4. PC 通话记录页提供方向/结果/人员/日期筛选、数据指标、记录表格、详情侧栏；录音和 AI 摘要只有在服务端确实有权限与资源时可见。

## 页面与交互字段

### 通话记录页

- 指标：通话数、外呼接通率、总通话时长、待跟进通话。
- 筛选：开始/结束日期、方向（全部/呼出/呼入）、通话结果、负责人、客户/号码、是否含录音。
- 表格：客户、号码（按权限脱敏）、方向、负责人、开始时间、时长、通话结果、录音、AI 摘要、下一步、操作。
- 操作：查看详情、打开客户详情、复制号码（受字段权限控制）、创建跟进事项。
- 详情侧栏：通话状态和时间线、客户/负责人/设备、结果标签、备注、录音播放器（若授权）、转写/摘要（若已生成）、关联跟进事项、审计信息。

### 外呼操作

- 发起入口：客户列表/详情、线索跟进记录行的“拨打”。先展示确认面板：客户、号码、目标设备、设备在线状态、可选话术提示。
- 发送成功后显示“已发送到手机，等待接听端确认”；不可显示成电话已接通。
- 设备离线、授权过期、号码为空或号码不可读时阻止发送并给出明确恢复方式。
- 手机结束通话后允许快速录入结果：已接通、无人接听、忙线、拒接、号码无效、其他；备注可选。同步失败显示待同步状态并支持幂等重试。

## 逻辑数据库

### `call_records`

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `id` | bigint（雪花 ID） | 主键；JSON API 按字符串传输 |
| `workspace_id` | bigint（雪花 ID） | 工作区隔离 |
| `customer_id` | bigint（雪花 ID） | 客户外键；删除客户时保留历史，可设为 nullable 并记录快照 |
| `lead_id` | bigint nullable | 可选关联线索 |
| `owner_user_id` | bigint（雪花 ID） | 负责人 |
| `device_id` | bigint nullable | 发起外呼的配对手机 |
| `direction` | enum | `outbound` / `inbound` |
| `status` | enum | `requested` / `dialing` / `connected` / `ended` / `failed` / `cancelled` |
| `result_code` | enum nullable | `connected` / `no_answer` / `busy` / `rejected` / `invalid_number` / `other` |
| `started_at`, `ended_at` | datetime(3) nullable | UTC 通话时间；结束前允许为空 |
| `duration_seconds` | integer | >= 0；从实际开始和结束时间派生或服务端校验 |
| `phone_snapshot` | text | 发起时号码快照；加密存储并按权限读取 |
| `note` | text nullable | 通话备注 |
| `recording_asset_id` | bigint nullable | 私有对象存储资源，不暴露可猜 URL |
| `source` | enum | `customer_detail` / `customer_list` / `lead_followup` / `mobile_inbound` |
| `idempotency_key` | text | 唯一约束 `(workspace_id, idempotency_key)` |
| `sync_state` | enum | `synced` / `pending` / `failed` |
| `created_at`, `updated_at` | datetime(3) | UTC 审计时间 |

索引：`(workspace_id, started_at DESC)`、`(workspace_id, owner_user_id, started_at DESC)`、`(workspace_id, customer_id, started_at DESC)`、`(workspace_id, result_code, started_at DESC)`。号码快照避免在索引中存原始号码；如需号码精确查找，另存带密钥的 HMAC 搜索列。

### `call_dispatches`

一次 PC → 手机的拨号请求，独立于已发生的通话。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint（雪花 ID） | 主键；JSON API 按字符串传输 |
| `workspace_id` | bigint（雪花 ID） | 工作区 |
| `customer_id` | bigint（雪花 ID） | 目标客户 |
| `device_id` | bigint（雪花 ID） | 目标设备 |
| `requested_by` | bigint（雪花 ID） | 发起人 |
| `phone_snapshot` | text | 加密号码快照 |
| `status` | enum | `queued` / `accepted` / `declined` / `expired` / `cancelled` / `failed`；`delivered` 是投递事件，不是拨号状态 |
| `source` | enum | `customer_list` / `customer_detail` / `lead_followup` |
| `script_code` | varchar nullable | 外呼时提供给手机端的可选话术编码；当前只随派发保存，移动端展示待接入 |
| `follow_up_status` | varchar nullable | 发起外呼关联的跟进上下文状态，不等同于自动更新客户阶段 |
| `request_note` | varchar(500) nullable | PC 给手机端的提醒；不得包含未经授权的敏感字段 |
| `expires_at` | datetime(3) | UTC 短时有效；默认 300 秒，过期后不能接受或拨号 |
| `call_record_id` | bigint nullable | 手机接受并开始拨号后关联创建的通话记录；通话结束结果通过通话记录回填 |
| `idempotency_key` | text | 重试去重 |
| `created_at`, `updated_at` | datetime(3) | UTC 审计 |

索引：`(workspace_id, device_id, status, expires_at)` 用于手机端待处理轮询；`(workspace_id, customer_id, created_at DESC)` 用于客户历史；`UNIQUE(workspace_id, idempotency_key)` 用于重复请求去重。`accepted` 只表示手机端确认了请求，不表示已拨号或已接通；后续拨号通过 `call_records` 表示。

### `call_dispatch_events`

派发事件追加记录，支撑 PC 端详情抽屉里的创建、投递、接受、拒绝、过期、取消和失败时间线：

`id, workspace_id, dispatch_id, event_type, actor_type, actor_id, device_id, device_event_id, payload_json, occurred_at, received_at`。

事件类型：`created`、`delivered`、`accepted`、`declined`、`expired`、`cancelled`、`failed`。同一设备的 `device_event_id` 唯一；`payload_json` 只写错误码和必要状态，不写完整手机号、令牌或本机文件路径。

当前 Yudao 落地表为 `cp_call_dispatch_event`（v36）和 `cp_mobile_call_event`（v7 建表、v44 增加 nullable `request_fingerprint`）。完成请求另保存基于配对设备密钥的 HMAC 指纹，不存备注明文；同一设备事件 ID 重放时校验原请求，避免不同请求体被误报成功。派发事件表补足 PC 创建/撤回和系统过期轨迹，管理端状态查询一起返回时间线。

### `call_record_events`

追加式状态历史：`id, workspace_id, call_record_id, event_type, from_status, to_status, actor_type, actor_id, payload_json, occurred_at, received_at`。移动端事件有来源设备和事件 ID；相同设备事件 ID 唯一，拒绝非法状态倒退。

### `recording_assets`（可选能力）

仅在录音有合法来源和授权时启用：`id, workspace_id, call_record_id, storage_key, mime_type, duration_seconds, size_bytes, checksum, retention_until, consent_state, created_at`。下载采用短效授权 URL，并在过期或撤销后拒绝访问。

## API 草案

通用响应与分页约定见 `docs/README.md`。所有 PC 写接口要求会话、CSRF 防护和角色授权；移动端使用配对设备的短期令牌，并绑定 workspace 与 device。

| 方法与路径 | 用途 | 核心输入/输出 |
|---|---|---|
| `GET /api/v1/call-records` | 查询通话记录 | query: `from,to,direction,result,owner_id,customer_id,q,has_recording,page,page_size,sort`; 返回记录行与 `meta.total` |
| `GET /api/v1/call-records/{id}` | 详情侧栏 | 记录、客户摘要、状态事件、可见录音/AI摘要标记 |
| `POST /api/v1/call-dispatches` | PC 推送到手机 | body: `customer_id,device_id,source,script_code?,follow_up_status?,request_note?`; header `Idempotency-Key`; 服务端重新查权限和号码，返回 `dispatch_id,status,expires_at` |
| `GET /api/v1/call-dispatches/{id}` | 查询派发状态 | 返回当前 `status`、事件时间线、设备摘要、`expires_at` 与允许的下一步操作；投递时间从事件中读取 |
| `POST /api/v1/call-dispatches/{id}/cancel` | PC 取消待处理派发 | 仅未过期的 `queued` 可取消；服务端按发起人、当前状态和过期时间做条件更新，接受与取消并发时至多一个成功 |
| `POST /api/v1/mobile/call-dispatches/{id}/decline` | 手机拒绝派发 | body: `device_event_id,reason_code?`; 原因仅用 `not_available/wrong_number/wrong_time/other` 枚举；仅待处理派发可拒绝；幂等写入 `declined` |
| `POST /api/v1/mobile/calls` | 手机直接拨号或接受 PC 派发并开始拨号 | body 按来源传 `customer_id` 或 `dispatch_id` 与 `device_event_id`；服务端校验后原子创建通话记录、将派发置为 `accepted`，返回 `call_id` 和允许拨打的号码；缺少目标 ID 返回请求错误；不代表通话已接通 |
| `POST /api/v1/mobile/calls/{call_id}/complete` | 手机回填通话结果 | body: `device_event_id,result_code,started_at,ended_at,duration_seconds,recording_available?,note`; 幂等写入。录音通过单独的 `/recording` multipart 接口上传，详情见[移动端 API 契约](mobile-api-contract.md) |
| `PATCH /api/v1/call-records/{id}` | PC 修正结果/备注 | body: `result_code,note,expected_version`; 写入审计事件 |
| `POST /api/v1/call-records/{id}/follow-ups` | 从记录创建跟进事项 | body: `assignee_id,due_at,content`; 返回跟进事项 ID |
| `GET /api/v1/call-records/{id}/recording-access` | 请求录音播放权限 | 再次校验范围、授权和保留期，返回短效播放令牌；无录音/无权用统一错误码 |

错误码：`DEVICE_OFFLINE`、`DEVICE_NOT_PAIRED`、`AUTHORIZATION_EXPIRED`、`PHONE_NUMBER_UNAVAILABLE`、`DISPATCH_EXPIRED`、`DISPATCH_ALREADY_HANDLED`、`CALL_STATE_CONFLICT`、`RECORDING_FORBIDDEN`、`IDEMPOTENCY_CONFLICT`。

### 当前 Yudao 管理端实现映射

通话汇总中的“今日外呼”和“今天到期”按 `Asia/Shanghai` 自然日统计；查询边界再转换为 UTC `LocalDateTime`，与表内 UTC-naive 时间保持一致。今日数量遵守同一负责人数据范围，页面按选择的负责人或当前权限范围标注口径。

| 方法与路径 | 状态 | 说明 |
|---|---|---|
| `GET /callphone/call-record/page`、`GET /callphone/call-record/get` | 已实现 | 按 Yudao 角色负责人数据范围与当前租户过滤；客户姓名/备注在服务端解密后返回，号码仅返回掩码 |
| `GET /callphone/call-record/summary` | 已实现 | 按 Yudao 角色负责人范围和当前租户聚合筛选范围内接通率、总/平均通话时长；单独统计上海自然日今日外呼与待办/今日到期跟进数，日边界换算到 UTC 查询 |
| `GET /callphone/call-record/export-excel` | 已实现 | 独立 `callphone:call:record:export` 权限；复用通话筛选和 Yudao 负责人数据范围，超过 5000 条要求缩小筛选；文件仅含脱敏号码、负责人/设备与通话状态时间等元数据，不包含客户姓名、完整号码、跟进内容或通话备注；不记录可能含号码筛选词的 URL 访问日志 |
| `GET /callphone/call-record/events?id=` | 已实现 | 校验通话归属后读取手机事件表，按发生时间返回最多 50 条；仅返回事件类型和时间，不回传设备密钥或原始载荷 |
| `GET /callphone/customer/simple-list?query=` | 已实现 | 当前用户的活动客户按更新时间倒序分批扫描，返回最多 20 条匹配结果；姓名/号码只在进程内解密匹配，不存在固定前 100 条候选窗口；姓名支持部分匹配、号码支持后缀匹配 |
| `GET /callphone/device/paired-list` | 已实现 | 仅列出本人配对设备；2 分钟内心跳视为在线 |
| `POST /callphone/call-dispatch/create` | 已实现 | 要求 Idempotency-Key；服务端校验目标负责人就是当前登录成员、客户有效或线索本人已领取、设备本人持有且两分钟内在线；手机号密文快照、话术编码、跟进上下文和备注入库 |
| `GET /callphone/call-dispatch/get?id=`、`POST /callphone/call-dispatch/cancel` | 已实现 | 仅发起人可查看/撤回；查看时惰性标记过期并返回派发状态事件；Call Phone 服务以 queued 状态和有效期 CAS 完成撤回/过期，事件与状态同事务写入，避免覆盖手机并发接受 |
| `/callphone/device/pairing-code/*`、`GET /callphone/device/list`、`POST /callphone/device/revoke` | 已实现 | 配对码只存 SHA-256，单次认领，5 分钟过期；设备密钥哈希与心跳已接入；尚未数据库联调 |
| `/callphone/mobile/*` | 已实现 | 校验成员身份和 X-Callphone-Device-Key；手机接受后才返回完整号码；移动事件 UUID 幂等；尚未真机联调 |

### 线索外呼联动（v38）

- 通话记录仍是唯一的外呼记录菜单页面；线索外呼入口在「线索跟进」页，不增加菜单。PC 创建派发时必须且只能提交 `customerId` 或 `leadId` 之一。线索必须处于本人已领取状态；客户必须处于本人可拨打状态。
- `POST /callphone/call-dispatch/create` 在线索场景传 `leadId,deviceId,source=lead_followup,nextFollowUpAt?,requestNote?` 和 `Idempotency-Key`。`GET /callphone/call-dispatch/get?id=` 返回 `leadId,callRecordId,callStage` 及派发事件；PC 撤回成功后重新读取派发状态。
- 客户外呼面板可传可选 `nextFollowUpAt`，并只允许 `source=customer_detail|customer_list`；线索跟进入口必须使用 `leadId` 与 `source=lead_followup`。服务端校验来源和目标类型一致，避免客户拨号被错误归入线索来源。客户通话结果回填时，如果设置了下次跟进时间，则在同一事务新建加密的 `cp_follow_up_task`，关联客户、通话和当前负责人；未设置时间不自动创建待办。失败后重新发起会预填原客户、设备、话术、关联状态、下次跟进时间和提醒备注；打开新客户草稿时清空上一草稿的备注与时间。
- 重放 `POST /callphone/call-dispatch/create` 时，同一键必须对应完全相同的客户/线索、设备、来源、话术、跟进状态、备注和下次跟进时间，否则返回幂等冲突；PC 发起抽屉在网络失败后对未变更请求复用原键，字段变化后使用新键。
- 服务端先按当前发起人和幂等键读取已存在的派发，再校验客户/线索当前是否仍可新建派发。这样原请求成功但响应丢失后，即使线索后来被归档，完全相同的重试仍返回原派发；请求字段变化仍返回幂等冲突。
- 两个首次请求并发使用同一幂等键时，由数据库唯一约束选出唯一派发；失败请求捕获唯一键冲突后使用 `SELECT ... FOR UPDATE` 当前读获取赢家。若字段相同返回赢家，字段不同时返回幂等冲突。
- 移动端接受派发时写入 `cp_call_record.lead_id` 并保留线索姓名/号码快照。手机完成通话时，在同一事务更新通话事实与移动事件，并向 `cp_lead_activity` 新增电话跟进；派发状态保持 `accepted`，通话阶段从通话记录状态派生，二者不混为一个状态。加密备注复用 PII 加密服务，唯一键 `(tenant_id,call_record_id)` 保证完成事件重试不会重复写活动。
- 通话详情按关联对象提供后续入口：客户通话进入「跟进事项」并带入客户与来源通话；线索通话进入「线索跟进」，按 `leadId` 选中线索、按 `sourceCallRecordId` 高亮自动生成的跟进活动，用户可直接返回同一条通话详情。线索外呼完成后活动自动创建，因此此入口用于查看跟进，不重复创建活动。
- `callphone-v38-lead-outbound.sql` 将派发和通话记录的 `customer_id` 改为可空并添加 `lead_id`，同时加入线索查询索引及通话跟进唯一键。初始化脚本版本序列已推进到 v39；v39 增加客户 CSV 导入幂等键和权限。
- 本地预览支持模拟手机接受/拒绝/过期与结果回填，仅写浏览器本地演示数据。浅色主题检查覆盖列表、派发表单和完成状态弹窗；真实手机和数据库联调仍需可用的 MySQL/服务环境。

当前本地模式权限键：`callphone:call:record:query`、`callphone:customer:query`、`callphone:call:dispatch:create`。管理端内部仍使用 Yudao Long ID；`CallPhoneMobileV1AdapterController` 将公开移动契约的 snake_case 和字符串 ID 映射到模块内部 API。录音上传、访问审计、设备校验后的移动端读取及 `/api/v1/mobile/diagnostics` 已落入代码；真机流程、v47/v48 数据库迁移与新 API 镜像仍待运行环境联调。服务端将设备密钥 SHA-256 摘要持久化在 `cp_device`，每次请求读取设备记录并校验摘要；原始密钥目前仅保存在 uni-app 运行时内存，应用进程重启后需要重新配对，系统安全存储尚未接入。

真实通话详情时间线使用 `GET /callphone/call-record/events?id=`，从 `cp_mobile_call_event` 读取手机接受、拒绝、开始和结束的幂等事件。通话记录接口补充 `callDispatchId` 和 `createTime`，详情页真实模式只呈现后端返回的状态事件；预览模式才使用浏览器内样例时间线。

客户列表当前权限另为 `callphone:customer:list`、`callphone:customer:save`、`callphone:customer:archive`；页面不允许读取其他负责人的客户。

外呼派发与通话进度分开呈现：派发状态为 `queued` 时展示「已投递 / 等待手机确认」及到期时间；`accepted` 后由独立的 `callStage` 展示手机等待拨号、正在通话或已完成回填。派发状态不会改成 `completed`；派发状态时间线也不伪造通话完成事件。v53 会把旧版本在已结束通话下写成 `completed` 的派发行幂等恢复为 `accepted`；旧版错误归类的派发完成事件保留原始审计记录，但不再出现在派发状态时间线中，通话结果仍从通话记录事件读取。PC 抽屉在 `queued` 和 `accepted` 且通话未完成期间继续串行轮询，避免请求重叠；终态或 `callStage=completed` 时停止，回填完成后刷新通话记录。关闭抽屉或离开页面会取消后续轮询。`expired` 展示重新选择在线设备并发送；`failed` 展示网络/配对错误与重试入口；`declined` 展示手机端拒绝原因（如有）；`cancelled` 展示请求已撤回。投递事件不可冒充成通话记录状态。

## 初稿验收点

- 明确区分“已派发”“手机已接受”“已接通”，避免把外呼请求误显示为通话事实。
- 通话结束结果与客户阶段解耦；创建跟进事项是显式操作。

### 跟进事项状态

- `pending` 可编辑、完成或取消；逾期是基于 `due_at` 对 pending 的查询态，不单独落库。
- `completed` 与 `cancelled` 为终态，不允许再次编辑或重复取消。完成保留 `completed_at`；取消写入 `cp_follow_up_task_event`，记录操作者、原状态和目标状态。
- 取消接口按租户、事项负责人和 pending 状态做条件更新；并发完成/取消时只有一个状态变更成功。
- 列表计数返回待处理、逾期、已完成和已取消数量；逾期数从仍为 pending 的事项中计算。

相关接口：`POST /callphone/follow-up-task/cancel?id={id}`，权限 `callphone:followup:cancel`。取消历史表只记录状态操作元数据，不复制客户姓名、手机号或跟进内容。
- 支持同步失败、设备离线、无录音、无数据、号码脱敏和无权限状态。
- 录音及 AI 内容只按实际功能和授权显示，不使用虚构播放按钮暗示后端能力已存在。
