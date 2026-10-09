# 移动端交互 API 契约（v1 草案）

> 状态：供 Call Phone 移动端实现与后端评审的基线契约。UI 来源为 Figma「Call Phone · Android UI 初稿」；派发查询、接受/拒绝、拨号开始和结果回填已映射并通过 Maven 打包，真实数据库/真机联调尚未完成。

## 范围与设计边界

- 页面：工作台（空白占位）、客户列表、客户详情、我的；以 [Figma 移动端稿](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=1-2) 为视觉和交互依据。
- 后端只保存客户授权的业务信息、通话元数据及客户侧录音；手机拨号、通话监听与录音由现有 uni-app 原生插件完成，API 不模拟拨号能力。
- PC 创建外呼派发，手机前台确认后才读取号码并调用系统拨号；“已派发 / 已接受 / 已拨号 / 已接通”是不同状态。
- API 逻辑前缀为 `/api/v1`，沿用 `docs/README.md` 的 UTC 时间、字符串 ID、分页和错误信封约定。芋道接入时可将该契约映射到 `/app-api` 路由，但不要让移动端绑定芋道内部 Controller 路径。
- 客户与通话数据只请求客户自己部署的数据平面。产品方授权平面只接收授权码/部署 ID、设备公钥、应用版本、功能权益与用量，不接收姓名、手机号、客户 ID、通话记录、录音或转写。

## 通用约定

- 登录：复用 Call Phone 当前账号认证；配对不能替代登录或扩大当前用户权限。所有移动端业务 API 使用短期 Bearer access token，刷新令牌按设备独立、可撤销。
- ID：JSON 一律使用十进制字符串。时间：ISO 8601 UTC，例如 `2026-10-03T12:30:00.000Z`。
- 列表：`page`、`page_size`（默认 20，最大 100）；如服务端实现变更游标分页，响应仍需稳定的 `next_cursor`。
- 成功：`{ "data": ..., "meta": ... }`；失败：`{ "error": { "code": "...", "message": "...", "details": ... } }`。
- 创建/命令类写操作使用 `Idempotency-Key`（UUID），原生插件回调用 `device_event_id`，录音 multipart 上传用 `upload_id`。同一幂等标识、相同请求/文件的重试返回首次结果；相同标识搭配不同请求/文件返回冲突。
- 通话完成事件使用 `(device_id, device_event_id)` 唯一键，并保存由该设备配对密钥计算的 HMAC 请求指纹（不保存明文备注）；相同事件 ID、相同请求返回原结果，事件 ID 相同但通话/结果/时间/时长/备注不同则返回 `IDEMPOTENCY_CONFLICT`。旧事件无指纹时由已保存的加密通话记录字段做兼容核对。
- 手机号仅在当前用户字段权限允许时返回；客户端不得将授权判断仅放在 UI。API/分析/崩溃日志必须遮蔽手机号、姓名、录音 URL 与令牌。
- 移动端离线时，通话结果进入当前进程内存中的待同步队列，恢复连接后以原键重试；应用进程退出后队列可能丢失，当前没有安全的持久化队列。不得因产品方授权服务短暂不可用而阻断客户本地数据访问。

## 页面数据与接口

