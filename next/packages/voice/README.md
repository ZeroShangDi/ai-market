# Python 语音包 API

## 包信息

| 项目 | 说明 |
|---|---|
| 归属 | `packages/voice`，可复用基础能力包，不是业务模块 |
| 源码入口 | [src/main.py](src/main.py)，核心实现直接位于 `src/` |
| 安装后导入入口 | `voice.main`；构建配置将 Python 包名 `voice` 映射到 `src`，不另建同名源码目录 |
| 分发名 / 版本 | `ai-market-voice-kit` / `0.1.0` |
| 接口数量 | 1 个 Python 工厂、8 个实例方法、5 类事件；另提供浏览器终端采集入口；不是 HTTP 路由 |
| 运行要求 | Python ≥ 3.9；httpx 0.28.1、sounddevice 0.5.1；PortAudio 与可用输入 / 输出设备；可编辑安装需 pip ≥ 21.3 |
| 生命周期 | 每个身份独立实例；同一 asyncio 事件循环内调用；协程方法必须 await |
| 实现范围 | HTTP ASR、流式 HTTP TTS 与 PCM 播放、真实本机录音、能量分段、浏览器回声消除采集入口、终端适配、打断与外部生成取消通知、队列、事件与超时 |
| 播报能否出声 | 已有调用合成服务并写入真实扬声器的代码；需有效 TTS 配置和可用音频设备，并非仅接口回调 |
| 声音在哪里播放 | 在 Python 进程所在机器播放；尚无手机 / 浏览器远程音频传输，不会自动让手机出声 |
| 当前验证 | 43 项 Python 测试与 4 项浏览器终端测试通过；网络传输和设备使用替身。本执行环境未发现音频设备，未完成真实模型发声和麦克风验收 |
| 外部职责 | 回复生成、对话上下文、业务身份、任务、审批、界面与角色选择 |
| 数据 | 文本、PCM、队列与回执仅在内存；不写录音文件、不记录正文或凭据 |
| 旧工程关系 | 只读参考；不导入、不修改旧项目代码；原 TS 初版已移除 |

## 实例工厂

| 方法 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `create_voice(provider, *, limits=None, input_device=None, output_device=None, audio_terminal=None)` | `ProviderConfig`、`Limits`、设备 ID / 名称、可选 `AudioTerminal` | `Voice` | 同步装配真实 HTTP 与本机音频适配；不自动开启麦克风 |

## 实例方法

| 方法 | 参数 | 返回类型 | 同步 / 异步 | 前置条件与行为 |
|---|---|---|---|---|
| `configure(**options)` | `VoiceConfig` 字段 | `VoiceConfig` | 同步 | 返回不可变完整配置；校验音色是否在声明清单内；活动会话不可改语言 |
| `list_voices()` | 无 | `list[dict]` | 同步 | 返回部署方声明音色的副本；不是对远端模型能力的动态探测 |
| `start(*, capture=True)` | 是否录音 | `str` 会话 ID | 异步 | 默认打开真实麦克风并启用 ASR；`False` 仅播报，不要求 ASR；重复调用复用当前会话，不切换采集模式 |
| `stop()` | 无 | `None` | 异步 | 取消并等待识别、合成、播放和设备清理；清空会话及回执；配置和订阅保留 |
| `set_muted(muted)` | `bool`，必填 | `None` | 异步 | 仅有采集能力的活动会话；静音关闭真实麦克风，恢复重新打开；保持播放 |
| `speak(*, session_id, generation, speech_id, seq, text, final)` | 下表播报参数 | `dict` 接收回执 | 同步 | 当前会话中接收文本并后台合成播放；不代表已出声，最终结果通过事件确认 |
| `interrupt()` | 无 | `list[str]` 被取消播报 ID | 异步 | 取消当前及排队播报，等待正在运行的合成 / 播放清理；保持录音 |
| `subscribe(listener)` | 同步事件处理函数 | 无参取消订阅函数 | 同步 | 立即发送状态快照；后续事件异步分发；不接受 async 回调 |

