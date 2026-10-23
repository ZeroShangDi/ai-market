# AI 模块契约

## 定位与本版取舍

| 项目 | 约定 |
|---|---|
| 状态 | v0.4：按前后端资源组织；backend 已实现，frontend 为资源预留，尚无前端制品 |
| 模块 | ai：AI 功能下与应用业务无关的多类型资源集合，可包含组件、页面、状态管理、后端服务及其他资源；由应用自行选择和组合，不等同于某个语言包或控制器实例 |
| 基础包 | chat、voice、work 相当于 SDK；模块仅调用其公开接口，不改包、不访问私有状态 |
| 应用 | 提供环境、身份鉴权、持久化适配、模型与终端连接，组合资源并增加业务流程；模块可提供通用页面；应用决定是否使用，负责产品路由、导航与业务实体 |
| 首期交付程度 | 初始化后可文字对话、开启/关闭完整连续语音、管理后台工作与待办；应用不用重写识别→聊天→播报流程 |
| 入口 | 各资源有独立入口；已实现 backend/src/main.py，前端资源后续使用 frontend/src/main 对应语言出口；模块根不设跨语言统一可执行入口 |
| 简化：保留 | 会话、语音、工作、配置、状态与销毁操作都有独立用途；保留 19 个必要方法，不合并成难以校验的通用 execute 命令 |
| 简化：移除 | 独立 policy 框架、扩展注册中心、热替换、重复组件表、额外包 ID 映射、模块操作日志框架；不再要求业务方提供 ownership 配置 |
| 简化：后置 | 持久汇报队列、自动结果播报、通用持久事件总线、角色管理系统、多端组件全集；有具体消费者后单独定契约 |
| 保留扩展 | 参数/函数注入、应用包装用例、状态订阅、AI 插件，以及组件 props/slots/events；不统一成一种万能钩子 |

## 模块目录与资源选择

| 位置 / 资源 | 职责与独立使用方式 | 当前状态 |
|---|---|---|
| README.md | 模块资源目录、各资源契约及变更记录；模块根不是 Python 工程根 | 已提供 |
| backend/pyproject.toml | 仅后端 Python 资源的依赖与构建配置；可独立安装、测试和发布 | 已提供；导入路径仍为 ai.main |
| backend/src/main.py | 后端会话、工作与语音控制服务；通过函数注入扩展，由宿主提供运行环境 | 已实现，19 方法及行为保持不变 |
| backend/tests/ | 后端资源及三个基础包的组合测试 | 23 项测试 |
| frontend/ | 前端资源所属目录；确定框架后在 src/ 下按需组织 components、pages、state 等，提供对应 main 入口与独立构建配置 | 仅预留目录，未选择框架或创建空 API |
| 权限申请与环境方法 | 可提供麦克风/摄像头等平台权限申请、权限状态查询、设备检查及资源释放方法；应用按需调用，模块处理可复用的技术流程，业务身份鉴权仍由应用提供 | 当前后端仅有 acquire/release 注入口；具体平台权限工具后续实现 |
| 通用方法与其他资源 | 尽可能提供 AI 功能可复用的非业务资源，包括工具方法、终端适配、媒体处理、静态素材等；不局限于前后端、组件或服务 | 按实际需要增加资源类型，不预建通用注册引擎 |
| 提供原则 | 优先把可复用的非业务能力沉淀为可选资源，减少各应用重复实现；提供不等于强制使用、自动申请权限或接管应用环境，应用决定调用与组合时机 | 尚未实现的资源明确标记，不以目录或接口占位冒充可用能力 |
| 资源依赖 | 必需依赖在各资源契约中明确；组件可接收数据/action，状态资源可注入客户端，后端注入基础包配置 | 依赖关系不要求应用使用整套模块资源 |
| 使用选择 | 应用可只调用后端、只使用组件或状态管理，也可直接组合模块通用页面；使用某项时满足其声明依赖即可 | 不强制模块整体初始化、安装或挂载 |
| 业务扩展 | 后端通过参数、函数及端口注入；组件/页面通过 props、slots、events/action；状态管理通过实例工厂、适配器和订阅扩展 | 不用一种扩展机制统管所有资源 |
| 业务边界 | 模块资源只表达通用 AI 功能；客户、订单、办公规则、宠物动作等产品流程由应用或业务插件提供 | 通用页面可以属于模块，产品特定页面由应用组合 |

