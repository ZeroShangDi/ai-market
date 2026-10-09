# ADR：业务模块边界与独立部署

日期：2026-10-10。状态：设计建议，待按下文试点验收；本轮没有把现有系统重写为微服务或接入运行时插件框架。

## 决策

采用“业务模块 + 薄平台 + 显式契约”，部署采用“前端独立构建的业务应用 + 网关后面的业务服务”。现有 RuoYi/Yudao 留在 legacy 运行单元，逐块迁移。新的独立业务从第一天就有独立入口、构建和容器；强事务业务先留在同一业务核心，内部仍禁止跨模块访问实现。

独立部署以**业务部署单元**为粒度，不以每个菜单/每个 Java 包为粒度。客户、设备授权、外呼派发与通话结果首期归为 `communication-core`；AI、企微、拓客可先独立部署。客户资料、拨号授权、派发接受的事务一致性高于把几个 CRUD 菜单分成服务的收益。未来真的需要分别发布时，再把这些模块抽成独立服务。

仅分目录、Maven 模块或前端懒加载，仍会输出同一 JAR/同一前端包，不能满足“只部署改动模块”。独立部署要求独立制品、入口、兼容契约和数据库迁移。目标不是承诺任意破坏性变更也不用改消费者，而是兼容性范围内只发布目标单元。

## 现状与边界问题

- PC 实际是 `apps/ruoyi-vue-pro/yudao-ui-admin-vue3` 的 Vue3/Vite 网页应用。本仓库没有 Electron main/preload 工程。旧的 [PC 架构罗盘](pc-module-architecture.md) 描述 Electron 模块化单体，是前期方向，不代表当前已实现；其单制品部署约束由本 ADR 的新增需求替代。
- CallPhone 前端集中在 `src/views/callphone` 和 `src/api/callphone`，但路由、权限、请求、账户状态依赖大模板。生产包会构建大量无关业务页面；按功能分文件夹不能隔离发布。
- 后端已独立为 `yudao-module-callphone`，但由 `yudao-server` 装载。其 POM 依赖完整 system/infra，设置控制器直接引用 system 的 Service、DAL、控制器 VO，例如 `BusinessDictionaryController`、`TeamRoleMenuPermissionController`；这会把旧模型和升级成本带入新业务。
- 客户、线索、外呼、跟进等目前共享同一个 CallPhone 模块；移动兼容控制器直接访问这些 Mapper、旧移动控制器和设备控制器。本轮修复路由，没有冒险同时改造所有业务边界。
- 框架会依据 `.controller.admin/.controller.app` 包自动添加前缀并区分用户类型。本次真实路径问题说明：新代码需要通过专属 HTTP 适配器定义公共协议，不能默认旧框架约定永远适合新应用。

## 方案比较

| 方案 | 模块内开发 | 独立部署 | 代价/适用结论 |
|---|---|---|---|
| 分目录 + 同一包 | 容易起步 | 不支持 | 作为迁移起点，不能作为最终答案 |
| 模块化单体 + 边界测试 | 边界清晰、局部测试 | 单体整体部署 | 用于 communication-core 内部强事务业务 |
| 单体内动态 Java/OSGi 插件 | 运行时装卸 | 可换插件但牵涉 JVM/类加载/事务 | 运维、版本与隔离复杂，不选作业务发布主干 |
| 每个页面一个微服务 | 局部修改容易 | 支持 | 事务与运营复杂度过高，不选 |
| 独立业务服务 + 前端业务应用 | 清晰入口和所有者 | 支持 | 推荐；控制服务数量，按业务能力拆 |
| 前端 Module Federation | 可在同一工作台装载独立制品 | 支持前端独立发布 | 需要共享依赖/版本/故障隔离试点，不能解决后端独立部署 |

