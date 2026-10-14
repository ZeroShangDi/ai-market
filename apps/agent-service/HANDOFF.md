# Agent 服务交接（2026-10-14）

所有改动仅在 `apps/agent-service/`，未提交。根任务另有 Java、手机、部署和总交接文档。

## 已实现

- `src/server.js`：内部 HTTP Bearer 身份校验与任务 API。
- `src/validation.js`：UUID、业务 ID、附件、快照、报告和未来带时区日期校验。
- `src/tasks.js`：平台任务持久化、队列、独立后台执行、取消、超时、确认回执、重启明确失败。
- `src/claude.js`：真实 Claude Agent SDK 动态导入、三个自定义 MCP 工具、空内置工具列表、隔离 HOME/配置/环境、流式输入、轮数与费用限制。
- `src/provider.js`：显式 Anthropic／DeepSeek 选择，DeepSeek 固定官方 Anthropic 兼容接口与独立 key，主模型／型号别名映射到 deepseek 模型，禁止任意 URL。不配置 fallbackModel。DeepSeek 不依赖 SDK 的 Claude 费用估算，但保留轮数和执行超时。
- `src/registry.js` 与 `resources/`：版本化客户跟进专家和技能；第二个 document-review 专家增加通用 attachment_metrics 工具，离线验证扩展不改变执行循环。
- `Dockerfile`、`.env.example`、`README.md` 与实际安装生成的 `package-lock.json`。

输入字段 canonical `customer_snapshot`（不接受 `customer` 别名）；协议见 README。服务默认 48082，环境变量与根任务已对齐。业务 ID 均返回字符串。

## 已通过

- `npm run check`。
- `npm test`：23 个测试全部通过，包含真实 HTTP 回环地址测试；沙箱禁止本地监听，因此通过已批准的网络权限运行。
- 实际导入固定 `@anthropic-ai/claude-agent-sdk@0.3.211` / `zod@4.1.12`，创建三个工具和 SDK MCP 服务成功，未调用模型。
- `npm install`：104 个包，审计 0 漏洞，已生成锁文件。
- SDK 自带类型声明证实 `env` 完全替换子进程环境，无 ambient token 继承。
- 使用实际固定 SDK MCP 服务和 in-memory transport 执行 tools/list，验证三个工具的 anthropic/alwaysLoad=true 元数据。ToolSearch 禁用仍可在首轮发现全部工具。
- 重试忽略可信 customer_snapshot 刷新，保留第一次执行的快照；用户指令、客户绑定或附件变化仍返回 409。
- 关闭时等待全部后台任务及持久化写入结束，避免关闭／重启写文件竞态；取消仍防止晚到产物并释放工作槽。
- tenant=0 与现有业务服务对齐且跨租户仍隔离；用户／设备／业务 ID 保留正数。取消后收到已提交业务回执会清理取消摘要和旧错误，回到明确完成语义。
- 提供方默认／非法值／缺对应 key／不串凭据／DeepSeek 官方 URL 与模型映射／待办 UTF-8 3000 字节上限均已离线验证。
- 根任务真实 SDK 本地兼容接口冒烟捕获并修复同名 fallbackModel 初始化错误；现在省略 fallbackModel，避免 SDK 拒绝启动。真实 SDK 冒烟结果由根任务记录。
- 根任务真实 DeepSeek API 虚构资料联调已通过；两个读取工具、报告提交、awaiting_confirmation 和产物读取成功，无真实业务数据库访问。发现并修复快照未提供 notes 时默认补空字符串的问题，增加 HTTP 输入回归测试，专家指令同步明确缺失字段语义。验证记录见 `docs/reviews/2026-10-14-agent-deepseek-validation.md`。

## 剩余

提交前只读审查发现的三个 P2 已修复并回归：初始化仅跳过缺失 task.json 的未提交目录（损坏 JSON 仍失败）；排队取消立即移除 pending；确认先保存副本再更新原 record 的 task，相同已完成回执也重新保存。新增真实文件系统 EISDIR 故障注入，验证首次保存失败不改变内存状态、重试保存成功且重启恢复 completed；新增工作槽忙时反复排队取消和空／临时目录恢复测试。

1. 用户 DeepSeek 配置与真实模型联调已由根任务完成；当前设置 AGENT_PROVIDER=deepseek，DEEPSEEK_API_KEY，AGENT_MODEL 留空或 deepseek-flash。不输出凭据。
2. 与 Java 真实客户和待办数据库、手机确认卡片一起真机验证。根任务离线链路冒烟已成功。
3. Docker 镜像未构建；持久化卷需确保 node 用户可写。
4. 第二专家／工具扩展已离线实证；客户端专家选择入口尚未开放，需补权限和版本校验。
5. 本版明确不自动恢复重启中任务、不支持多实例共享目录；持久化为明文受限权限文件，尚无加密/保留期限管理。
6. 固定 SDK 工具默认延迟加载问题已使用 server-wide alwaysLoad:true 处理并实证；strictMcpConfig:true 限制到指定 MCP。CLI／模型传输已验证，手机与实际业务数据库联合验收仍待完成。

## 快速继续

```sh
cd /Users/v-shangjunhao/MyProject/ai-market/apps/agent-service
npm ci
npm run check
npm test
```

不要读取或打印 `.env.local`。通过根任务配置脚本生成内部令牌并配置正确提供方后，执行 `npm start`。确认／取消竞态已处理：Node 接受已取消且有提案任务的可信已提交业务回执，避免孤立 Java 真实写入；Java 不应给已取消任务创建新待办。