## 资源与外部依赖

| 资源 | 模块负责 | 应用提供 |
|---|---|---|
| 会话 | 历史、发送、流式状态、取消及配置；持续消费底层流，不依赖页面保持消费 | 生成器、包存储适配、可信角色配置与模型凭据 |
| 语音控制器 | 采集、识别、聊天、分句播报、打断、关闭清理的完整闭环 | 终端连接及权限桥接、ASR/TTS 配置；日常调用者只开启/关闭 |
| 工作 | 创建、提交、续办、查询、停止、关闭、答复待办，跟随工作包事件更新视图 | SDK 配置、工具、存储、权限验证、产物发布服务 |
| AI 插件 | 将应用显式提供的工具映射传入对应基础包；插件可由应用绑定必要的公开 action | 工作控制、办公、记忆等业务能力的工具、技能与连接器；本版不实现这些插件 |
| 前端资源 | 可提供通用组件、页面、状态管理、交互控制及客户端适配；各自按需导出，应用可只取其中一项 | 选用资源并挂载，提供路由、主题、身份、通信适配、业务状态与业务展示逻辑；当前前端尚未实现 |
| 联网 | 能力检查及开关传递 | 生成器提供原生联网或搜索工具；不强制独立联网插件，不支持时明确拒绝开启 |
| 角色 | 使用已注入角色 ID 选择提示配置和音色 | 角色内容及适用规则；不做角色 CRUD、市场或权限体系 |
| 后续能力 | 不预建空接口 | 视频、长期记忆、情感陪伴和宠物业务在真实需求出现时扩展 |

## 后端资源：初始化与使用

| 入口 / 参数 | 契约 |
|---|---|
| create_ai | 异步便捷装配入口；返回下面方法表对应的 AI 实例，可只装配聊天或工作。当前交付 Python 用例与语音控制器；组件后续独立提供 |
| scope | 必需：应用提供的可信身份范围；实例内固定，不接受模型或页面随意指定用户身份 |
| services | 按所选能力注入 chat、work、voice 的工厂配置及模块存储适配；模块创建并拥有包实例；至少启用 chat 或 work，voice 必须依赖 chat，工作独立使用不要求聊天依赖 |
| authorize | 必需：异步 authorize(operation, target_ref)，身份由绑定实例提供；严格返回 True 才执行。应用可在其中组合权限及只读业务准入，不再另设 policy.check |
| config | 默认角色、联网、语音配置及有限超时/容量；可选能力无配置则不可用；具体基础限额沿用包配置 |
| plugins | 可选：显式能力绑定，复用包的注入口；初始化拒绝同一包内工具重名及对未启用包的绑定，不建设插件扫描、下载或动态注册系统 |
| prepare_turn | 可选：生成前读取应用业务上下文的单个异步函数，详见扩展表；静态角色无需使用此入口 |
| 初始化结果 | 返回 AI 实例，通过 get_state / subscribe 读取可用能力及初始状态；配置不合法则失败并清理已创建资源。缺失可选服务不妨碍其他能力；不自动录音、不发送模型请求 |
| 所有权 | 模块释放自己创建的实例、任务和订阅；注入的共享连接/存储服务由宿主释放，固定约定，无额外 ownership 参数 |
| 跨进程 | 客户端桥接负责鉴权、传输与终端通道；本契约不顺带承诺实现 HTTP/WebRTC 服务，应用装配后按钮无需再处理媒体接线 |

## 后端资源：对外操作