微前端原则是围绕业务能力和独立发布组织前端，不能只把组件远程化。[Micro Frontends](https://micro-frontends.org/)。渐进替换旧入口与通过适配器隔离旧模型，采用 Strangler Fig 与 Anti-Corruption Layer 的思路。[Microsoft 架构模式](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/patterns)。以上选型是结合本仓库现状作出的设计判断。

## 目标结构

以下为迁移后的目标目录，**当前未创建这些空壳目录**：

```text
apps/
  pc-shell/                   # 登录、工作区、菜单、模块装载、异常降级
  pc-communication/           # 客户/外呼/设备/跟进业务 UI，独立制品
  pc-ai/                      # AI 业务 UI，独立制品
  pc-wecom/                   # 企微业务 UI，独立制品
  call-phone-uni/             # 原生能力薄适配 + 移动业务
  ruoyi-vue-pro/              # 原开源工程，作为 legacy 运行单元
packages/
  platform-contracts/         # 小而稳定的 Shell 能力接口、错误、ID 等
  platform-ui/                # 无业务依赖的 UI、主题、表格/表单基础组件
  communication-contracts/    # 此领域公开 DTO、事件、客户端 SDK
  ai-contracts/
services/
  communication-core/
    modules/{customer,outbound,device,followup}/
      api/                    # 公开应用接口与 DTO
      application/            # 用例、事务、领域端口
      domain/                 # 业务实体、值对象、状态机、规则
      adapters/               # HTTP、DB、消息、legacy 适配
    runtime/                  # Boot 入口、配置、健康检查、部署
  ai-service/
  wecom-service/
  acquisition-service/
deploy/
  gateway/                    # 每条 API 路由明确一个所有者
  module-catalog/             # 已发布模块版本及入口，按环境管理
```

依赖方向：UI → 应用 API；HTTP/DB/legacy 适配器 → 应用端口 → 领域规则。领域不依赖 Controller、Vue、MyBatis、Spring Security 或其他域实现。模块 A 只能调用 B 的公开 API/事件，不得导入 B 的 Mapper/DO/ServiceImpl/组件内部文件。

## 公共资源：复用什么，如何控制耦合

| 资源 | 放在哪里 | 约束 |
|---|---|---|
| 主题、图标、基础按钮/表单/表格 | platform-ui | 不导入客户/通话等业务类型；保留本项目原图标资产 |
| 认证上下文、工作区、请求能力、错误映射 | platform-contracts + shell 实现 | 模块调用能力接口；不能读旧 Pinia store/localStorage token |
| 权限与租户 | 身份/平台服务 + 每个服务校验 | Shell 隐藏按钮用于体验，服务端独立授权 |
| 客户选择器、通话摘要 | communication 对外组件/契约 | 业务所有者提供；不塞进全局 common |
| 日期、十进制字符串 ID、分页协议 | 小型基础库 | 语义明确；PC 旧 camelCase/CommonResult 留适配器翻译 |
| 文件/录音 | 所属域服务 + 存储端口 | 不能共享可任意读取的文件路径；按账号/设备验证访问 |
| system/infra 旧能力 | legacy-platform-adapter | 将旧 VO/DO 翻译为平台契约；新模块不直接依赖旧 Service |

公共库按 SemVer 发布不可变版本；模块锁定兼容版本。增加可选字段通常可独立升级；删改字段/状态/语义需大版本或兼容窗口。公共 UI 更新不强制所有旧应用一起发布，主题 token 保持兼容。共享业务对象越少越好，禁止“万能 common-service”聚集所有跨模块逻辑。

平台是少量稳定能力，不能为了复用某个查询把业务所有权转交给平台。初期本仓库管理代码与工具即可，不需要多仓库；单仓也可以独立制品发布。

## PC：模块可插拔和独立静态发布

Shell 保留登录、工作区、菜单与页签容器。每个业务应用拥有自己的路由前缀、权限集合、API 客户端和根级样式作用域。它对 Shell 暴露 `mount(container, platform)`、`unmount()`、`routes`/菜单元信息；不能直接改 Shell router 或其他模块 store。

先用路由级独立应用证明发布边界（统一网关地址、业务路径单独指向静态制品）。验证页面切换、会话、刷新深链接、页签保留后，再针对同一页签工作台体验采用 Vite Module Federation；官方有 Vite 与运行时装载接口。[Vite 集成](https://module-federation.io/guide/basic/vite)、[运行时 API](https://module-federation.io/guide/runtime/runtime-api)。业务应用私有状态不得共享；Vue 等必要依赖的 singleton/version 策略须试点验证。[共享配置](https://module-federation.io/configure/shared)。本轮没有未经验证就接入联邦框架。

模块清单（示意）：

```json
{
  "id": "ai",
  "version": "1.2.0",
  "shellApi": "^1.0.0",
  "entry": "/modules/ai/1.2.0/entry.js",
  "routePrefix": "/ai",
  "required": { "identity-api": "^1.0.0" },
  "optional": { "communication-api": "^1.0.0" },
  "permissions": ["ai:summary:query"],
  "apiPrefix": "/api/v1/ai",
  "health": "/api/v1/ai/health"
}
```

这只是协议草案，`entry` 具体格式由联邦/独立应用试点确定。注册前验证版本、入口白名单、依赖与路由重复；按依赖拓扑装载，禁止环。必需依赖不兼容则模块不可启用，可选依赖缺失只隐藏对应能力。每个模块有错误边界，下载失败不能使整个工作台白屏。模块卸载必须注销计时器、监听器、路由、样式与资源 URL。

模块关闭不等于权限撤销，也不等于删除数据。后端保留历史数据读取和进行中流程的收尾；模块禁用期间阻止新的业务入口。故障降级与用户主动卸载是不同状态。第三方不可信插件不能加载为同源 JS；应使用独立源 iframe 和受限消息能力，不向插件传原始 token。官方自有模块发布源必须受控。

## 后端与数据：哪些能单独部署

communication-core 内部 customer/outbound/device/followup 使用公开应用接口 + 本地事务；这些模块不承诺独立重启。AI 等外围服务独立 Boot 入口、容器、数据库账号与迁移集，只依赖 API/事件。旧 system/infra 暂由 legacy 提供，API 适配器可先进程内调用，再替换 HTTP 实现，业务规则不随之变化。

每张业务表只有一个写入所有者。迁移前仍使用同一 MySQL 实例也可，但分 schema 或明确表所有权，禁止新服务直接 SQL JOIN/更新另一个域的数据。共享数据库账号会削弱边界，独立服务上线时必须落实权限。租户、数据范围、加密、幂等不能在拆分时丢失。

应用边界用自动检查落地：禁止域间实现依赖、禁止环、仅导出公开接口。Spring Modulith 可以检查这些条件。[模块验证](https://docs.spring.io/spring-modulith/reference/verification.html)。当前项目 Boot 3.5.15，若使用 Modulith，应验证 1.4 系列兼容矩阵，不直接引入面向 Boot4 的最新版。[兼容矩阵](https://docs.spring.io/spring-modulith/reference/appendix.html)。现有包需要先按业务域整理才能有效检查，不能加一个依赖就宣称完成模块化。

## 跨模块业务：由谁协调

| 场景 | 所有者/执行方式 | 失败处理 |
|---|---|---|
| PC 外呼 → 手机确认 → 通话回填 | communication-core 维护派发/通话状态机；终端走同一契约 | 幂等事件、状态比较更新、超时/撤销；PC 不模拟拨号 |
| 线索转客户 | 首期同一核心用例协调，显式调用客户公开应用 API，同一事务 | 禁止线索直接调用客户 Mapper；拆服务后变为可恢复工作流 |
| 通话完成 → AI 摘要 | 核心提交通话后发布 `CallCompleted.v1`，AI 异步消费 | AI 失败不回滚通话；重试/失败状态/人工重触发 |
| AI 建议 → 创建跟进 | 用户确认后由 followup 命令验证权限与版本 | AI 不直接写跟进表；重复命令用幂等键 |
| 客户详情汇总企微/通话/AI | 组合页面或只读 BFF/投影 | 单卡片降级；不让“详情页服务”掌握所有域写入 |

业务工作流放在拥有目标结果的应用层。例如“线索转化”由转化用例负责，而不是创建一个所有服务都依赖的全局业务总管。通知等旁路优先异步，强校验用同步调用；控制同步调用层级，避免调用链把服务重新耦合成整体。

跨进程事件与业务写入必须可靠衔接：同一事务写业务表与 outbox，发布器投递后记录完成；消费者用 eventId + tenantId 做 inbox/唯一键去重，接受至少一次交付，保留失败原因与重放工具。事件含版本、发生时间、聚合 ID、租户、关联 ID，不默认携带完整手机号/录音。不能只在内存中 `publishEvent` 后假设必达。[Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)。Modulith 的持久事件发布注册机制可服务单体内部可靠事件，跨进程仍需要选定传输与投递策略。[事件机制](https://docs.spring.io/spring-modulith/reference/events.html)。只有业务允许补偿的流程才使用 Saga；权限/数据归属的安全检查不能靠事后补偿。

## 发布、迁移、回滚

1. 模块 PR 声明修改的契约、迁移、依赖和数据所有者。CI 根据改动图构建该模块及受影响消费者测试，平台契约变更扩大测试范围。
2. 每个前端应用生成不可变版本静态资源，每个服务生成单独镜像与 SBOM。模块目录引用确切版本；先灰度工作区再调整默认版本，Shell 不需要每次重新构建。
3. 先发布兼容 API/新增列，再发布消费者；移除字段/列需确认所有旧版本退出。数据库迁移仅由所属服务的部署任务执行，多个副本不能同时自行变更表。
4. 服务健康检查通过再切网关；前端入口切换到新版本。日志/指标统一 correlationId，但禁止敏感内容；每个模块监测错误率、延迟、队列积压与契约失败。
5. 回滚镜像/前端目录版本。数据库采用 expand/contract，保留兼容字段；不可逆数据迁移不能宣称一键回滚。进行中的派发/队列由兼容旧流程继续收尾。
6. 客户侧可配置一个完整 Compose 包，但服务仍各自镜像/端口/迁移，可只 `up` 一个服务。将来 Electron 安装器与网页发布分开：Electron 只封装受控 Shell/native 能力，不能把所有业务远程代码耦合进一个安装包。

## 渐进落地次序与验收门槛

**第一步：边界清单与旧代码防火墙。** 保留当前 legacy 路径；为身份、权限、字典、文件定义最小端口，在 CallPhone 设置控制器外封装旧代码适配。冻结新增跨域实现依赖，既存违规生成基线，只允许减少。加入依赖与契约测试；没有验收必要不搬动无关开源模块。

**第二步：PC communication 试点。** 抽取其 API 客户端、业务视图、路由与必要基础组件，建立独立构建。Shell 通过平台接口装载，验证同账号工作区、权限、缓存页签、深链接与资源样式不污染。在与生产同类的静态网关环境测试装载失败与旧版回退，再选定运行时联邦机制。

**第三步：AI 作为第一独立后端业务。** 建独立入口/容器/迁移，订阅通话完成事件，消费 communication公开契约；落实 outbox/inbox 和故障可恢复性。发布 AI 不重新编译或重启 communication-core。企微/拓客按相同模板跟进。

**第四步：逐步替换 legacy 能力。** 网关按路径切换，既存 system/infra通过适配层使用；依据真实发布频率/事务边界再判断是否拆分 customer/outbound。不要先删完开源模块再发现平台启动依赖断裂。

独立部署完成必须同时满足：

- AI 业务只改自身代码，CI不生成/替换通信核心制品；旧版本核心与新版AI契约兼容测试通过。
- 关闭/故障AI后仍可配对、派发、拨号、保存结果、查询历史；AI入口显示明确降级。
- 新模块只能依赖公开契约/平台能力；循环依赖/跨域 Mapper 导入在CI失败。
- 跨服务消息重复、延迟、消费崩溃和重放均不会重复创建业务记录。
- 前端模块重新发布后，无需Shell重建，旧页签和刷新深链接可用，加载失败局部降级。
- 各模块有明确表所有者、权限、健康检查、迁移、回滚及负责人；只隐藏菜单不算可插拔验收。

此路线让后续新模块在明确边界内复用基础资源，既减少与旧代码牵连，也保留当前通信业务的稳定性。架构实现需要单独的 feature 分阶段落地；本轮按用户要求先完成方案与当前链路修复。
