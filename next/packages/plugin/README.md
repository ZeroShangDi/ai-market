# 插件资源读取与 MCP 适配

插件是资源集合；本包不安装插件、不执行技能脚本、不启用 hooks，也不建立第二套审批流程。Python ≥3.11，依赖官方 MCP SDK 2.3.0；连接配置与身份由宿主提供。

## 公开入口

| 入口 | 行为 |
|---|---|
| load_plugin(path) | 读取 portable v1 包，检查基本结构与路径，返回 PluginPackage |
| describe() | 名称、版本、技能、服务、宿主要求及未支持的清单字段；不是激活状态 |
| read_skill(name) | 返回 name/path/frontmatter/body；frontmatter 保留原始 YAML 文本，不部分解释为配置 |
| read_resource(path, binary=False, max_bytes=128000) | 有界读取包内文本或二进制；不执行脚本，不允许路径越界 |
| list_servers() | 返回 id/declaration；声明未受信任，不展开环境变量或读取宿主密钥 |
| connect_tools(client=..., timeout=30, max_tools=128, max_result_bytes=1000000) | 异步上下文，使用宿主已配置的官方客户端发现工具 |
| connection.list_tools() | 返回独立工具目录副本 |
| connection.call_tool(name, arguments, context) | 单次调用；context.cancelled 是 asyncio.Event；无自动重试 |
| connection.close() | 停止接纳、取消进行中的本地调用；底层传输在 owning async with 退出时释放 |
| adapt_tools(connection, namespace=..., tool_factory=...) | 可选 WorkTool 兼容适配；所有工具需要审批，不导入 Work |

旧 PluginPackage/skill/server/open_tools 入口保留兼容；新代码优先使用分离的连接与适配入口。异步上下文必须覆盖后台工作全部生命周期，而非仅覆盖 submit 返回。

## 运行边界

- 工具连接不负责人工审批；Work 必须先通过自身的权限与待办绑定再调用工具。直接调用 call_tool 的宿主自行授权。
- 宿主负责把客户端与声明正确绑定。读取声明不会启动其中命令；超时、认证和环境变量应通过 SDK 配置。
- 发现和调用设置操作超时；连接建立/传输退出沿用 SDK 生命周期和配置，不用跨任务的 wait_for 包裹 SDK 上下文。close 使句柄失效，实际连接释放必须退出上下文。
- 调用前、调用中均响应取消，但本地取消/超时不能证明远端副作用已停止；不自动重试。失败结果抛异常，结果超限报错，不悄悄截断。
- 结果限额检查发生在 SDK 已接收结果之后，不能作为传输内存硬上限；不可信服务仍需要宿主资源隔离。
- 适配到 Work 时暂不支持引用型 schema 和非 object 输入；通用连接保留原始 schema，由使用方校验。技能元数据保留原文，完整规范一致性验证尚未实现。
- 插件目录需由宿主管理，读取期间不得由不可信进程并发替换文件；路径检查不是进程沙箱。

## 验证

从仓库根运行：

```sh
PYTHONDONTWRITEBYTECODE=1 next/packages/voice/.venv/bin/python -B next/packages/plugin/tests/test_plugin.py
```

10 项独立测试通过，使用临时最小插件，不依赖 Mem0：资源读取、路径逃逸、结果大小、适配与失效句柄、审批拒绝、MCP 失败、schema 拒绝，以及调用前/调用中取消。测试自行创建临时目录；真实 MCP 进程、云端账户和多身份并发不由这些测试宣称验收。

2026-10-24：新增资源读取、独立连接、显式 Work 适配；保留旧入口；补调用取消与结果限额，并移除单元测试对外部 Mem0 包的依赖。