| 资源 | 方法 | 输入 | 返回与行为 |
|---|---|---|---|
| 会话 | create_conversation | title、role_id? | Conversation；创建不启动音频 |
| 会话 | list_conversations | 无 | 会话摘要列表；首期全量，宿主控制会话数量与查询权限 |
| 会话 | get_conversation | conversation_id | 消息、当前生成、配置与关联工作摘要 |
| 会话 | delete_conversation | conversation_id | 停止该会话语音/聊天，删除聊天及关联；工作独立保留，重复删除成功 |
| 对话 | send_message | conversation_id、text?、retry=False | GenerationReceipt；接纳后后台消费生成流；重试不传 text，替换末轮回复；不等于模型已完成 |
| 对话 | cancel_reply | conversation_id、generation_id | 指定回复的停止结果；同时停相关播报，不取消后台工作 |
| 语音 | start_voice | conversation_id? | VoiceState；不传时使用本实例当前语音会话，没有则创建默认会话并返回 ID；成功代表采集已就绪 |
| 语音 | stop_voice | 无 | 停采集、识别、当前语音生成和播报并等待资源清理；保留会话以供下次开启，重复关闭成功 |
| 工作 | create_work | title、conversation_id? | 工作会话；可独立创建，创建不执行 |
| 工作 | list_work | conversation_id? | 工作摘要列表，可按关联过滤 |
| 工作 | get_work | work_id | 轮次、部分正文、待办和产物引用 |
| 工作 | submit_work | work_id、prompt、resources?、resume=True | RunReceipt；后台执行/显式续办；忙碌拒绝，resume=False 新开模型上下文但保留历史 |
| 工作 | cancel_work | work_id、run_id | Run；按包契约区分确认停止与结果未知 |
| 工作 | close_work | work_id | 永久关闭新提交、停止当前执行、保留历史 |
| 工作 | respond_interaction | work_id、run_id、interaction_id、answer、response_ref | 已验证答复；相同待办使用同一服务端权限和输入绑定，语音不绕过验证 |
| 配置 | configure | conversation_id；role_id?、network_enabled?、voice_id?、rate?、volume?、muted? | EffectiveConfig；仅允许列出的字段，不透传任意 SDK 参数；一次只提交一种配置项，避免跨包原子更新承诺 |
| 状态 | get_state | 无 | 实例能力、语音状态、活动生成、待办计数、错误状态；不含全部历史 |
| 状态 | subscribe | listener | unsubscribe；立即快照及后续事件；取消订阅不停止生成或工作 |
| 生命周期 | dispose | 无 | 阻止新命令、停止拥有的语音/聊天/工作、解绑订阅；返回未确认停止项，保留持久数据，重复调用成功 |
| 计数 | 1 个便捷初始化入口 + 19 个方法 | 按资源分组，不要求应用全部使用 | 纯语音调用仍为初始化、开启、关闭；组件不依赖整个实例，接收所需 action 即可 |

## 业务扩展：只保留真实入口

| 资源 | 扩展方式 | 输入 / 输出 | 时机与失败规则 |
|---|---|---|---|
| 方法 | 声明参数 + 应用包装用例 | 公开 DTO / 回执 | 应用加前后业务步骤；后置失败不能当作模块已成功步骤回滚，也不能自动重做 |
| 准入 | authorize 函数 | operation、target_ref → bool | 命令副作用前 await；工具在实际执行前独立鉴权；拒绝/异常/超时不放行 |
| 自动语音轮次 | prepare_turn 函数 | conversation_id、text、role_id、取消信号 → {summary:string} | 文字和语音每轮都调用；只读业务上下文，经生成器配置注入口传入；无提供者则空摘要，失败不发起生成，不改用户原文或历史 |
| 模型能力 | generator + plugins 注入 | 包公开生成/工具契约 | 生成器解释 summary、角色和联网开关；不支持必需行为则初始化拒绝；业务工具通过插件实现 |
| 状态 | subscribe | 只读事件 → 无返回值 | 非持久观察，回调异常隔离；不能用于必须成功的扣费、写业务记录或必达汇报 |
| 组件 | props、slots、events 或 action | 最小展示数据及用户意图 | 应用替换局部展示或包装 action；同一点击只由 action 或事件接收者之一执行操作 |
| 环境 | 具名适配器注入 | 包/模块声明的端口 | 存储、终端、身份等在装配时提供，不能任意访问内部实体；不热替换正在执行的依赖 |
| 共同约束 | 异步扩展有有限时限并响应取消 | 仅传必要上下文 | 等待后重新检查目标状态；迟到结果丢弃。资源释放不被业务准入拒绝，资源操作仍限已认证实例范围 |

## 必须保持的行为