| 页面/动作 | API | 说明 |
|---|---|---|
| 启动/我的 | `GET /api/v1/mobile/bootstrap` | 返回当前用户、工作区、当前设备配对状态、许可证快照、功能开关及服务端时间。许可证状态需区分 `active`、`grace`、`expired`、`unavailable`；控制平面不可达时展示最后验证时间，不上传业务数据。 |
| 客户：今天/最近/全部 | `GET /api/v1/mobile/customers?scope=today\|recent\|all&q=&page=&page_size=` | 只返回明确分配/同步到此用户或配对设备可见范围内的客户。列表字段：`id,name,phone_display,phone_dialable,avatar_initial,stage,last_call_at,last_call_result,last_call_duration_seconds`。`phone_dialable` 仅在用户有拨号权限时返回。 |
| 客户详情 | `GET /api/v1/mobile/customers/{customer_id}` | 返回客户身份、可读电话号码、当前阶段/标签、最近通话记录摘要和分页通话记录；遵守字段级权限。 |
| PC 下发外呼 | `GET /api/v1/mobile/call-dispatches?status=queued&page=&page_size=` | 手机前台轮询待处理派发；可用 WebSocket 作为唤醒提示，但 REST 查询必须可恢复漏掉的通知。目标可以是客户或本人已领取的线索，使用 `target_type=customer|lead` 和对应的 `customer_id` / `lead_id`；返回联系人摘要、掩码号码、请求人、设备、过期时间。接受前不返回完整号码。 |
| 接受 PC 派发并准备拨号 | `POST /api/v1/mobile/calls` | body 为 `{ "source":"pc_dispatch", "dispatch_id":"...", "device_event_id":"..." }`。服务端从派发解析唯一目标，校验仍有效、设备与用户配对、客户仍归本人且有效或线索仍由本人领取，以及号码权限；原子地将派发置为 `accepted` 并新建通话记录。成功后才返回完整 `phone_number`、`call_id`、`dispatch_id` 和关联目标 ID。缺少 `dispatch_id` 会返回明确请求错误，不以成功空响应表示失败。 |
| 拒绝 PC 派发 | `POST /api/v1/mobile/call-dispatches/{dispatch_id}/decline` | body 为 `{ "device_event_id":"...", "reason_code":"not_available|wrong_number|wrong_time|other" }`；原因只传枚举，不传自由文本；只允许处理仍处于 `queued` 的请求，幂等写入 `declined` 事件，不创建通话记录。 |
| 手机直接拨打客户 | `POST /api/v1/mobile/calls` | body 为 `{ "source":"customer_list\|customer_detail", "customer_id":"...", "device_event_id":"..." }`。服务端校验客户/号码权限，创建状态为 `requested` 的通话记录并返回 `call_id` 与可拨号码；客户端随后调用本机插件。缺少 `customer_id` 或 `source` 不在允许枚举时返回明确请求错误。 |
| 通话结束/回填 | `POST /api/v1/mobile/calls/{call_id}/complete` | body：`{ "device_event_id":"...", "result_code":"connected\|no_answer\|busy\|rejected\|invalid_number\|other", "started_at":"...", "ended_at":"...", "duration_seconds":198, "recording_available":true, "note":"..." }`。通话 ID 只放在 URL 路径，不重复放入 body。服务端校验所属用户、设备、状态转移和时间；客户端时长只用于与开始/结束时间交叉校验（容差 120 秒），落库时长由服务端按时间差计算，避免指标使用客户端自报值。不自动推进客户阶段。允许离线重试且写入审计历史；`recording_available` 只将状态标为待同步，不上传文件。 |
| 上传录音 | `POST /api/v1/mobile/calls/{call_id}/recording` | multipart 字段 `file`、`upload_id`；必须使用原通话的已配对设备凭据，服务端仅接受该设备所结束的通话；单文件最多 25 MiB，通过文件头识别 WAV、AMR、MP4/M4A、AAC、MP3，忽略客户端文件名与 MIME 声明。服务端以独立派生密钥 AES-GCM 加密后写客户侧私有目录，数据库仅保存对象键、摘要与归属元数据；同一 `upload_id` 和相同内容可幂等重试。 |
| 播放录音 | `GET /api/v1/mobile/calls/{call_id}/recording-access`，再 `GET /api/v1/mobile/calls/{call_id}/recording` | 重新校验登录、当前配对设备、通话负责人、设备归属和录音资源；返回相对播放路径，客户端下载时继续携带 Bearer 与设备密钥。没有录音或无权时返回错误，不构造假 URL；响应禁止缓存。 |
| 查看/解绑本机 | `GET /api/v1/mobile/devices/current`、`DELETE /api/v1/mobile/devices/current/pairing` | 返回设备名称、平台、上次同步、配对 PC 与授权状态；解绑撤销该设备刷新令牌并清除待执行派发。 |
| 诊断与帮助 | `GET /api/v1/mobile/diagnostics` | 返回数据服务可达状态、授权检查状态与当前账户是否存在已配对设备。待同步队列数量只在手机本地统计，不上传；电话、录音文件权限由客户端原生 API 本地检查，不上传设备隐私信息。 |

## 当前芋道后端映射（核心外呼流程已实现并编译，真实联调待完成）

移动端的员工登录使用 Yudao 管理端账号（ADMIN user type）；C 端 MEMBER 账号不能认领或使用 Call Phone 工作设备。除首次认领外，每个设备请求提交 `deviceId` 和 `X-Callphone-Device-Key`，服务端校验设备归属、绑定状态、租户和请求人。只有接受有效派发时才返回完整号码。接口路径由管理端 API 网关承载；兼容 API 将雪花 ID 显式序列化为十进制字符串，避免 JavaScript 整数精度损失。

