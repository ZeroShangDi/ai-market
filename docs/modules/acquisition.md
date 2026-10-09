# 拓客

## 页面

拓客下所有第三级页面：渠道活码、员工活码、门店活码、识客活码、获客链接、组合海报、平台渠道、渠道数据。

本模块平台渠道、渠道/员工/门店/识客活码、获客链接及组合海报配置均有服务端管理接口。v43 起，活码必须配置 HTTPS 落地页；公开扫码仅写入租户、活码、渠道、自然日和次数的聚合行，然后返回 302 并附加 `utm_source=callphone`、`cp_ref`、`cp_type`。获客链接跳转同样附加其 `utm_source` 和本链接随机 `cp_ref`；受控落地页服务端可将 `cp_ref` 作为 `sourceCode` 调用客户自部署 Call Phone 的鉴权线索创建接口。活码和获客链接页只统计当前用户名下且来源码匹配公开码的线索；渠道数据页将公开来源码映射回绑定渠道。整个跳转链路不保存 IP、User-Agent、设备标识或逐次访问明细，不提供匿名 PII 收集接口；API 访问日志关闭。识客活码目前仅支持匿名访问规则；手机号和企微身份匹配在授权/隐私流程接入前由前后端拒绝保存为生效规则。预览模拟访问只写入浏览器本地。

平台渠道编码按租户唯一且创建后不可修改。新增时先做友好性预查，并以数据库唯一索引处理并发竞争；若竞争请求已占用相同编码，API 返回“渠道编码已被使用”，其他唯一键冲突继续保留原始异常，避免误报。

## 功能与字段

- **活码页**：新建/编辑名称、类型、渠道/员工/门店关联、HTTPS 落地页、欢迎语、识客规则和启停；扫码链接可复制、二维码可下载。列表显示累计匿名扫码次数和当前用户负责、来源码匹配的线索数，不展示线索 PII，也不冒充独立访客数；落地页创建线索时需把 `cp_ref` 写入 `sourceCode`；未配置落地页时不能启用二维码或用于海报。识客匹配尚未执行。
- **获客链接**：HTTPS 目标落地页、来源渠道、UTM 来源、启停状态；真实复制使用随机公开跳转码，服务端校验启用状态、限流并累计匿名点击，跳转时保留原有 query/hash 并设置 `utm_source`、`cp_ref`。已存在的受控线索创建链路可把 `cp_ref` 写入 `sourceCode`，页面按当前用户名下的来源码统计线索；面向公网的匿名个人信息收集、逐访客追踪和链接有效期暂未提供。
- **组合海报**：模板、标题、活码关联和启停状态由服务端保存；只有有效且已配置 HTTPS 落地页的活码可关联。真实模式生成可扫码二维码，并可下载 PNG 海报；本地预览可新建和编辑已保存的海报草稿，编辑沿用原 ID 并保留生成状态、下载次数和创建时间。下载次数只在本地预览模式中写浏览器存储。
- **平台渠道**：平台名称、渠道编码、状态、负责人、归因窗口（1–365 天；无效历史值按 30 天处理）。
- **活码配置**：公开编码、类型、渠道、员工或门店归属、识客规则、欢迎语、启停状态。平台渠道停用后禁止新增或修改关联活码。
- **渠道数据**：日期范围内的匿名扫码次数按渠道和上海自然日汇总；线索与转化按本人数据范围统计。线索创建时间及转化时间沿用 Yudao 的上海本地 `LocalDateTime` 存储，按上海自然日左闭右开筛选；外呼事件时间按 UTC 存储，查询上海自然日时转换为 UTC 边界。转化只计入线索创建后对应渠道归因窗口内发生的本人转化；转化率以日期范围内的有效线索数为分母。访问量是请求次数，不推断独立访客；获客链接累计点击与活码扫码采用不同口径，不混合进此统计。

渠道数据的单次查询最多跨 366 个自然日；前端只接受最新一次筛选请求的响应，避免快速切换日期后旧结果覆盖新结果。`conversionRate` 在有效线索数为 0 时为 `null`，真实数据应显示为不可计算（`—`），不能误报为“未接入”或 `0%`。

## 数据模型

- `cp_acquisition_channel`（v17）：`id, tenant_id, name, platform, channel_code, owner_user_id, attribution_window_days, status`，并包含 Yudao 审计列 `creator/create_time/updater/update_time/deleted`；`(tenant_id, channel_code)` 唯一。渠道编码创建后不可修改。
- `cp_acquisition_tracking_code`（v18，v43 增加 `landing_url`）：`id, tenant_id, public_code, name, code_type, channel_id, employee_id, store_name, match_rule, welcome_text, landing_url, status`，并包含 Yudao 审计列。`public_code` 是 128 bit 随机公开码；本表存配置，不存访问者或逐次扫码事件。
- `cp_acquisition_marketing_link`（v19，v40 增加公开跳转字段）：`id, tenant_id, public_code, name, destination_url, channel_id, utm_source, status, click_count, last_clicked_at`，并包含 Yudao 审计列。只保存累计跳转次数和最近时间，不保存访问明细、IP、User-Agent 或访客标识。
- `cp_acquisition_poster`（v20）：`id, tenant_id, name, title, template_id, tracking_code_id, status`，并包含 Yudao 审计列。模板限定 `sunset/ocean/mint`；服务端校验绑定的活码属于当前租户、已启用并配置 HTTPS 落地页。海报图片在浏览器生成，不存虚假的服务端下载次数。
- `cp_acquisition_tracking_scan_daily`（v43）：按 `(tenant_id, tracking_code_id, event_day, counter_bucket)` 保存 `channel_id` 与匿名 `scan_count` 聚合；不写逐次访问事件、IP、User-Agent、设备标识或客户身份信息。该表纳入 Call Phone 备份与恢复。
- 来源归因复用 `cp_lead.source_code` 与 `cp_lead_conversion.source_code`：线索创建时写入公开来源码，报表再映射到渠道。当前没有 `attribution_events` 表，也不记录访客级归因事件。

