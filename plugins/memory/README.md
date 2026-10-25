# 记忆接入定义

优先复用官方开源 MCP Memory Server，不自建存储或检索引擎。当前仅登记接入定义，不默认安装、启动或写入用户记忆；未展示成能力中心的已安装项。

[上游 package.json](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/package.json) 当前版本 2.0.0 要求 Node >=24，现有 Agent 镜像为 Node 22，因此正式接入应使用独立兼容运行环境，不静默改变底座镜像。

每个租户/用户必须使用独立进程和 `MEMORY_FILE_PATH`，禁止把共享全局记忆服务直接暴露给所有账号。应用适配层需要记录来源会话/消息、确认时间和用户明确要求记住的内容，并支持查看与删除；不能把助手自述自动写成用户事实。聊天历史继续由现有会话接口检索，无需先导入记忆库。
