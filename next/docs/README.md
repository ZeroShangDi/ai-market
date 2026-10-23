# 项目文档

- [AI 模块契约与实现](../modules/ai/README.md)：多类型资源集合；backend 已提供会话、工作与连续语音，frontend 的组件、页面及状态资源按需交付。

- [开发规则](rules/README.md)：统一在一个文件中按条维护。
- [聊天包契约](../packages/chat/README.md)：六方法 Python 实现，支持外部生成器、插件、配置与存储注入。
- [工作包契约](../packages/work/README.md)：八方法 Python 实现，支持流式事件与显式恢复，mode 可选 OpenAI / Claude SDK，支持后台执行、人工答复及外部存储。
- [聊天与工作公共契约](features/chat-work.contract.md)：外部注入口、跨包关联和宿主责任。
- [迁移说明](migration.md)：新架构的路径、建设范围与最终迁移条件。
- [运行工程说明](containers.md)：`containers` 的含义与工程组织方式。
- [Python 语音基础包](../packages/voice/README.md)：8 个公开接口、HTTP 识别与合成、本机音频采集和播放；真实设备发声待验收。
- [领域边界分析](domain-boundaries-first-pass.md)：外呼闭环的源码依据与迁移建议。
- [早期架构蓝图](architecture/platform-blueprint/README.md)：历史设计资料，当前约束以开发规则为准。

新架构当前以目录骨架与领域分析为主，语音已作为 `packages` 下的 Python 基础包独立实现；尚未迁移业务实现、确定新框架或完成旧工程测试。