## VoiceConfig

| 参数 | 类型 | 必填 | 默认值 | 范围与生效时机 |
|---|---|---|---|---|
| `voice_id` | `str` | 否 | 部署音色清单首项 ID | 1–128 位字母、数字、下划线或连字符；必须在清单内；下一条新播报生效 |
| `rate` | `float` | 否 | `1.0` | 有限数 `0.25–4`；传给 TTS 的 speed，实际支持由服务决定；下一条新播报生效 |
| `volume` | `float` | 否 | `1.0` | 有限数 `0–1`；本地 PCM 缩放；下一条新播报生效 |
| `language` | `str` | 否 | `'zh'` | 语言代码；传给识别服务；会话存在时禁止修改 |
| `auto_interrupt` | `bool` | 否 | `True` | 立即生效；检测到说话起始时取消已接收播报 |
| 未知字段 | — | — | — | `configure` 拒绝，不接受凭据和业务参数 |

## ProviderConfig

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `tts_url` | `str` | 是 | 无 | 完整合成 endpoint；HTTPS，或本机回环 HTTP；无自动拼接路径 |
| `tts_model` | `str` | 是 | 无 | 已部署 TTS 模型 |
| `tts_key` | `str` | 否 | 空 | Bearer 密钥；不出现在 repr 或事件中 |
| `asr_url` | `str` | 录音时是 | 空 | 完整识别 endpoint；仅播报模式可省略 |
| `asr_model` | `str` | 按服务要求 | 空 | multipart 识别请求的模型字段 |
| `asr_key` | `str` | 否 | 空 | ASR Bearer 密钥；不出现在 repr 或事件中 |
| `asr_protocol` | `str` | 否 | `'openai'` | `'openai'` 使用 multipart WAV；`'qwen-wav'` 使用原始 WAV 请求正文 |
| `sample_rate` | `int` | 否 | `24000` | TTS 返回 PCM 的实际采样率；可选 16000、22050、24000、44100、48000；必须与服务一致 |
| `timeout_seconds` | `float` | 否 | `30` | HTTP 各阶段超时；完整操作总超时还受 Limits 限制 |
| `max_audio_bytes` | `int` | 否 | `16777216` | 单块文本合成返回音频的最大字节数，最小 2 |
| `voices` | `tuple[VoiceInfo, ...]` | 否 | 单项 `default / 默认 / zh` | 部署方确认的音色列表，1–1000 项，ID 唯一；不是伪造服务端查询结果 |
| 凭据来源 | — | — | — | 宿主显式注入；包不读取环境变量，不从模型输出接受连接地址 |

## VoiceInfo

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `str` | 是 | 无 | 1–128 位字母、数字、下划线或连字符 |
| `name` | `str` | 是 | 无 | 展示名称 |
| `languages` | `tuple[str, ...]` | 否 | `('zh',)` | 部署方声明的支持语言 |

## speak 参数与回执

| 参数 / 返回字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `session_id` | `str` | 是 | 当前 `start` 返回 ID；旧会话拒绝 |
| `generation` | `int` | 是 | 外部生成发起时从 transcript / state 取得的非负版本；整条生成流固定此值，中断后旧版本拒绝；新增必填参数 |
| `speech_id` | `str` | 是 | 会话内唯一；1–128 位字母、数字、下划线或连字符 |
| `seq` | `int` | 是 | 从 0 连续递增；不接受布尔值或负数 |
| `text` | `str` | 是 | 外部生成的文字；仅 final 为 True 时允许空文本 |
| `final` | `bool` | 是 | 是否最后一块；一次性播报也必须显式为 True |
| 返回 `accepted` | `bool` | — | 接收成功固定 True，错误时抛异常 |
| 返回 `duplicate` | `bool` | — | 相同会话、播报、序号和内容的重复提交为 True，不重复播放 |

## 播报语义

