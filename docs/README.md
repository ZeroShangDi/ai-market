# Call Phone PC 初稿设计

## 范围与约定

- 菜单来源：Figma 文件 `Call Phone` 中的「PC · 应用中心菜单」画板（node `20:2`）。页面只对应第三级叶子菜单；一级分类和二级分组不单独生成页面。
- 移动端已完成，本轮不修改移动端画板。PC 初稿放在同一文件的新页面，避免混在已有手机稿和样例中。
- PC 已开始按纵向切片实现：`apps/ruoyi-vue-pro/yudao-ui-admin-vue3/` 承载 Vue3 管理 UI，`apps/ruoyi-vue-pro/yudao-module-callphone/` 是独立 Call Phone 业务模块；`apps/call-phone-uni/` 是现有移动端工程。docs 中会注明已落地的页面/API 与待实现契约，设计条目不自动代表代码已完成。
- 菜单提示“带‘规划’的菜单暂不开放”；当前菜单稿未显示任何叶子项带“规划”标记。本轮按可见的 41 个叶子项绘制初稿；如后续菜单标出规划状态，再按状态隐藏对应页面。
- 通用桌面规范参考现有「PC · 客户列表」画板：1440 × 900、Inter、蓝色主操作、白色内容面板、紧凑表格和页签工作区。
- 「PC · 客户列表」已存在于原始 Figma 页；本轮不重复创建。客户详情保留为该页面的二级视图，不计入第三级菜单页面数量。
- Figma 菜单核对结果：41 个第三级页面均有对应画板，其中 40 个在[PC 页面初稿](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=62-2)，「客户列表」沿用原稿已有画板。顶部工作台、品牌和账户控件不计为菜单页面。
- 外呼关键交互态：[发起外呼](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-602)、[派发状态](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-802)、[通话详情](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-1011) 是「通话记录」的抽屉状态；[配对码弹窗](https://www.figma.com/design/mmSoRVtmnoG8FfglOju1Jh/Call-Phone?node-id=79-1218) 是「电脑与配对」的页面状态，不新增菜单路由。

## 菜单第三级页面清单

### 拓客（8）

| 二级分组 | 第三级页面 |
|---|---|
| 活码引流 | 渠道活码、员工活码、门店活码、识客活码 |
| 获客物料 | 获客链接、组合海报 |
| 渠道运营 | 平台渠道、渠道数据 |

### 线索（5）

| 二级分组 | 第三级页面 |
|---|---|
| 入池管理 | 线索池 |
| 流转处理 | 分配与回收、线索跟进 |
| 转化归档 | 转化记录、无效/重复归档 |

### 客户（10）

| 二级分组 | 第三级页面 |
|---|---|
| 客户管理 | 客户列表、跟进事项、客户阶段 |
| 电话沟通 | 通话记录 |
| 企业微信 | 企微客户、客户群、客户运营 |
| 会话与服务 | 会话存档、服务质检、风险预警 |

### AI 助手（6）

| 二级分组 | 第三级页面 |
|---|---|
| 内容能力 | 话术助手、知识库 |
| 沟通辅助 | 通话总结、跟进建议 |
| 人工审阅 | 人工复核建议、AI 使用记录 |

### 系统设置（12）

| 二级分组 | 第三级页面 |
|---|---|
| 组织与权限 | 成员管理、团队与角色、数据权限 |
| 设备与授权 | 手机设备、电脑与配对、账户与授权 |
| 业务配置 | 业务字典、客户字段、阶段与结果配置 |
| 数据与系统 | 本地备份与恢复、诊断与日志、扩展服务配置 |

## 模块文档

- [uni 功能复查与待修复清单](reviews/2026-10-10-uni-functional-readiness.md)：5 项核心问题、验证证据与用户已确认范围；不做手机报表或独立本机录音库，录音跟随客户沟通记录播放，代码修复待后续。
- [通用应用更新模块](modules/app-update-module.md)：待实现方案，明确已有升级能力复用、版本源/平台适配、通用流程与验收标准。
- [模块边界与独立部署 ADR](architecture/modular-deployment-adr.md)：本次新增需求的推荐方案，明确前端独立制品、业务服务、公共能力、跨域流程、迁移和验收。
- [PC / 移动端审查报告](reviews/2026-10-10-mobile-pc-audit.md)与[联调验收清单](reviews/mobile-pc-acceptance.md)：本轮修复、测试证据、未验证项与真实环境复现步骤。
- [PC 端模块化架构罗盘](architecture/pc-module-architecture.md)：Electron + Vue 3 模块化单体、共享层边界、模块依赖方向、跨模块页面组合和菜单路由注册规则。
- [后端代码位置与部署边界](architecture/backend-deployment.md)：PC、手机、Yudao 数据平面和产品控制/核心服务各自在哪里运行，以及哪些现有模块可复用。
- [页面、数据库与 API 契约总表](contracts/page-api-matrix.md)：41 个第三级页面到业务表、API、权限、后端所有者和实现批次的映射。逐页实现以此为导航。
- [实现前现状与已知差距](contracts/implementation-readiness.md)：区分当前可复用模板源码、已运行能力、设计契约和尚未实现/核验的部分。
- [41 页逐页实现状态](contracts/page-implementation-status.md)：按前端、后端、数据库/权限和验证记录真实进度；原型和设计稿不计作完成。
- [公共数据库与 API 契约规则](contracts/api-data-conventions.md)：租户、字段类型、敏感字段、幂等、权限、错误、异步文件与契约完成定义。
- [技术选型建议](technical-selection.md)：uni-app + Electron、芋道 RuoYi-Vue-Pro 候选底座、MySQL；客户侧数据平面可自部署，产品方保留授权验证与核心 AI/API。
- [外呼与通话](modules/outbound-calling.md)：优先模块；通话记录、移动端配对发起、结果回填、录音与 AI 摘要。
- [移动端 API 契约](modules/mobile-api-contract.md)：移动端页面读取、PC 手机配对、原生拨号回填、录音与授权数据边界；另一个会话实现移动端时以此为接口基线。
- [拓客](modules/acquisition.md)：渠道码、获客物料和渠道分析。
- [线索](modules/leads.md)：入池、分配跟进、转化与归档。
- [客户](modules/customers.md)：客户主档、跟进、企微与服务质量；电话记录详见外呼文档。
- [企业微信营销能力盘点](modules/wecom-marketing-capabilities.md)：企业微信营销链路、官方能力、项目规划映射和操作验证资源清单。
- [AI 助手](modules/ai-assistant.md)：话术、知识库、通话总结、建议与人工审阅。
- [系统设置](modules/system-settings.md)：成员权限、设备授权、业务字典、客户字段和系统运维。

## 全局设计约定

- 业务实体默认沿用基础模板的雪花 `BIGINT` 主键；JSON API 将长整型 ID 序列化为十进制字符串，避免 JavaScript 精度损失。workspace 是逻辑隔离范围；首期复用 Yudao 时物理表只使用 `tenant_id`，不重复存 `workspace_id`。新表遵循 Yudao 的 `creator/create_time/updater/update_time/deleted`；有归档行为时使用 `archived_at`，有并发编辑风险的配置增加 `version`。MySQL 时间统一存 UTC 毫秒精度 `DATETIME(3)`，界面按工作区时区展示。
- API 统一前缀 `/api/v1`，列表接口使用 `page`、`page_size`、`sort`，成功响应 `{ data, meta? }`，错误响应 `{ error: { code, message, details? } }`。
- 列表查询必须执行 workspace 与角色数据范围过滤；手机号按权限脱敏展示。客户端不可将权限校验视为可信边界。
- API 与导出中的时间使用 ISO 8601 / UTC 表达，界面按工作区时区展示；所有写入接口应校验幂等键或版本号，避免移动端离线重试产生重复记录。
- 设计稿中的样例姓名、号码和录音均为虚构数据。
