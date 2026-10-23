# 工作包

## 定位与聊天区别

| 项目 | 工作包 | 聊天包 |
|---|---|---|
| 入口 | Python ≥ 3.10；src/main.py，安装后 work.main | chat.main |
| 对外方法 | 8 个：新建、列表、读取、执行/续办、停止、关闭、答复待办、事件流 | 6 个：新建、列表、读取、发送、停止、删除 |
| 执行方式 | submit 立即返回运行回执，后台执行；无需消费事件维持运行 | send_message 返回有背压的文本事件流 |
| 读取结果 | get_session 读取全部轮次、进度、结果、待办和产物引用 | get_conversation 读取消息及最新生成状态 |
| 人工交互 | 支持审批和提问；验证外部用户答复后才解除等待 | 不内建工作审批 |
| 续办 | submit 创建新轮次，保留旧结果；当前执行中拒绝新提交 | send_message 支持末轮重试 |
| 结束 | close_session 永久关闭新提交，停止活动轮次，保留历史 | delete_conversation 删除历史 |
| 持久化 | 外部 store 决定保存位置；未注入则仅内存 | 同样可注入存储 |
| 外部职责 | SDK、模型、技能、工具权限、隔离环境、文件发布和凭据由宿主提供 | 生成器、联网、技能和身份由宿主提供 |
| 范围 | 提供 OpenAI Agents SDK / Claude Agent SDK 适配器；不修改旧工程或聊天/语音源码 | 当前聊天实现独立保留 |

## 初始化注入口

| create_work 参数 | 类型 / 默认 | 契约 |
|---|---|---|
| mode | openai / claude / custom | 创建时选择 SDK；省略 mode 并传 executor 兼容原自定义模式 |
| executor | Executor / None | 仅 custom 模式注入；与 openai/claude mode 互斥 |
| sdk_options | dict / None | SDK 模式固定配置，字段见下表；不由 submit.options 覆盖，防止每轮绕过工具边界 |
| store | WorkStore / None | 异步 load_all() 和 save(session)，保存完整会话；不传则仅内存 |
| plugins | Mapping / 空 | 传给执行器的外部技能/工具句柄；包不发现、安装或管理业务能力 |
| config | JSON dict / 空 | 外部模型、角色或执行配置；每轮复制，options 可覆盖；宿主不能让不可信输入覆盖授权策略 |
| verify_response | 异步函数 / None | 接收 session_id、run_id、interaction、answer、response_ref；严格返回 True 才接纳答复；必须核验用户身份、当前待办、实际输入及授权证据 |
| publish_artifact | 异步函数 / None | 接收 session_id、run_id、artifact 描述；宿主验证并发布文件，返回含字符串 id 的 JSON 元数据；没有注入口则拒绝发布 |
| timeout | 秒 / 600 | 整轮执行时限，包含等待用户答复；超时请求适配器停止 |
| interaction_timeout | 秒 / 300 | 单个待办时限，到期失效；不能默认批准 |
| cancel_timeout | 秒 / 10 | 等待适配器确认远端停止的时限；超时视为未确认 |
| max_items | 正整数 / 1000 | 每会话轮次、活动条目、待办、产物分别的数量上限；事件为滚动保留上限，不因慢订阅阻塞执行 |
| max_chars | 正整数 / 32000 | 标题、单轮提示词、累计流式文本、最终结果、单条进度及问题答复的字符上限 |
| 返回 | Work | 一个可信身份独立实例，同一 asyncio 循环使用；除 stream_events 使用 async for 外，公开方法需 await |

## 八个实例方法