| 项目 | 行为 |
|---|---|
| 合成协议 | POST JSON：model、voice、input、response_format=pcm、speed；响应须为单声道 signed 16-bit little-endian PCM |
| 音频格式 | 接受 audio/pcm、audio/raw、application/octet-stream；空音频、奇数字节或其他 MIME 拒绝 |
| 流式文本与音频 | 按序接收文本块；HTTP PCM 边收到边播放，不等完整响应；采样跨网络块时保留尾字节拼接 |
| 音频背压 | 本机设备最多缓冲 160 ms，满时暂停读取；提供者单块最多 8192 字节，总响应仍受容量限制 |
| 网络抖动 | 暂缺数据时输出静音；源结束且设备排空才完成，中途异常发 failed |
| 分块粒度 | 外部宜按句 / 短语提交；包不自动把 token 合句，不承诺块间无缝衔接 |
| 调度 | 同一实例串行播放，前一播报等待后续文本时后一播报等待；超时后处理下一条 |
| 配置快照 | 每条播报在首块入队时固定音色、语速和音量 |
| 重放 | 已完成播报允许相同块重放获取回执；不同内容拒绝；final 后不得新增序号 |
| 中断 / 失败 | 该播报 ID 关闭；不能追加或重试恢复播放；新回复使用新 ID |
| started | 首块进入原生输出回调时发送；不是合成开始或提交入队时发送 |
| completed | 全部块播放完，原生设备缓冲区排空后发送；空结束块本身不调用 TTS |
| 外部模型取消 | 宿主处理 generation_cancelled，取消该会话下 generation 及更早版本的外部生成工作；本包不调用回复模型 |
| 尚无首块时插话 | 仍发 generation_cancelled 并拒绝迟到首块；没有已接收播报时不发 playback(interrupted) |
| 取消版本生效 | 说话检测同步封闭旧队列并递增版本，之后分发事件；禁止为旧回复补填新版本 |

## 事件

| 事件 | 载荷字段 | 说明 |
|---|---|---|
| `state` | type、session_id、generation、session、capture、playback、muted、echo_cancellation | 订阅快照与运行状态变化 |
| `transcript` | type、session_id、generation、utterance_id、text、final | 按句 HTTP 识别结果；当前 final 固定 True，无中间识别结果 |
| `playback` | type、session_id、speech_id、phase、reason | 播报生命周期；reason 无原因时为 None |
| `generation_cancelled` | type、session_id、generation、next_generation、reason | 插话、手动打断或停止时通知，即使尚未提交播报 |
| `error` | type、session_id、speech_id、code、retryable | 稳定错误码，不包含原始服务正文；无关联字段为 None |

## 事件字段

| 字段 | 类型 / 可选值 | 说明 |
|---|---|---|
| `session_id` | `str / None` | 来源会话；idle 为 None，终止事件仍可携带旧 ID |
| `generation` | `int` | 状态中为当前版本；识别中为该句结束采集时的版本；取消事件中为已失效版本 |
| `next_generation` | `int` | 取消后的版本，不得用于旧回复 |
| `echo_cancellation` | `bool` | 终端声明的回声消除能力，默认 LocalAudio 为 False |
| `session` | `'idle' / 'active'` | 无会话 / 已建立会话 |
| `capture` | `'off' / 'listening' / 'muted'` | 仅播报或关闭 / 录音 / 静音 |
| `playback` | `'idle' / 'buffering' / 'playing'` | 无队列 / 等待合成或后续文本 / 设备播放中 |
| `muted` | `bool` | 麦克风关闭状态 |
| `utterance_id` | `str` | 包生成的语句 ID |
| `text` | `str` | 识别文本，不持久化 |
| `final` | `bool` | 当前 HTTP 识别只产生 True |
| `speech_id` | `str / None` | 关联播报 ID |
| `phase` | `'started' / 'completed' / 'interrupted' / 'failed'` | 开始 / 完成 / 取消 / 失败 |
| `reason` | `'manual' / 'speech' / 'stop' / 错误码 / None` | 手动 / 检测到说话 / 停止 / 失败原因 |
| `code` | `str` | 下表稳定错误码 |
| `retryable` | `bool` | 错误是否可能恢复，不表示包会自动重试 |