## API 契约摘要

完整的页面、权限和 API 映射见[页面契约总表](../contracts/page-api-matrix.md#拓客)。公共路径前缀、分页、ID、错误信封、幂等、数据范围及异步任务规则见[公共契约](../contracts/api-data-conventions.md)。

- 渠道当前实现：`GET /callphone/acquisition-channel/page`、`POST /save`、`PUT /status?id=&status=`。权限：`callphone:acquisition:channel:list/manage`；v17 使用客户数据平面内唯一 `(tenant_id,channel_code)`。未来稳定化接口：`/api/v1/acquisition/channels`。
- 活码配置当前接口：`GET /callphone/tracking-code/page?codeType=&pageNo=&pageSize=&query=`、`POST /callphone/tracking-code/save`、`PUT /callphone/tracking-code/status?id=&status=`。权限 `callphone:acquisition:code:list/manage`，配置表及菜单 v18，落地页与匿名日汇总 v43。分页返回 `landingUrl`、累计 `scans`，以及仅按当前登录用户和 `cp_lead.source_code=publicCode` 聚合的 `leads` 数量；不返回客户字段。创建/更新只接受有效 HTTPS 落地页，未配置落地页的旧码不能启用。
- 公开活码跳转：`GET /callphone/public/tracking-code/{publicCode}` 无需登录；仅活跃且有 HTTPS 落地页的码可用，按客户端 IP 每分钟最多 60 次。服务端在同一事务中锁定并确认活码状态、递增当天聚合次数，成功后返回 302 并附加 `utm_source`、`cp_ref`、`cp_type`；不存在、停用或冲突编码返回 404。写入扫码表的是日聚合，不存请求 IP 或 User-Agent，访问日志关闭。IP 仅用于限流，不落业务表。
- 获客链接当前接口：`GET /callphone/marketing-link/page?pageNo=&pageSize=&query=`、`POST /callphone/marketing-link/save`、`PUT /callphone/marketing-link/status?id=&status=`。权限 `callphone:acquisition:link:list/manage`；v19 配置表和菜单，v40 加公开码及匿名累计点击字段。分页增加 `leadCount`，仅聚合当前登录用户名下、`cp_lead.source_code=publicCode` 的记录，不返回 PII。
- 公开跳转：`GET /callphone/public/acquisition-link/{publicCode}` 无需登录，公开码为密码学随机 128 bit；仅 active 链接可访问，按客户端 IP 每分钟最多 60 次，返回 HTTP 302 并保留现有 query/hash、设置 `utm_source` 与 `cp_ref=publicCode`。每次成功跳转只原子递增 `click_count` 和 `last_clicked_at`；不写访问明细、不记录 IP、User-Agent 或访客键，访问日志全关。落地页自有后端在适当授权下调用需认证的 `POST /callphone/lead/save`，将 `cp_ref` 映射到 `sourceCode`；不允许从该匿名跳转接口提交姓名/电话。
- 组合海报配置当前接口：`GET /callphone/poster-composition/page?pageNo=&pageSize=&query=`、`POST /callphone/poster-composition/save`、`PUT /callphone/poster-composition/status?id=&status=`。权限 `callphone:acquisition:poster:list/manage`，数据库与菜单 v20；后端仅接受当前租户启用且配置落地页的活码。真实二维码和 PNG 在前端生成，不伪造服务端下载统计。
- 渠道数据当前接口：`GET /callphone/acquisition-analytics/summary?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`。权限 `callphone:acquisition:analytics:list`，v21 增页面/权限，v43 复用匿名扫码日聚合表返回日期范围内的渠道访问次数；线索/有效线索/转化按登录人负责人/转化人范围聚合 `cp_lead` 与 `cp_lead_conversion`，来源码同时支持渠道码、活码公开码和获客链接 `cp_ref`。转化还须在对应渠道的 `attribution_window_days` 内发生，默认/异常值按 30 天。
- 目标稳定化 API：`/api/v1/acquisition/tracking-codes?type=...`、`GET/PATCH /api/v1/acquisition/tracking-codes/{id}`、`POST .../{id}/disable`、`POST .../{id}/preview-match`；活码公开身份匹配仍需先落实访客授权和保留策略。
- 链接：`GET/POST /api/v1/acquisition/links`、`GET/PATCH /api/v1/acquisition/links/{id}`、`POST .../{id}/disable`、`GET .../{id}/stats`。现服务只保留匿名总点击数，不记录单次访客明细。
- 海报：`GET /api/v1/acquisition/poster-templates`、`GET/POST /api/v1/acquisition/posters`、`POST /api/v1/acquisition/posters/{id}/render`、`GET .../{id}`、`POST .../{id}/download-access`。渲染与导出为异步任务。
- 渠道分析：`GET /api/v1/acquisition/analytics?from=&to=&channel_id=&group_by=`，返回 `visits,leads,valid_leads,conversions,conversion_rate,updated_at,attribution_window_days`。

列表统一支持字段白名单 `q,status,channel_id,owner_id,from,to,page,page_size,sort`；不能将 `sort` 原样拼入 SQL。历史资源通过 disable/archive，禁止物理删除改变归因报表口径。