| 当前路径 | 用途与约束 |
|---|---|
| `POST /callphone/mobile/pairings/claim` | body: `pairingCode,displayName,platform`；代码属于当前登录成员且未过期时，一次性返回设备 ID 和 256-bit `deviceKey`；服务端只存 SHA-256 摘要 |
| `POST /callphone/mobile/devices/heartbeat` | body: `deviceId`，header `X-Callphone-Device-Key`；刷新设备心跳，PC 以 2 分钟为在线窗口 |
| `GET /callphone/mobile/dispatches?deviceId=` | header `X-Callphone-Device-Key`；拉取本人设备未过期的待确认派发；只返回号码掩码与客户摘要，并惰性清理过期派发 |
| `POST /callphone/mobile/call-dispatches/accept` | body: `dispatchId,deviceId,deviceEventId`；服务端解析 customer/lead 唯一目标，原子接受并创建 `requested` 通话记录；成功响应才包含完整 `phoneNumber`、`callRecordId` 和 `dispatchId` |
| `POST /callphone/mobile/call-dispatches/decline` | body: `dispatchId,deviceId,deviceEventId,reasonCode?`；只允许 queued 且未过期状态 |
| `POST /callphone/mobile/calls/started` | body: `callRecordId,deviceId,deviceEventId,startedAt`；接受系统拨号后转为 dialing |
| `POST /callphone/mobile/calls/complete` | body: `callRecordId,deviceId,deviceEventId,resultCode,startedAt,endedAt,durationSeconds,note?`；验证时间/时长（容差 120 秒，落库采用服务端时间差）、加密备注、幂等事件并结束通话。关联线索的派发会在同一事务新增一条带 `callRecordId` 的电话跟进活动并写入可选的下次跟进时间；客户和线索目标互斥 |

### 保留移动端 `/api/v1/mobile` 路径

Call Phone 模块增加兼容控制器，手机端无需改成 `/callphone/mobile/*`。设备请求通过 `X-Callphone-Device-Id` 与 `X-Callphone-Device-Key` 传递配对凭据；服务端在 `cp_device` 持久化密钥 SHA-256 摘要并逐请求校验，原始密钥目前只保存在 uni-app 运行时内存，应用进程重启后需要重新配对；Android Keystore/iOS Keychain 持久化尚未接入。客户查询额外要求 `callphone:customer:query`，派发与通话动作要求 `callphone:call:dispatch:create`，配对认领要求 `callphone:device:pair:manage`。兼容接口如下：

| 移动端契约路径 | 对应模块能力 |
|---|---|
| `POST /api/v1/mobile/pairings/claim` | 把 `pairing_code/display_name/platform` 映射到现有配对认领，并以 `device_id/device_key/display_name` 返回；密钥在客户端进入内存凭据容器 |
| `GET /api/v1/mobile/bootstrap` | 返回当前成员、租户工作区、配对设备存在状态和受限授权快照；许可证访问错误以 `unavailable` 表示 |
| `GET /api/v1/mobile/customers?scope=today\|recent\|all&page=&page_size=&q=` | 返回本人有效客户；today 按上海自然日内的通话记录筛选，UTC 存储的通话时间使用左闭右开日界；recent 是近 30 天有通话记录，all 是本人全部有效客户；手机号可拨字段仅在 `callphone:call:dispatch:create` 权限下返回，`q` 只匹配掩码号码 |
| `GET /api/v1/mobile/customers/{customer_id}` | 返回本人客户详情和最近 20 条通话摘要；跨成员、归档客户返回空结果 |
| `GET /api/v1/mobile/devices/current`、`POST /api/v1/mobile/devices/heartbeat`、`DELETE /api/v1/mobile/devices/current/pairing` | 返回当前设备摘要、刷新当前配对设备 `lastSeenAt`，并允许设备凭据持有人自助解绑；心跳只用设备 ID/密钥 header，每 15 秒派发轮询时一并触发，PC 两分钟内视为在线；解绑会沿用模块撤销事务，撤销密钥并将待处理派发置失败 |
| `GET /api/v1/mobile/call-dispatches` | 包装现有待处理派发查询，返回 `{items,total}` 分页形状和 snake_case 字段 |
| `POST /api/v1/mobile/call-dispatches/{dispatch_id}/decline` | 把 snake_case 拒绝字段映射到现有拒绝事务 |
| `POST /api/v1/mobile/calls` | 按 `source` 将电脑派发映射到原子接受；客户列表/详情直拨会创建本人、本人设备的 `requested` 通话并仅在授权后返回原号码 |
| `POST /api/v1/mobile/calls/started` | 把 `call_id`、设备凭据和设备事件映射到现有开始拨号接口 |
| `POST /api/v1/mobile/calls/{call_id}/complete` | 把路径 ID 和 snake_case 完成字段映射到现有结束事务，继续做服务端时长计算与幂等校验；若声明有本机录音则先记为待同步 |
| `POST /api/v1/mobile/calls/{call_id}/recording` | 上传已结束通话录音；匹配同一设备、负责人和通话，并在客户侧加密存储 |
| `GET /api/v1/mobile/calls/{call_id}/recording-access`、`GET /api/v1/mobile/calls/{call_id}/recording` | 校验设备与通话归属后提供私有录音读取；下载仍需 Bearer 与设备密钥 |

当前实现覆盖登录后的启动信息、本人客户列表/详情、当前设备/解绑、核心外呼链路、录音上传/读取和 `GET /api/v1/mobile/diagnostics`；真实手机端文件上传和播放需要含原生录音插件的设备联调。诊断只返回非敏感状态，不包含授权方案详情、设备标识、访问令牌或客户端待同步队列内容。

