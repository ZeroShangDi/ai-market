# Python 语音包 API

## 包信息

| 项目 | 说明 |
|---|---|
| 归属 | `packages/voice`，可复用基础能力包，不是业务模块 |
| 源码入口 | [src/main.py](src/main.py)，核心实现直接位于 `src/` |
| 安装后导入入口 | `voice.main`；构建配置将 Python 包名 `voice` 映射到 `src`，不另建同名源码目录 |
| 分发名 / 版本 | `ai-market-voice-kit` / `0.1.0` |
| 接口数量 | 1 个工厂、8 个实例方法、4 类事件；不是 HTTP 路由 |
| 运行要求 | Python ≥ 3.9；httpx 0.28.1、sounddevice 0.5.1；PortAudio 与可用输入 / 输出设备；可编辑安装需 pip ≥ 21.3 |
| 生命周期 | 每个身份独立实例；同一 asyncio 事件循环内调用；协程方法必须 await |
| 实现范围 | HTTP ASR、HTTP TTS、真实本机录音、能量分段、PCM 播放、打断、队列、事件与超时 |
| 播报能否出声 | 已有调用合成服务并写入真实扬声器的代码；需有效 TTS 配置和可用音频设备，并非仅接口回调 |
| 声音在哪里播放 | 在 Python 进程所在机器播放；尚无手机 / 浏览器远程音频传输，不会自动让手机出声 |
| 当前验证 | 34 项自动测试通过；网络传输和设备使用替身。本执行环境未发现音频设备，未完成真实模型发声和麦克风验收 |
| 外部职责 | 回复生成、对话上下文、业务身份、任务、审批、界面与角色选择 |
| 数据 | 文本、PCM、队列与回执仅在内存；不写录音文件、不记录正文或凭据 |
| 旧工程关系 | 只读参考；不导入、不修改旧项目代码；原 TS 初版已移除 |

## 实例工厂

| 方法 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `create_voice(provider, *, limits=None, input_device=None, output_device=None)` | `ProviderConfig`、`Limits`、设备 ID / 名称 | `Voice` | 同步装配真实 HTTP 与本机音频适配；不自动开启麦克风 |

## 实例方法

| 方法 | 参数 | 返回类型 | 同步 / 异步 | 前置条件与行为 |
|---|---|---|---|---|
| `configure(**options)` | `VoiceConfig` 字段 | `VoiceConfig` | 同步 | 返回不可变完整配置；校验音色是否在声明清单内；活动会话不可改语言 |
| `list_voices()` | 无 | `list[dict]` | 同步 | 返回部署方声明音色的副本；不是对远端模型能力的动态探测 |
| `start(*, capture=True)` | 是否录音 | `str` 会话 ID | 异步 | 默认打开真实麦克风并启用 ASR；`False` 仅播报，不要求 ASR；重复调用复用当前会话，不切换采集模式 |
| `stop()` | 无 | `None` | 异步 | 取消并等待识别、合成、播放和设备清理；清空会话及回执；配置和订阅保留 |
| `set_muted(muted)` | `bool`，必填 | `None` | 异步 | 仅有采集能力的活动会话；静音关闭真实麦克风，恢复重新打开；保持播放 |
| `speak(*, session_id, speech_id, seq, text, final)` | 下表播报参数 | `dict` 接收回执 | 同步 | 当前会话中接收文本并后台合成播放；不代表已出声，最终结果通过事件确认 |
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
| 流式文本 | 可以连续提交文本块，按序逐块合成和播放；每块先收完音频再播放，不是逐音频包边下载边播 |
| 分块粒度 | 外部宜按句 / 短语提交；包不自动把 token 合句，不承诺块间无缝衔接 |
| 调度 | 同一实例串行播放，前一播报等待后续文本时后一播报等待；超时后处理下一条 |
| 配置快照 | 每条播报在首块入队时固定音色、语速和音量 |
| 重放 | 已完成播报允许相同块重放获取回执；不同内容拒绝；final 后不得新增序号 |
| 中断 / 失败 | 该播报 ID 关闭；不能追加或重试恢复播放；新回复使用新 ID |
| started | 首块进入原生输出回调时发送；不是合成开始或提交入队时发送 |
| completed | 全部块播放完，原生设备缓冲区排空后发送；空结束块本身不调用 TTS |
| 外部模型取消 | 宿主根据 interrupted 自行停止对应回复流；本包不生成回复 |
| 无待播报时插话 | 不产生 interrupted；不能用它替代对外部生成模型的完整轮次管理 |

## 事件

| 事件 | 载荷字段 | 说明 |
|---|---|---|
| `state` | type、session_id、session、capture、playback、muted | 订阅快照与运行状态变化 |
| `transcript` | type、session_id、utterance_id、text、final | 按句 HTTP 识别结果；当前 final 固定 True，无中间识别结果 |
| `playback` | type、session_id、speech_id、phase、reason | 播报生命周期；reason 无原因时为 None |
| `error` | type、session_id、speech_id、code、retryable | 稳定错误码，不包含原始服务正文；无关联字段为 None |

## 事件字段

| 字段 | 类型 / 可选值 | 说明 |
|---|---|---|
| `session_id` | `str / None` | 来源会话；idle 为 None，终止事件仍可携带旧 ID |
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
| 回声与误触发 | 当前是基本能量检测，不是 Silero VAD；没有回声消除，外放可能误触发打断，验收宜先使用耳机 |
| 识别积压 | 单识别消费者，最多等待 2 句；超限发 CAPACITY 并丢弃新句，不静默无限积压 |

## 构建与验证

| 项目 | 命令 / 状态 |
|---|---|
| 依赖锁定 | requirements.lock 固定本次验证依赖；pyproject.toml 声明运行与构建依赖 |
| 安装依赖 | 包目录执行 `python -m pip install -r requirements.lock` |
| 安装源码包 | 包目录执行 `python -m pip install --no-build-isolation --no-deps -e .` |
| 测试 | 包安装后执行 `python -m unittest discover -s tests -v` |
| 已验证 | 34 项：8 接口契约、HTTP 编码、请求取消、音频回调、音量缩放、设备清理、分段、乱序、去重、容量和错误隔离 |
| 未验证 | 真实模型识别质量、实际声音、麦克风权限、蓝牙、外放回声、延迟及多平台安装 |
| 旧 Python 对照 | 新实现有真实 HTTP 与本机音频路径；尚未复刻旧 Pipecat / WebRTC 链路，不声称体验等价 |
| 注释约定 | Python 核心方法用 docstring 说明参数、返回和异常；并发、取消、队列与资源释放补充注释 |
