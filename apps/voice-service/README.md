# 独立语音能力（开发中）

宠物长按菜单 → 语音聊天；也可在「我的 → 辅助功能」打开。窗口中开始一次后可以连续多轮对话、静音和结束，不逐句点击。当前仅 Android 前台；离开应用、关闭窗口、身份变更和断网均释放采集与播放，不自动恢复监听。没有声纹录入或声纹门禁，没有长期记忆。

## 边界

- 独立服务使用 Pipecat 1.12.0 管理 VAD、轮次、打断、TTS 取消及上下文聚合。移动端 `modules/voice` 和 `portable-voice` 管理入口、权限、前台 WebRTC 窗口和销毁。宠物只发出 `voice` 动作，不依赖具体语音服务。
- 普通对话直接调用快速模型；`ask_agent` 经可信身份调用现有 Agent 文本接口处理搜索和分析。当前 Agent 接口只读，文件、业务写入和需要授权的执行任务仍进入 Work；不伪称已经执行。插话可取消这条只读请求，不代表撤销任何 Work 操作。
- 关闭/移除语音服务不影响原有文字对话与 Work。ASR、TTS、模型服务仅在此模块内适配。
- ai-assistant 仅作 Qwen 使用经验参考；这里不导入、不修改、不依赖其试听页、缓冲参数或项目路径。

## 运行

Python 3.12；Pipecat 当前音频依赖需要 `audioop`，暂不支持 Python 3.13。

```sh
cd apps/voice-service
uv sync
# 按 .env.example 配置进程环境，不把密钥放进手机构建变量。
uv run --env-file .env.local ai-market-voice
```

服务默认只绑定回环地址。配置独立 HTTPS 域名把 `/` 代理到 48083，并允许设备和服务之间的 WebRTC UDP 媒体流。当前是直接 WebRTC，适合局域网或可互通的专网；尚未配置 STUN/TURN，跨公网 NAT 不能视为已支持。Android WebView 的 WebRTC 负责设备回声消除；外放、蓝牙及不同机型的实际效果需真机验证。

Java 网关设置 `VOICE_PUBLIC_URL`（独立 HTTPS 源，根路径）和相同的 `VOICE_TICKET_SECRET`。复用现有 AI 权限及设备验证签发 60 秒、一次性票据；票据仅在内存和首次页面 fragment 中短暂存在，页面立即清除地址 fragment，不把业务登录令牌发给语音服务。单进程运行，最多四会话，每会话最长 30 分钟；多进程部署前需共享票据重放与容量控制。音频和正文不落盘；关闭第三方管道的正文调试日志。

Mac 本机已配置并通过真实模型与 WebRTC 两轮/打断测试；手机专网 HTTPS 接入已部署，并通过合成配对设备验证票据、证书和媒体连接，实际 Android 使用尚未真机验收。`/health` 仅证明进程可用，不代表模型已经就绪。

## 模型接入

- 快速模型：显式配置 OpenAI-compatible `/chat/completions` 地址、模型与密钥；支持工具调用才能转交 Agent。
- Mac ASR：`qwen-mlx-http` 对接独立 Qwen3-ASR MLX worker；接收内存中的 16kHz 单声道 WAV，按句识别，不保存音频。设置 `QWEN_ASR_*` 后执行 `uv run --env-file .env.local ai-market-qwen-asr`。
- ASR：`openai-http` 使用 `/audio/transcriptions`，由 VAD 按句送入识别。`openai-realtime` 使用兼容 Realtime transcription 的 WebSocket 服务。**尚未实现 Qwen3-ASR 原生流式协议适配，不应把任意 Qwen 服务当作上述协议直接配置。** 第一版须选定真实 ASR 部署后联调。
- TTS：OpenAI-compatible `/audio/speech`，要求返回 `audio/pcm`、`audio/raw` 或 `application/octet-stream`，24kHz、单声道、16-bit little-endian PCM。音色与克隆在服务端配置。输出按句启动、句内分块，尚非逐 token 输入模型。
- Qwen 本机 worker：`uv sync --extra mlx`，设置 `QWEN_TTS_*` 后执行 `uv run --env-file .env.local ai-market-qwen-tts`。默认 `QWEN_TTS_MODE=preset` 配合 CustomVoice 模型及 `QWEN_TTS_SPEAKER=Vivian`，不读取参考音频；只有显式 `clone` 模式才使用参考音频与转写。仅绑定回环，token 对应 `VOICE_TTS_API_KEY`。Apple Silicon MLX 生成在线程内串行运行；断开后在下个生成块协作停止，不强杀 GPU 调用。单次合成按句切为最多 120 字，限制生成长度；每个 MLX worker 默认最多缓存 128MiB 空闲显存，并在每轮后清理缓存。分块 0.3 秒只是可调起点，不是延迟承诺；单样本性能见 [Mac 验证记录](../../docs/reviews/2026-10-17-pet-voice-mac.md)，仍需更多实测。