## Limits

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `max_queued_speeches` | 正整数 | `8` | 当前加等待中的播报数量 |
| `max_session_speeches` | 正整数 | `256` | 会话回执上限，包含已完成 / 中断 / 失败；stop 后释放 |
| `max_speech_characters` | 正整数 | `16000` | 每条播报累计字符数，按 Python len 计数 |
| `max_chunks_per_speech` | 正整数 | `1024` | 每条播报文本块数，包含空结束块 |
| `operation_timeout_seconds` | 正有限数 | `45` | 每次识别或每块合成加播放的总超时，单位秒 |
| `stream_idle_timeout_seconds` | 正有限数 | `15` | 已处理接收块后等待下一块的时限，单位秒 |

## 错误码

| 错误码 | 含义 | retryable |
|---|---|---|
| `INVALID_INPUT` | 参数类型、范围或配置无效 | False |
| `INVALID_STATE` | 当前模式不支持操作、或会话中更改语言 | False |
| `VOICE_UNAVAILABLE` | 音色不在部署清单内 | False |
| `ASR_UNAVAILABLE` | 开启录音但未配置 ASR | False |
| `STALE_SESSION` | 旧会话 ID 或已停止 | False |
| `STALE_GENERATION` | 回复属于中断前版本，拒绝新增及重复提交 | False |
| `OUT_OF_ORDER` | 文本块序号不连续 | False |
| `CONFLICT` | 相同序号内容不同 | False |
| `SPEECH_CLOSED` | 向已关闭播报追加或重试 | False |
| `CAPACITY` | 队列、回执、文本、识别积压或响应音频超限 | False |
| `INVALID_AUDIO` | 合成音频格式无效 | False |
| `TIMEOUT` | 请求、播放或等待文本超时 | True |
| `CAPTURE_FAILED` | 录音设备开启、运行或释放失败 | True |
| `PLAYBACK_FAILED` | 播放设备或合成播放流程失败 | True |
| `PROVIDER_FAILED` | 服务状态、响应或连接失败 | True |

## 资源与失败行为

| 项目 | 行为 |
|---|---|
| 同步校验错误 | 抛 VoiceError，不保证另发 error 事件；Python 方法签名错误按语言规则抛 TypeError |
| 单次识别失败 | 发 error，继续监听下一句，不自动重试 |
| 播报失败 | 发 error 与 playback(failed)，继续后续队列 |
| 录音运行失败 | 发 error，并停止当前会话 |
| 静音切换失败 | 发 error 并抛异常，保持输入屏蔽；宿主可 stop 清理 |
| 设备释放失败 | 发错误；不能把内部状态为空闲当作设备必定释放成功 |
| 取消 | 协程取消传递到 HTTP 请求和原生播放流；interrupt 等待当前播放清理 |
| 事件分发 | 内存事件，无回放；订阅时同步快照，之后通过事件循环分发；回调必须同步 |
| 订阅隔离 | 独立取消函数、事件深拷贝、回调错误不影响其他监听；取消后丢弃待分发事件 |
| 旧会话 | 宿主按 session_id 过滤迟到事件；静音前设备回调与识别结果通过内部轮次号隔离 |
| 销毁 | await stop、逐一取消订阅、丢弃实例；没有额外 dispose 接口 |
| 设备位置 | 仅本机 PortAudio，尚无 WebRTC / 移动端适配；Linux 可能需系统安装 PortAudio |
| 分段 | 16 kHz / 单声道 / 20 ms 帧；连续 60 ms 超阈值开始，500 ms 静音结束，最长单句 15 秒 |
| 回声与误触发 | 浏览器终端先开启并确认 AEC，再交音频给宿主；本机 PortAudio 仍无可移植 AEC，状态明确为 False |
| 识别积压 | 单识别消费者，最多等待 2 句；超限发 CAPACITY 并丢弃新句，不静默无限积压 |

## 构建与验证

