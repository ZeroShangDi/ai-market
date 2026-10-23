# 聊天包

## 定位

| 项目 | 说明 |
|---|---|
| 实现 | Python ≥ 3.9，标准库实现；公开入口 src/main.py，安装后从 chat.main 导入 |
| 对外接口 | 1 个工厂 + 6 个实例方法；事件流随发送返回，不额外暴露订阅、重试或请求查询方法 |
| 职责 | 会话、历史、流式回复、停止、重试；不管理联网、技能、角色、工作或长期记忆 |
| 外部能力 | 宿主提供生成器、插件句柄和配置；联网开关通过 config/options 传给生成器，由外部真正执行 |
| 隔离 | 每个可信身份独立实例，同一 asyncio 循环使用；包不负责认证、租户管理或跨进程共享 |
| 存储 | 可注入 ConversationStore；不传时仅内存。数据库、文件位置、连接与隔离由宿主管理；支持恢复历史，不提供事件重放或请求幂等 |
| 契约优先级 | 本文替代先前聊天 10 方法草案；[公共文档](../../docs/features/chat-work.contract.md)中工作专用的持久事务及权限规则不强加给本包 |

## 初始化注入口

| create_chat 参数 | 类型 / 默认 | 说明 |
|---|---|---|
| store | ConversationStore / None | 外部存储适配器；首次调用异步加载，六个实例方法不变 |
| generator | Callable[[GenerationInput], AsyncIterator[str]]，必填 | 外部生成器；返回异步字符串流，可调用宿主提供的联网及技能能力；不是返回协程的函数 |
| plugins | Mapping[str, Any] / 空 | 外部能力句柄，包仅传递，不扫描、注册、调度或授权业务技能 |
| config | dict / 空 | 宿主默认配置，如联网开关、角色风格、模型选择；调用前深拷贝 |
| max_chars | int / 32000 | 单次输入和回复各自的字符上限，按 Unicode 码点计；不是历史总量上限 |
| queue_size | int / 32 | 流事件队列上限，慢消费产生背压 |
| timeout | 秒 / 120 | 生成及背压等待时限；生成器必须响应取消并及时释放资源 |
| 返回 | Chat | 每个身份分别创建；所有实例方法需 await |

## 六个实例方法

| 方法 | 参数 | 返回 | 语义 |
|---|---|---|---|
| create_conversation | title='新会话' | Conversation | 新建会话；标题必须为非空字符串 |
| list_conversations | 无 | list[{id,title}] | 按创建顺序返回本实例会话摘要；当前无分页 |
| get_conversation | conversation_id | Conversation | 返回完整历史和最新生成状态的独立副本；断流后通过此方法核对 |
| send_message | conversation_id、content=None；retry=False、options=None 为关键字参数 | 异步事件流 | 普通发送要求非空文本；retry=True 时 content 必须省略，替换最后助手回复，不重复用户消息；options 合并覆盖本轮配置 |
| cancel_generation | conversation_id、generation_id | Generation | 只取消匹配的生成，防止旧停止请求打断新轮次；终态保持不变；保留部分回复 |
| delete_conversation | conversation_id | {deleted:true} | 停止活动生成后删除历史；重复删除成功；不会删除外部工作任务 |

## 数据与事件

| 类型 | 字段 / 说明 |
|---|---|
| Conversation | id、title、messages、generation:null 或 Generation；公开快照附加 storage_error，正常为 null，故障为 STORAGE_FAILED |
| Message | role:user/assistant、content |
| Generation | id、status:running/completed/cancelled/failed/interrupted、error_code:null 或错误码 |
| GenerationInput | conversation_id、generation_id、messages（历史快照元组）、plugins（句柄映射副本）、config（本轮配置副本）、cancelled（asyncio.Event） |
| 事件公共字段 | type、conversation_id、generation_id、sequence；sequence 从 1 开始，仅当前事件流有效 |
| started | 本轮开始；可从事件或 get_conversation 获取 generation_id |
| delta | text、offset；offset 为 Unicode 码点偏移 |
| completed/cancelled/failed | content 为权威全文，error_code 可空；以终态全文校正增量 |
| 队列收尾 | 终态不得被满队列阻塞；必要时淘汰队列最旧增量，终态全文补齐；序号可能跳跃，不提供持久重放 |
| 立即取消 | 任务首次调度前被取消时可能没有事件；get_conversation 仍返回 cancelled |
| 关闭流 | await stream.aclose() 停止生成；提前退出 async for 后调用方应显式关闭。仅不消费不会立即取消，最终由 timeout 结束 |
| 并发 | 每会话只允许一个活动生成；不同会话互不阻塞；删除期间不接收新发送 |

## 外部生成器责任