| 方法 | 输入 | 返回 | 行为 |
|---|---|---|---|
| create_session | title='新工作' | Session | 保存空会话后返回，不启动工作 |
| list_sessions | 无 | list[{id,title,status,run_status}] | 按创建顺序列出本实例会话，包含已关闭会话 |
| get_session | session_id | Session + storage_error | 返回独立快照，集中读取轮次、进度、待办与产物；当前不分页；事件通过 stream_events 订阅 |
| submit | session_id、prompt；resources=None、options=None、resume=True 为关键字参数 | Run | 初次执行与续办共用；resume=True 使用已有恢复状态；False 清除恢复状态并仅使用本次输入，保留历史展示；保存运行记录后返回，在后台执行；同会话已有执行则 WORK_BUSY，不隐式排队 |
| cancel_run | session_id、run_id | Run | 仅针对指定轮次；已结束则返回原状态，旧轮次停止不会影响新轮次；适配器确认停止才 cancelled |
| close_session | session_id | Session | 关闭会话并停止当前执行，重复关闭成功；保留历史，后续 submit 返回 SESSION_CLOSED |
| respond_interaction | session_id、run_id、interaction_id、answer；response_ref 必填关键字参数 | Interaction | 外部验证通过后重新检查待办有效性，先保存答复再解除等待；重复相同答复返回原记录，不同答复冲突 |
| stream_events | session_id、run_id；after=0 为会话事件游标 | AsyncIterator[Event] | 重放游标之后的已提交事件并跟随该轮；终态事件消费后结束；断开不取消后台任务 |

## 数据结构

| 类型 | 字段 |
|---|---|
| Session | id、title、mode、status:open/closed、runs[]、interactions[]、activity[]、artifacts[]、events[]、event_sequence；不返回私有 _recovery |
| Run | id、prompt、resources[]、status:running/waiting/cancelling/succeeded/failed/cancelled/interrupted、content、error_code:null 或错误码 |
| Interaction | id、run_id、kind:approval/question、detail、input_digest、expires_at、status:pending/answered/expired、answer:null 或答复 |
| detail | 外部提供的 JSON 对象；审批应含确切工具和输入，提问应含问题文本；包计算摘要并冻结副本，不能修改已展示的待办来批准另一个操作 |
| expires_at | Unix 秒；服务端时间用于有效期判断 |
| 审批答复 | 仅 {approved:boolean}；False 拒绝当前操作，是否继续其他方案由执行器决定 |
| 提问答复 | 仅 {text:非空字符串}；本版不做多问题表单映射 |
| Event | sequence（会话递增）、run_id、type、data；events 仅保留最近 max_items 条 |
| Activity | sequence、run_id、text；序号在会话内递增，保存后可通过 get_session 读取 |
| Artifact | 宿主返回的 JSON 元数据，至少 id:string；包附加 run_id；宿主负责文件存储、访问授权与下载，不暴露服务器路径或凭据 |
| storage_error | get_session 附加字段；存储出错后为 STORAGE_FAILED，避免把本地状态误认为已持久成功 |

## 统一 SDK 适配契约

| 入口 / 字段 | 约定 |
|---|---|
| executor.run(context) | 异步返回 {content:string}；必须等当前工具工作全部结束再返回，业务失败必须抛异常；不得用仍运行的后台进程冒充成功 |
| executor.cancel(session_id, run_id) | 异步幂等停止远端执行；True 为确认停止，False 或异常/超时表示未知；不得把断开连接当作远端停机 |
| context | session_id、run_id、prompt、history（此前轮次快照）、resources、plugins、config、cancelled 、recovery（私有恢复快照）、resume 及下列异步回调 |
| context.emit(text) | 保存进度，不等待 UI 观察者；超过条目/字符上限拒绝 |
| context.delta(text) | 原子保存部分正文和 text_delta 事件；中断后保留部分正文；最终成功结果替换正文 |
| context.checkpoint(state) | 保存 JSON dict 恢复状态；大小上限为 max_chars × max_items（JSON 序列化字符数）；不推送到公开事件或公开会话 |
| context.ask(kind, detail) | 保存待办并暂停等待；返回已验证 answer。一个会话同时只允许一个待办；缺失 verify_response 返回 CAPABILITY_UNSUPPORTED |
| context.publish(artifact) | 调用宿主发布函数并保存返回元数据；缺失 publish_artifact 返回 CAPABILITY_UNSUPPORTED |
| SDK 一致性 | 不要求第三方 SDK 本身提供同名 API，由适配器实现一致语义；SDK 私有恢复格式由适配器管理，经 _recovery 随宿主快照保存，不作为公开 DTO |
| 技能与权限 | 技能调用、隔离沙箱、资源授权及工具调用前的权限判定由外部执行器/宿主承担；需要人工批准时必须使用 ask，并严格执行答复；包不能约束绕过契约的恶意适配器 |
| 回调隔离 | 运行完成或取消后回调返回 STALE_RUN，禁止迟到输出污染后续轮次；外部发布已经产生的效果不能由包撤销 |
| 生命周期 | 执行器必须传播任务取消并及时清理资源；不得吞掉 CancelledError。包不承诺强制杀死忽略取消的第三方代码；宿主负责进程隔离及退出收尾 |
| 供应商选择 | mode 选择对应适配器；外部提供凭据并核实适用条款，统一接口不能消除供应商使用限制 |