| 场景 | 约定 |
|---|---|
| 语音开启 | 控制器通过桥接申请权限、建立终端；拒绝权限明确失败；启动失败释放设备；浏览器手势约束由点击入口满足 |
| 并发 | 每实例一个语音通道，每会话一个活动生成；重复开启同会话复用，切到另一会话返回 VOICE_BUSY；文字遇忙返回 CHAT_BUSY |
| 语音打断 | 新开口立即停播并取消旧回复；模块维护 generation、speech_id、seq 和分句；旧识别、文本和音频不得污染新轮次 |
| 音频故障 | ASR 失败不发送空消息；TTS 失败保留文字；采集失败清理通道；停止语音不停止独立工作 |
| 配置生效 | 角色/音色在会话无活动回复且语音关闭时切换；联网下一轮生效；音量/静音作用于当前语音会话；已提交工作配置不随之变化 |
| 配置失败 | 不承诺数据库与设备原子提交；持久化失败保留故障并核对，设备更新失败返回错误及实际状态，不虚报整项成功 |
| 联网 | 生成器必须能遵守开关才能声明支持；开关不控制宿主全部网络，也不自动赋予工具权限 |
| 工作状态 | 模块消费 work.stream_events；游标过期时取快照。包执行成功不等于用户业务目标完成 |
| 工作结果 | 首期提供可查工作结果及 work_changed 观察事件；自动总结、主动播报、必达通知由后续工作控制插件契约定义，本版不承诺 |
| 审批 | 用户答复仍由应用提供的 verify_response 核验；停止、重启或过期的待办不能继续放行 |
| 恢复 | 恢复持久历史和关联，不自动录音，不重放模型/工具，不复用旧审批；工作续办须显式提交；恢复时仍使用原包的进程中断/待办过期语义 |
| 销毁 | 页面卸载只释放自己的订阅；实例拥有者调用 dispose 才停止其运行；身份切换销毁或解绑旧实例，禁止旧响应进入新身份 |

## 数据、存储与失败边界

| 项目 | 契约 |
|---|---|
| ID | 直接沿用包生成的 conversation_id / work session_id / run_id；work_id 是工作会话 ID 的公开名称，不另建转换层；ID 不代替授权 |
| 包数据 | 由各包唯一写入；模块不修改包快照，不向 chat 私有历史塞任务通知 |
| 模块数据 | 仅会话配置及工作→聊天关联；模块存储端口为 load_all / save_conversation_config / delete_conversation_config / set_work_conversation，按可信身份隔离，单次写入原子；未配置正式存储时只能显式选 memory |
| 关联失败 | 包创建成功但关联写入失败时返回 OUTCOME_UNKNOWN 及已创建 ID，不再次创建；模块通过公开列表核对孤立记录，无配置的旧会话使用默认值，无关联的工作作为独立工作；首期无跨存储事务 |
| 删除失败 | 包删除与模块配置清理分别核对，重复删除可继续清理；不删除关联工作的本体 |
| 主要 DTO | ConversationView：id/title/messages/generation/config/work_summaries；WorkView：沿用包的只读视图；GenerationReceipt：conversation_id/generation_id/status；不暴露密钥或 SDK 私有恢复状态 |
| AIState | instance_id、revision、capabilities、voice、active_replies、pending_count、error；VoiceState 用 capture 与 playback 两个状态维度，避免将同时监听/播报压成互斥状态 |
| 事件 | snapshot、reply_delta、reply_finished、voice_changed、work_changed、error；外层为 type/instance_id/revision/data；实体 ID 在 data 中，包事件结构原样保留；待办通过 work_changed 更新，无额外总线 |
| 重连 | subscribe 非持久、不保证必达；断线后重新查询状态及详情，revision 只在当前实例有效 |
| 成功与未知 | 返回接纳回执、生成完成、远端停止是不同结果；存储故障或超时后的副作用可能未知，禁止自动重试 send/submit |
| 错误 | AIError.as_dict() 返回 code、operation、refs（关联 ID）、outcome:rejected/failed/unknown；沿用包错误语义，新增 DISPOSED、CAPABILITY_UNSUPPORTED、PERMISSION_DENIED、VOICE_BUSY、OUTCOME_UNKNOWN；不泄漏原始异常 |

## 可选前端资源：按首个应用需要交付