| 事项 | 要求 |
|---|---|
| 联网与技能 | 由生成器解释配置、选择和调用注入能力；包不保证某个生成器具备联网能力，也不内建开关对应的网络请求 |
| 角色与记忆 | 宿主提供风格配置、上下文或技能；长期记忆提炼由宿主独立异步安排，不在包内硬编码 |
| 权限 | 身份绑定、联网授权、技能审批与凭据全部由宿主执行；用户输入不能直接覆盖可信权限配置 |
| 上下文预算 | 包传完整内存历史；生成器按自身模型预算整理上下文，宿主负责会话总量和历史保留策略 |
| 取消 | 必须响应 asyncio 任务取消，关闭请求、流和工具资源；不吞掉 CancelledError；远端费用和已发生副作用不会自动撤销 |
| 异常 | 供应商普通异常映射为 PROVIDER_FAILED，不泄漏原始异常；关闭失败映射 PROVIDER_CLEANUP_FAILED、STORAGE_FAILED、PROCESS_INTERRUPTED |
| 空结果 | 正常结束而无文本为 completed 且 content 为空，宿主可自行判断是否符合产品要求 |

## 错误与验证

| 项目 | 说明 |
|---|---|
| 错误类型 | ChatError.code；NOT_FOUND、VALIDATION_ERROR、CHAT_BUSY、NOTHING_TO_RETRY、STALE_GENERATION、INVALID_PROVIDER_OUTPUT、LIMIT_EXCEEDED、DEADLINE_EXCEEDED、PROVIDER_FAILED、PROVIDER_CLEANUP_FAILED、STORAGE_FAILED、PROCESS_INTERRUPTED |
| 测试 | 包目录执行 python3 -m unittest discover -s tests -v；12 项通过，覆盖注入、流式、快照隔离、重试、忙碌、取消、迟到 ID、背压、超时及异常；外部文件适配器验证重新建实例恢复、持久删除、取消保存及存储失败 |
| 验证边界 | 测试生成器为替身；未接入真实模型、联网供应商或实际技能执行，不声称联网业务已验收 |
| 安装 | Python 构建配置将 chat 映射到 src；当前未执行发行构建或联网安装 |

## 变更日志

| 日期 | 变化 |
|---|---|
| 2026-10-23 | 从 10 方法草案精简为 6 方法，新增工厂注入口；Python 内存实现支持流式、取消、重试和外部能力传递 |


## 外部存储契约

| 方法 / 事项 | 要求 |
|---|---|
| load_all() | 异步返回当前身份范围内的完整 Conversation 列表，按创建顺序；返回独立的 JSON 兼容快照 |
| save(conversation) | 异步原子新增或替换完整会话；返回代表已持久提交；包传入独立副本，不含运行任务、插件或凭据 |
| delete(conversation_id) | 异步持久删除，目标不存在也成功 |
| 写入时机 | 创建和发送先保存再成功返回；每个文本块先保存再发布 delta；完成、取消和失败保存终态；删除先停止生成再删除存储 |
| 初始化恢复 | 首次调用加载历史；遗留 running 改为 interrupted / PROCESS_INTERRUPTED 并保存；不重放模型或技能调用 |
| 单写者 | 一个身份存储范围同时只允许一个活跃 Chat 实例；宿主确保所有权转移，不支持多进程并发写同一会话 |
| 读取与规模 | 运行期间使用本地状态，外部修改不会自动刷新；load_all 全量加载，适用于有限会话历史，宿主负责归档和容量控制 |
| 失败 | 读写异常转换为 STORAGE_FAILED；发送前保存失败不启动生成；生成中保存失败输出 failed，不能当作已持久成功；部分已提交数据可在下次加载恢复 |
| 不确定提交 | 存储异常或调用取消可能发生在外部已经提交之后，包不承诺事务回滚或自动重试；宿主核对存储后再恢复 |
| 适配器责任 | 授权隔离、加密、数据库驱动、备份、连接释放、存储超时及取消一致性归宿主；包不创建数据库或管理连接 |
| 当前验证 | 测试使用宿主文件适配器真实写盘并重建实例；未验证生产数据库、跨进程锁或断电持久性 |

## 本次变更

| 日期 | 变化 |
|---|---|
| 2026-10-23 | 增加 store 初始化注入口和 ConversationStore 协议；持久保存历史、增量与终态，支持恢复和删除；六个业务方法保持不变 |


## 冻结前修复记录

| 日期 / 事项 | 契约与验证 |
|---|---|
| 2026-10-23 终态取消 | 进入生成器清理及终态保存后，cancel_generation 等待收尾，不再次取消任务；完成提交成功则返回 completed 并发布终态事件 |
| 不确定提交 | save/delete 异常或提交中取消后冻结实例写入；禁止新建、发送和删除，防止旧快照覆盖已提交数据；读取仍可用并标记 storage_error；停止已有生成仍可请求，但不能承诺其终态已落盘 |
| 恢复 | 宿主核对存储并停止旧实例活动后重建；不能通过再次发送绕过故障；不自动重试不确定提交 |
| 验证 | 12 项通过，新增最终保存期间取消、已提交但回执丢失后禁止覆盖与删除的确定性回归 |