## 存储、状态及失败语义

| 事项 | 约定 |
|---|---|
| WorkStore.load_all() | 返回当前身份范围全部 Session 的独立 JSON 快照，按创建顺序；首次公开方法调用时加载 |
| WorkStore.save(session) | 原子新增/替换完整快照，返回代表持久提交；数据库连接、目录、加密、备份、超时和授权全部由宿主实现 |
| 存储所有权 | 同一存储范围只允许一个活跃 Work 写者；不支持跨进程并发写或自动热刷新；包在实例内串行提交状态 |
| 正常执行 | running → succeeded/failed；需要答复时 running → waiting → running |
| 停止 | running/waiting → cancelling → cancelled；远端停止未知则 interrupted / STOP_UNCONFIRMED；任务启动前取消可直接 cancelled |
| 完成竞态 | 已进入最终提交的执行允许先完成；迟到停止不覆盖已完成状态 |
| 关闭 | 先持久化 closed 拒绝后续提交，再停止活动轮次；关闭不删除历史、不撤销已经产生的业务效果 |
| 恢复 | 遗留 running/waiting/cancelling 转 interrupted / PROCESS_INTERRUPTED；pending 待办转 expired；不自动重跑、不重用旧批准 |
| 审批竞态 | 验证在锁外执行，返回后再次检查当前运行、待办和过期时间；取消或过期后无法通过迟到答复放行工具 |
| 存储故障 | STORAGE_FAILED；阻止后续写入。最终保存失败时本地显示 interrupted，宿主核对存储后重建实例；不把异常后的不确定提交自动重试 |
| 失败输出 | SDK 原始异常不外泄，映射 EXECUTOR_FAILED；只有返回有效最终结果且保存成功才显示 succeeded |
| 效果边界 | cancelled 仅确认停止后续执行；已发生文件写入、业务写入和模型费用不会自动撤销。interrupted 意味着需要外部核对 |
| 当前限制 | 后台指宿主进程存活期间，与页面观察解耦；不是跨进程任务服务。支持有界事件重放及下述 SDK 恢复；无队列、自动重试、Outbox、请求幂等或分页；宿主负责总体存储/资源容量限制 |
| 主要错误 | VALIDATION_ERROR、NOT_FOUND、WORK_BUSY、SESSION_CLOSED、STALE_RUN、INTERACTION_BUSY、INTERACTION_EXPIRED、ANSWER_CONFLICT、RESPONSE_REJECTED、CAPABILITY_UNSUPPORTED、LIMIT_EXCEEDED、INVALID_EXECUTOR_OUTPUT、EXECUTOR_FAILED、DEADLINE_EXCEEDED、STOP_UNCONFIRMED、STORAGE_FAILED |

## 验证与变更日志