## 检查

```sh
PYTHONPATH=. uv run python -m unittest discover -s tests -v
# 允许本机 UDP 时，另启真实 WebRTC 握手/断开测试：
VOICE_TEST_NETWORK=1 PYTHONPATH=. uv run python -m unittest discover -s tests -v
```

测试覆盖签名与过期/重放、可信身份、Agent 流完整性、PCM 分块、管道构造等；它们不等于真实麦克风、模型识别率或机宠外放验收。移动端新增原生模块后需要重新云端打包，旧安装包无法提供语音窗口。

## 本机 Mac 联调

本地 `.env.local` 可指向已有模型缓存；模型、参考音频和密钥均为忽略文件。安装 MLX extra 后运行：

```sh
.venv/bin/python scripts/run-mac.py
```

该进程同时管理 ASR（48085）、TTS（48084）、语音服务（48083）和本机只读 Agent（48086），退出时一起释放。本机只读 Agent 复用相邻 agent-service 的配置与执行代码，不启动 Work 存储；已有可达 Agent 时设置 `VOICE_LOCAL_AGENT=false` 并调整服务地址。生成只供本机开发的 60 秒入口：

```sh
.venv/bin/python scripts/local-session.py
```

浏览器通过 localhost 安全上下文访问并允许麦克风，本次手机网关已配置专网 HTTPS 票据入口，电脑和手机须同时连接原有 Tailscale 专网。开发入口使用固定的合成开发身份，仅供本机只读对话测试，不能作为生产登录或业务操作授权。


## 手机气泡

最终用户转写经独立事件返回；回复在 TTS 开始播报该句时返回句子事件，Android 语音窗口通过受限桥接交给宿主，再由宿主调用现有宠物文字接口。气泡区分「你：」「她：」，超过 80 字符显示最近内容；关闭会话即清空，不写日志或历史。语音模块仍不直接依赖宠物实现。

`smoke-mobile-session.py` 用合成设备检查已部署网关票据、HTTPS 证书、实际 WebRTC 和重放拒绝，结束撤销合成设备；`stability-tts.py` 连续合成并用 ASR 回测合成文本，只是生成漂移检查，不能替代用户听感验收。


## 语音交办后台任务

Android 宿主支持任务确认桥时，快速模型可调用 `propose_task` 提案；宿主显示原生确认窗口，用户点击创建后调用现有手机鉴权的 AI/Work API。独立只读 Agent 实例仍只处理查询，真正后台工作由已有 Work 服务执行，不在 Mac 语音进程内启动执行器。

任务与音频会话生命周期独立。完成通知经宿主从 Work 拉取，语音数据通道只传递展示/播报内容，不承载任务执行或工具批准。语音等对话空档播报；结果持久化和未读仍由 Work 管理。Android 新桥接需要新 APK；普通浏览器没有此桥时不开放创建任务工具。已有语音空闲/总会话超时不变。

部署还需启用现有 Work 服务，并使其 `AGENT_CHARACTER_ROOT` 与语音/AI 的角色目录版本一致。详见 [验证记录](../../docs/reviews/2026-10-18-voice-background-work.md)。
