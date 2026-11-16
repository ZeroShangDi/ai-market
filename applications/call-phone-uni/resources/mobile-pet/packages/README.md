# 可下载角色包

APK 只携带播放器，不携带这里的视频。`elf` 使用归档精灵图集转换出的 12 个动作；`whale` 保留原有 106 段视频与来源许可说明。两套当前共用 WorkBuddy 交付的铃兰 F 合成音色参考（11.57 秒）；2026-10-19 从第 2 版资源包起使用，第 2 版动作和人物卡沿用；第 3 版起接入 WorkBuddy 完整铃兰人物卡及适配后的交流技能，两套显示资源共用铃兰人设。

每套的 `persona.md`、`skills.md` 是服务端可信风格/交流说明，不是可执行插件，不授予任何工具权限。`scenes.json` 将语音工作状态映射到本套动作；缺失映射回到正常待机。后续增加动作无需更改页面数量。

在项目根目录运行 `apps/voice-service/.venv/bin/python scripts/build-pet-packages.py --version 1`；可用 `FFMPEG` 指定 ffmpeg，需 Pillow、python-dotenv 与已有语音本机配置。输出为忽略目录 `.local/app-update/release/public/pet-resources`。已存在的版本拒绝覆盖；发布新素材需递增版本。参考录音与转写不提交 Git。

目录通过网关独立 `/api/v1/pet-resources` 路由分发，复用现有 app-update 发布目录挂载。语音读取 `VOICE_CHARACTER_ROOT`（默认该本机发布目录）；文字 AI 读取 `AI_CHARACTER_ROOT`（Compose 已配置只读挂载）。Work 服务读取 `AGENT_CHARACTER_ROOT`，Compose 同样挂载该目录。后台任务在开始时保存角色文档快照。同一版本必须在这些服务可见后才对手机开放。

包格式：`catalog.json` 列出包 ID、版本、总字节数、动作数与 manifest SHA-256。manifest 包含每个文件的字节数与 SHA-256、动作及其边界、人物卡/技能/音色描述文件。手机在私有目录暂存、逐项校验，再切换使用；删除当前包关闭桌宠。原生录音和模型仍由语音服务承担，下载音色参考不等于下载模型到手机。

视频沿用 `rgb-alpha-sbs-v1`：H.264 MP4、1280×640，左侧 RGB、右侧灰度 alpha、无音轨。未改为直接透明 WebM，以兼容现有 Android 播放器。