| 项目 | 记录 |
|---|---|
| 测试命令 | 包目录安装 SDK extras 后执行 python -m unittest discover -s tests -v；未装 SDK 时对应测试会跳过 |
| 已验证 | 原有 25 项通过（此前安装 SDK extras 后无跳过）：后台续办、注入、忙碌、审批校验/拒绝/重放、提问过期、取消与审批竞态、立即停止、未知停止、产物、身份与迟到回调隔离、文件存储恢复和失败 |
| 未验证 | 付费模型请求、真实业务工具与产物发布、生产数据库及跨进程隔离；测试模型传输与授权为替身，文件适配器实际写入临时文件 |
| 2026-10-23 | 将 16 方法草案替换为七方法 Python 实现；工厂注入执行器、存储、插件、配置、用户答复验证和产物发布能力；未引入数据库；初版执行器由外部注入 |


## SDK 模式与配置

| 事项 | 约定 |
|---|---|
| openai | 使用 openai-agents 0.24.0 的 Agent、Runner、FunctionTool；通过宿主环境 OPENAI_API_KEY 提供凭据 |
| claude | 使用 claude-agent-sdk 0.2.173 的 ClaudeSDKClient 和 SDK MCP 工具；认证由官方 SDK 支持的宿主环境提供，包不读取或保存密钥 |
| 安装 | 包目录安装 .[openai]、.[claude] 或 .[sdk] 对应 extras；只安装所需 SDK；缺少依赖时报 SDK_UNAVAILABLE |
| 共同 sdk_options | model：供应商模型标识（不指定则采用 SDK 默认）；instructions：系统指令；max_turns：正整数，默认 20 |
| OpenAI 模型注入 | model 也可传官方 SDK Model 对象，由宿主提供自定义模型或离线测试模型；不保存到会话 |
| Claude 专属 sdk_options | cwd：专用运行目录；cli_path：可选 CLI 路径；SDK 可能写入自身运行数据，生产应由宿主配置隔离目录与生命周期 |
| options 和 config | 仍传给插件工具上下文；SDK 运行选项仅来自工厂 sdk_options，不允许透传任意 SDK 参数 |
| 模式隔离 | 会话保存 mode；加载不同 mode 的存储返回 EXECUTOR_MODE_MISMATCH；旧无 mode 数据按 custom 处理，不能静默改供应商继续 |
| 续办策略 | OpenAI 保存完整 SDK 输入项及已完成工具调用/结果；Claude 保存 native session_id 并传 resume；没有恢复数据的旧会话首次采用通用历史；资源仍传引用 |
| 结果判定 | OpenAI 使用 final_output 文本；Claude 仅接纳 success 且非 is_error 的 ResultMessage；错误/空协议流不得冒充成功 |
| 停止语义 | 取消本地 SDK 运行；Claude 同时发 interrupt 并释放客户端。远端效果无法确证停止时返回 interrupted / STOP_UNCONFIRMED，不保证停止计费 |
| 工具范围 | 两种 SDK 都只接入宿主声明的 WorkTool；未提供工具时只能生成文本。Claude 原生文件、命令工具及隐式配置加载禁用；需这些能力时由宿主显式提供受控工具 |
| 可观测性 | OpenAI run_streamed 和 Claude include_partial_messages 输出 text_delta；开始和工具活动、状态、待办、产物均可观察；默认关闭 OpenAI tracing，不透传原始供应商事件 |

## 统一工具注入

| WorkTool 字段 / 行为 | 约定 |
|---|---|
| plugins | 名称 → WorkTool；SDK 模式要求此类型，custom 模式仍可传自定义句柄 |
| description | 工具说明文本 |
| schema | type=object 的 JSON Schema；工厂复制 schema；调用前校验参数，不支持远端 schema 引用 |
| invoke(arguments, context) | 宿主异步工具函数，返回 JSON 兼容结果；context 可 emit、ask 或 publish，授权与资源隔离仍由宿主实现 |
| requires_approval | 默认 True，调用前经工作待办和 verify_response 放行；False 仅供宿主已授权工具使用 |
| 审批一致性 | 两种适配器都先校验参数，再绑定工具名、调用 ID 与完整输入创建待办；拒绝返回 TOOL_DENIED，不调用宿主函数 |
| 并发工具 | 同轮工具串行执行，避免同时出现多条人工待办；取消后拒绝继续调用 |
| 技能/产物 | 技能可封装成 WorkTool，工具按需调用 context.publish；包不自动把任意 SDK 工作目录文件发布给用户 |
| 新错误 | INVALID_MODE、INVALID_SDK_OPTIONS、SDK_UNAVAILABLE、EXECUTOR_MODE_MISMATCH、INVALID_TOOL、INVALID_TOOL_INPUT |