| 项目 | 命令 / 状态 |
|---|---|
| 依赖锁定 | requirements.lock 固定本次验证依赖；pyproject.toml 声明运行与构建依赖 |
| 安装依赖 | 包目录执行 `python -m pip install -r requirements.lock` |
| 安装源码包 | 包目录执行 `python -m pip install --no-build-isolation --no-deps -e .` |
| Python 测试 | 包安装后执行 `python -m unittest discover -s tests -v` |
| 终端测试 | Node 环境执行 `node --test tests/terminal.test.mjs`；Python 运行无需 Node |
| 已验证 | 43 项 Python + 4 项终端测试：HTTP 首块、边接收边播、背压、取消关流、迟到首块拒绝、终端 AEC 校验及资源释放 |
| 未验证 | 真实模型识别质量、实际声音、麦克风权限、蓝牙、外放回声、延迟及多平台安装 |
| 旧 Python 对照 | 新实现有真实 HTTP 与本机音频路径；尚未复刻旧 Pipecat / WebRTC 链路，不声称体验等价 |
| 注释约定 | Python 核心方法用 docstring 说明参数、返回和异常；并发、取消、队列与资源释放补充注释 |

## 终端回声消除接入

| 项目 | 类型 / 入口 | 约定 |
|---|---|---|
| 浏览器入口 | [src/terminal/main.mjs](src/terminal/main.mjs) | Web / WebView 的最小采集辅助代码，随 wheel 附带；Python 核心仍在 src/main.py |
| 采集方法 | `openMicrophone({ signal }?)` | 请求 getUserMedia 的回声消除、降噪和增益控制；要求 AEC 实际设置为 true，否则报错 |
| 返回结果 | `{ stream, echoCancellation: true, close }` | stream 是真实音轨；close 幂等释放；signal 取消也关闭，权限弹窗返回迟到流时立即释放 |
| 不可用 | `ECHO_CANCELLATION_UNAVAILABLE` | 浏览器不支持或未确认开启 AEC，不静默回退 |
| 浏览器条件 | 安全上下文与麦克风权限 | 采集辅助代码需由已有终端宿主调用 |
| Python 注入 | `audio_terminal: AudioTerminal` | 与本机设备参数互斥；要求 open_capture、play_stream 和真实 echo_cancellation 布尔能力 |
| `open_capture(on_frame, on_error)` | 返回带 close 的句柄 | 输入是终端处理后的 16 kHz、20 ms、单声道 s16le PCM；宿主负责把音轨转换成规定帧，在所属事件循环投递 |
| `play_stream(chunks, sample_rate, volume, on_started)` | 异步方法 | 有界消费 PCM 异步流；开始播放时回调，设备排空后返回；取消须立即停止播放并关闭源 |
| 接入边界 | 无新增网络服务或媒体桥 | 浏览器采集与 Python 之间由宿主适配器连接；包不创建专网或网络传输 |
| 实测限制 | 尚未真机验收 | 测试验证请求和设置校验，不能证明具体终端的回声消除效果 |

## 变更日志

| 阶段 | 变化 | 接入影响与验证 |
|---|---|---|
| 未发布：流式播报 | HTTP TTS 音频边接收边播放，使用有界缓冲与背压；打断时关闭合成流并停止设备 | 无需等待完整音频；真实设备声音与延迟待验收 |
| 未发布：生成取消 | 新增 generation_cancelled 事件，打断、停止及自动打断时通知外部取消生成，拒绝过期文本 | speak 必须传入对应轮次的 generation；外部负责实际取消回复生成 |
| 未发布：终端回声消除 | 新增浏览器 openMicrophone 入口，校验实际 AEC 设置并释放取消后的音轨；支持注入 AudioTerminal | 默认本机 PortAudio 不提供 AEC；宿主负责连接终端音频，无新增网络传输 |
| 未发布：文档与验证 | 同步工厂、方法、事件及终端接入表格；43 项 Python 与 4 项终端测试通过 | 网络和设备使用替身，真实模型、麦克风与外放回声效果尚未验收 |