| 组件 | 属性 / 插槽 | 操作与边界 |
|---|---|---|
| VoiceToggle | state、disabled；icon/label 插槽 | start/stop action；封装加载与重复点击，应用可包装 action；卸载不销毁共享控制器 |
| AIStatus | 只读状态；icon/label 插槽 | 仅展示，不内建宠物动作选择 |
| MessageList | messages、generation；内容/操作/空态插槽 | 发出重试/取消意图，应用调用方法 |
| WorkStatus | work_view；摘要/产物/操作插槽 | 发出查看/停止/续办意图，应用处理导航 |
| InteractionPrompt | interaction、answer_action、submitting/error；问题/详情插槽 | 服务端接纳后才显示答复成功，展示插槽不决定授权 |
| 通用页面 | 会话页、工作详情页等候选；组件、数据和 action 可替换 | 应用可整体挂载、局部复用或完全不用；不固定产品路由、业务实体与导航 |
| 状态管理 | 实例级状态、订阅、加载/错误/交互状态及释放入口 | 可供自有页面使用，不强制绑定模块组件；不使用跨用户全局单例，不代替后端持久状态 |
| 交付约束 | 候选清单，不要求首期全部实现 | 框架确定后交付 frontend 资源；本次仅重组已实现后端并预留前端位置，没有新增页面或组件代码 |

## 验证与变更记录

| 项目 | 结果 / 要求 |
|---|---|
| 过度设计检查 | 原版有重复扩展表、策略与鉴权职责重叠、没有消费者的通知基础设施；本版已合并或后置，必要业务扩展仍保留 |
| 下一步 | 由首个应用注入真实模型、终端和身份范围；客户端桥接与可选 UI 根据应用技术选型交付 |
| 核心验收 | 文字/语音共用对话路径；只开启/关闭可连续对话；打断、权限拒绝、存储故障、身份隔离、恢复及销毁可验证 |
| 真实验收 | 包测试不代替真实模型、终端发声和 SDK 恢复验证；外部环境未就绪时明确记录未验证项 |
| 2026-10-23 v0.1 | 初稿定义统一 AI 资源、19 方法及分类扩展；均未实现 |
| 2026-10-23 v0.2 | 精简为资源边界、初始化、操作、必要扩展及失败语义；去除通用策略框架和过早持久汇报承诺，保留可选固定组件与完整语音闭环；基础包未修改 |
| 2026-10-23 v0.3 | 实现 src/main.py 装配入口及 19 个方法，组合现有 chat/work/voice 公开 API；支持外部准入、角色/上下文/联网开关、独立工作、待办验证、元数据存储和连续语音；23 项组合测试通过，三个基础包未修改 |
| 2026-10-23 v0.4 | 将 Python 工程整体迁至 backend/，保留 ai.main 与既有行为；预留 frontend/，明确组件、页面、状态管理、后端服务等资源独立交付与按需使用；三个基础包未修改；补充平台权限申请、环境检查和通用工具方法等可选非业务资源的提供原则，具体平台实现后续处理 |

## 后端资源：已实现的装配参数