## 官方接口依据

| 来源 | 使用范围 |
|---|---|
| [OpenAI Agents SDK quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart?lang=python) | Agent、Runner 与函数工具接入 |
| [Claude Agent SDK Python reference](https://code.claude.com/docs/en/agent-sdk/python) | 客户端、MCP 工具、权限回调、结果及中断 |

## SDK 接入变更

| 日期 | 变化 |
|---|---|
| 2026-10-23 | 工厂新增 openai / claude mode，保留 custom；统一 WorkTool、审批边界、历史转换和模式存储校验，七个业务方法不变 |


## SDK 验证记录

| 项目 | 结果 |
|---|---|
| 环境 | Python 3.12，openai-agents 0.24.0，claude-agent-sdk 0.2.173；直接依赖在 extras 锁定 |
| OpenAI | 实际 Agent/FunctionTool 类型及实际 Runner + 离线 Model 跑通；审批、拒绝、历史、参数校验与取消通过 |
| Claude | 官方源码发行包安装；真实 Options、MCP 注册和 ResultMessage，客户端传输用替身验证；CLI/云端执行尚未验证 |
| 验证边界 | 未发送真实付费模型请求；实际宿主需配置凭据、运行目录并完成真实工具验收 |


## 实例连接配置

| sdk_options 字段 | 约定 |
|---|---|
| api_key | 可选非空字符串，仅保存在适配器内；不写会话、进度或插件 config，不修改进程环境 |
| base_url | 可选 HTTP(S) 服务地址，禁止 URL 凭据、查询串和片段；显式设置时必须同时传 api_key 和 model，避免把环境密钥发送到其他服务 |
| model | 显式 key/base_url 或 chat_completions 模式时必须提供模型名；由调用者选择，不硬编码供应商模型 |
| api（OpenAI） | responses（默认）或 chat_completions；兼容服务按实际支持的协议选择；每轮独立 AsyncOpenAI 客户端，结束、异常及取消均释放 |
| auth_type（Claude） | api_key（默认）或 auth_token；分别映射 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN，同时清空另一项及 OAuth token；显式配置默认固定官方地址 |
| Claude 模型映射 | 同时设置主模型及 Sonnet/Opus/Haiku/小模型变量，防止兼容端点收到默认 Claude 模型名；映射只传入子进程环境 |
| DS 接入方式 | 外部传 Claude mode、DS 的兼容地址、key、model，并选择 auth_token；包内没有 DS 专属分支。实际兼容性及服务条款仍由接入方验证 |
| 凭据来源 | 不传 api_key 时维持 SDK 原有环境认证；需要多实例凭据隔离时显式传入各自配置 |
| 2026-10-23 | 新增实例级连接配置和协议选择；25 项离线测试通过，覆盖凭据隔离、令牌映射、客户端释放与敏感字段不落会话；未验证真实 DS 请求 |


## 流式输出契约

| 项目 | 约定 |
|---|---|
| text_delta | data={text}；按 sequence 追加显示，可能包含工具之间的中间说明，不等于最终答案 |
| status | data={status,content,error_code}；终态 content 是最终权威正文，覆盖此前累计文本；失败/取消保留已提交部分文本 |
| activity | data={text}；沿用 context.emit，工具调用进度可见，不包含原始凭据 |
| interaction / artifact | data 为对应已提交 DTO；答复、过期会产生交互更新；产物仍由外部发布 |
| 事务 | 状态/正文与对应事件在同一 save 快照中提交；save 返回前不推送，存储失败返回 STORAGE_FAILED |
| 游标 | after 使用同一会话 sequence；过滤 run_id 后序号可能不连续；after 大于最新值返回 INVALID_CURSOR |
| 保留窗口 | 最近 max_items 条事件；过旧游标返回 CURSOR_EXPIRED，不静默丢事件；重新 get_session 后以该快照 event_sequence 继续 |
| 多观察者 | 独立读取，不互相消费；慢观察者不阻塞工作，超出窗口须重取快照；主动关闭迭代器仅解绑观察 |
| 终态 | 对指定轮次重放完毕自动结束；无新事件且已结束时直接结束；没有会话级永久连接或网络 SSE 实现 |
| 旧快照 | 无事件字段时从 0 开始；不补造已结束历史的逐字输出，历史正文仍可查询 |

## 恢复契约

| 项目 | 约定 |
|---|---|
| 触发方式 | 重建实例只恢复数据、将活动轮次标记 interrupted，并过期旧待办；仅新 submit 启动新轮次，不自动重放任务 |
| OpenAI 恢复 | 保存 SDK to_input_list 的完整可重放项，包括工具调用与结果；流中只保存调用/结果配对完整的边界，结束再次保存；不依赖服务端 response_id |
| OpenAI 中断边界 | 未配对的在途工具调用不进入恢复点；尚未保存的工具结果和文本增量可能不在模型上下文内，但公开部分正文保留；恢复不是指令级原地续跑 |
| Claude 恢复 | init/流/结果获得 native session_id 即保存；下一轮使用 resume，只发送新输入；宿主必须保留同一身份的 CLI 会话文件及工作目录 |
| Claude 失败 | 原生会话文件丢失或 SDK 拒绝恢复时显式失败，不静默降级成新会话；可明确 resume=False 重开上下文 |
| 配置绑定 | 恢复格式版本、mode、model、连接地址、指令、运行配置和工具声明须匹配；不匹配返回 RECOVERY_INCOMPATIBLE；密钥本身不入绑定与快照，支持同身份密钥轮换 |
| 自定义模型 | OpenAI Model 对象按类型绑定；同类型内部配置变动无法自动识别，宿主必须隔离存储或显式重置 |
| custom 执行器 | 可读取 context.recovery 并调用 checkpoint 保存自身状态；旧执行器不调用时保持原行为，不凭接口存在承诺原生恢复 |
| 重置 | submit(..., resume=False) 清除私有恢复状态，仅以新输入运行；旧结果和审计记录仍保留；提交失败不启动执行 |
| 审批与副作用 | 旧待办不能续用；新工具调用重新审批；恢复上下文不能保证外部副作用只执行一次，中断后的不确定效果须核对后再续办 |
| 存储责任 | WorkStore 需原样、原子保存新增 events/event_sequence/_recovery；恢复数据可能含工具输入与结果，按会话正文保护，不能当日志上传；包不管理数据库或 CLI 文件 |
| 跨供应商 | 不允许把 OpenAI checkpoint 交给 Claude；恢复不是跨 SDK 迁移能力 |
| 限制 | 不保证任意模型或兼容端点的流式协议；真实 Claude CLI、云端请求及主机重启恢复仍需集成验收 |

## 流式与恢复变更记录

| 日期 | 变化与验证 |
|---|---|
| 2026-10-23 | 新增第八个方法 stream_events；持久游标与有界重放、部分正文、状态/待办/产物事件；增加 checkpoint 和 resume 开关；OpenAI 完整工具上下文续接、Claude 原生会话续接；未修改业务编排或外部接入 |
| 验证 | 36 项测试通过（安装 SDK extras，无跳过）；包内离线测试覆盖真实 OpenAI Runner 流式与工具历史续接、Claude 官方 DTO 的流式与 resume 参数、断线重放、重启标记、取消、游标过期、存储失败；未请求付费模型 |
| 接口依据 | [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)；具体实现核对已安装 0.24.0 的 Runner.run_streamed / RunResultStreaming.to_input_list；Claude 核对已安装 0.2.173 的 StreamEvent / resume / include_partial_messages |

| 2026-10-23 冻结前修复 | 失败/取消清理开始后禁止重复取消收尾；默认终态为中断，仅有效成功返回才置成功。新增失败清理期间停止的回归，36 项通过 |