接受、拒绝、开始和完成事件以 `(tenant_id,device_id,device_event_id)` 唯一；除首次 claim 外，设备 API 要求独立设备密钥 header。`cp_device.device_key_hash` 和 `cp_desktop_pairing_code.code_hash` 只保存摘要；密钥仅在手机成功认领配对码时返回一次，PC 与普通设备列表均不返回密钥。

## PC 配对接口

| 方法与路径 | 用途/约束 |
|---|---|
| `POST /api/v1/desktop/pairing-codes` | 已登录 PC 创建一次性短效配对码，body：`{ "device_name":"办公室电脑", "expires_in_seconds":300 }`；返回 `pairing_code_id,pairing_code,expires_at`。服务端只存码的哈希，禁止写入日志。 |
| `GET /api/v1/desktop/pairing-codes/{id}` | PC 轮询配对状态；返回 `pending|claimed|expired|revoked`、过期时间和认领设备摘要，不返回设备凭据。手机认领后将配对关系写入设备表。 |
| `DELETE /api/v1/desktop/pairing-codes/{id}` | PC 取消未认领的配对码；撤销后立即不可认领。 |
| `POST /api/v1/mobile/pairings/claim` | 已登录移动端提交 `{ "pairing_code":"...", "device_name":"我的手机", "platform":"android\|ios", "app_version":"...", "device_public_key":"..." }`；需用户确认配对。返回已授权的设备摘要；错误码包括 `PAIRING_CODE_EXPIRED`、`PAIRING_CODE_USED`、`PAIRING_USER_MISMATCH`。 |

配对码只建立设备与已登录账户/工作区的关系，不授予比账户本身更大的客户可见范围。移动端设备需支持单台撤销；撤销后拒绝新请求并清除待处理授权令牌。

## 通话状态与插件边界

- 派发状态：`queued → accepted | declined | expired | cancelled | failed`。`delivered` 是通知投递事件，不是派发或通话状态；派发状态不代表拨号或接通。
- 通话状态：`requested → dialing → ended | failed | cancelled`；`result_code` 记录用户选择或插件能确认的结果。插件无法可靠确认时，不得伪报已接通。
- 原生拨号与录音适配封装在 `PhoneCapabilityAdapter`（或现有插件适配层）中。页面只调用语义方法，不直接散布平台 API、插件方法名或本机文件路径。
- 开始调用 API 成功后调用原生拨号；原生拨号拒绝/失败需回写失败结果。通话完成后让用户在 UI 中确认结果，插件系统状态只能作为候选值。
- 录音本机临时路径不会作为 URL 或业务字段上报；uni-app 将本机文件内容交给客户部署的录音上传 API。结果提示需区分仅保存通话结果、录音已上传、上传待重试和开发模拟状态；退出应用后未完成任务可能丢失，持久化离线队列仍待实现。
- 微信跳转是可选平台能力；通过适配层探测是否安装/可用，失败时保留在客户详情页并给出反馈，不阻断拨号与通话记录。

## 错误码

通用：`AUTH_REQUIRED`、`FORBIDDEN`、`NOT_FOUND`、`VALIDATION_ERROR`、`RATE_LIMITED`、`IDEMPOTENCY_CONFLICT`、`SERVICE_UNAVAILABLE`。

Yudao 兼容层对缺少客户或派发 ID 的拨号请求返回 Call Phone 错误码 `1031000089`，不返回成功但为空的数据。

设备/派发：`DEVICE_NOT_PAIRED`、`DEVICE_REVOKED`、`PAIRING_CODE_EXPIRED`、`PAIRING_CODE_USED`、`DISPATCH_EXPIRED`、`DISPATCH_ALREADY_HANDLED`、`PHONE_NUMBER_UNAVAILABLE`。

通话/录音：`CALL_STATE_CONFLICT`、`CALL_RECORD_NOT_OWNED`、`RECORDING_FORBIDDEN`、`RECORDING_EXPIRED`、`UPLOAD_INCOMPLETE`。

## 最小联调验收

1. 绑定用户只能看见自己被授权的客户；直接输其它客户 ID 不得读到资料或电话号码。
2. 前台轮询恢复后能查到此前漏掉的 PC 派发；过期/已处理派发不能重复拨号。
3. 直接拨号与 PC 派发拨号都经原生插件；本机失败不会伪造接通记录。
4. 重放通话结束事件不会重复生成记录；离线结果可以在恢复连接后同步。
5. 录音缺失/上传失败/无播放权限都有明确 UI 状态；原始本机路径与号码不进入日志。
6. 授权服务离线时按缓存权益展示状态，不发送客户信息到产品方授权服务。