| 参数 | 类型 / 默认值 | 说明 |
|---|---|---|
| Python / 导入 | Python ≥3.10；ai.main | 公开导出 create_ai、AI、AIError、MetadataStore、MemoryMetadata；安装同仓对应基础包和 modules/ai/backend 后使用后端资源，无私有包导入；backend/pyproject.toml 只描述后端制品，不代表整个模块 |
| scope | 非空 string，必需 | 可信身份范围标识；不会替存储自动添加租户过滤，所有包存储、元数据、生成器和鉴权函数必须由宿主按同一范围绑定；每范围一个活跃写实例 |
| services.chat | dict，可选 | create_chat 的关键字配置，增加 capabilities；generator 必需，store 为宿主存储 |
| chat.capabilities | dict，默认空 | network/context/roles 三个布尔声明；声明必须真实实现。prepare_turn 需要 context，非空角色 chat_config 需要 roles，开启联网需要 network |
| services.work | dict，可选 | 原样接收 create_work 配置；mode、sdk_options、executor、verify_response、publish_artifact、store 等沿用工作包契约；密钥不进入公开状态 |
| services.voice | dict，可选 | create_voice 的关键字配置（provider、audio_terminal、limits 等）；额外 acquire/release 为成对异步函数，无参数。acquire 获取终端权限/资源，失败须自行收回未交付资源；release 释放成功交付的桥接资源，两者受 extension_timeout 限制 |
| services.storage | MetadataStore | load_all 返回 conversations（会话 ID→EffectiveConfig）、links（工作 ID→会话 ID）；其余三个写方法见接口源码。与包数据分开持久化，不共享私有历史结构 |
| services.memory | bool，默认 False | 只有显式 True 才允许省略任一存储；模块元数据使用 MemoryMetadata，包存储由原包内存实现；仅适合无需持久化的场景 |
| config | dict，默认空 | 仅 roles/default_role/network_enabled/extension_timeout；未知字段拒绝 |
| config.roles | dict，默认 default→空配置 | 角色 ID→chat_config/voice_id；chat_config 是可信生成器配置，voice_id 必须来自注入语音服务的公开音色列表 |
| config.default_role | string，默认 default | 必须存在于 roles；切换角色同时应用该角色音色，无指定音色则使用部署列表首项 |
| config.network_enabled | bool，默认 False | 新会话默认开关；由生成器解释，每轮配置覆盖基础默认配置 |
| config.extension_timeout | 正有限 number，默认 10 秒 | authorize、prepare_turn、acquire/release 时限；宿主异步实现必须合作响应取消，不能强行终止阻塞的第三方代码 |
| plugins | dict，默认空 | chat/work→工具名称映射；与对应 services 内 plugins 合并，同包名称冲突拒绝。宿主插件闭包绑定所需公开方法，模块不隐式授予整个实例或身份 |
| prepare_turn | async callable，可选 | 与上表一致；返回的 summary、角色 chat_config、network_enabled 合入 chat GenerationInput.config；业务正文只供被授权生成器处理，不作为身份凭据 |
| authorize | async callable，必需 | 接收 operation、target_ref；operation 为方法名；target_ref 仅含该操作的相关 conversation_id/work_id/run_id/interaction_id/field。列表及 get_state 的空目标表示当前可信范围的整体授权 |
| subscribe 权限 | 可信实例持有者 | 同步方法不执行异步 authorize；宿主必须先授权取得此实例和订阅通道。不要把实例直接交给未认证页面或模型 |
| 清理例外 | cancel_reply/cancel_work/stop_voice/dispose | 不调用可选业务准入，以免权限变化阻止释放；只能操作当前实例绑定存储内的实体 |
| EffectiveConfig | role_id/network_enabled/voice_id/rate/volume/muted | 新会话 rate=1、volume=1、muted=False；无语音服务时 voice_id=null。rate 范围 0.25–4、volume 范围 0–1；通过 configure 每次改一项 |
| 恢复失败 | INVALID_STORAGE / 包错误 | 角色、音色或联网能力与存储配置不兼容时初始化拒绝；宿主明确迁移数据后重建，不静默换角色或降级 |
| 存储故障 | 冻结新写入、保留查询与清理 | OUTCOME_UNKNOWN 或 STORAGE_FAILED 后重新核对持久数据并重建实例；删除的幂等补清理在完成核对的新实例中执行，不能在冻结实例盲重试 |
| 销毁返回 | disposed:True、unconfirmed:引用列表 | 中断状态或停止未确认的工作保留引用；已完成远端副作用不回滚。宿主仍需核对未确认项；不关闭借用的数据库/HTTP 连接 |

## 本版验证范围

| 项目 | 证据 / 边界 |
|---|---|
| 自动验证 | backend/tests/test_ai.py，23 项 unittest；真实组合三个包公开 API，生成器/工作执行器/音频设备/语音提供者使用可控适配器 |
| 文字与扩展 | 无订阅继续生成、历史原文保留、上下文与角色/联网传递、忙碌拒绝、精确取消、订阅隔离、身份实例隔离 |
| 工作与恢复 | 工作独立装配、跨实例恢复快照与关联、删除聊天保留工作、游标过期取快照、人工答复验证、远端停止未确认上报 |
| 语音组合 | PCM 输入→真实 voice 分段/识别流程→chat→分句合成→音频适配器；连续开启关闭、打断、采集故障释放、权限失败、静音/音量配置、删除后默认重开 |
| 存储与销毁 | 元数据失败返回已创建 ID 并冻结、生成中包存储故障可观察、无效恢复配置拒绝、销毁取消尚未完成的上下文读取；存储替身验证契约，未验收生产数据库 |
| 测试执行 | 安装所需基础包依赖后，在仓库根运行 python -B -m unittest discover -s next/modules/ai/backend/tests -v；测试通过公开包命名空间加载本仓源码，不写入包目录 |
| 尚未验收 | 真实麦克风/扬声器、云端 ASR/TTS/联网、真实 SDK 和凭据、生产存储及多端传输；本版不含 UI/HTTP/WebRTC 宿主实现 |
