# Work MCP

独立标准 MCP stdio 服务，使用官方 TypeScript SDK。可被 Claude Code、Codex 或其他支持 stdio 的 MCP 客户端连接；无需运行手机 UI，但需配置有效的现有账号和设备凭据。当前不提供新的登录/OAuth 发证流程，也不接收内部服务令牌作为外部身份。

安装：在此目录执行 `npm ci`。启动：`node /绝对路径/plugins/work-control/server.js`。凭据从宿主安全配置或环境变量注入，不写进技能或提交到仓库。

环境变量：`WORK_GATEWAY_URL`（仅 origin，HTTPS 或本地 HTTP）、`WORK_ACCESS_TOKEN`、`WORK_TENANT_ID`、`WORK_DEVICE_ID`、`WORK_DEVICE_KEY`。令牌过期时更新凭据；不会自动重试写入。

通用客户端配置示例（具体配置外壳按客户端要求）：

```json
{"mcpServers":{"work":{"command":"node","args":["/绝对路径/plugins/work-control/server.js"]}}}
```

能力实现位于 `server.js`；语音会话的原话确认、播报和手机授权桥位于 `voice/`，是本应用适配器。二者调用相同工作后端，列表使用与页面相同的网关接口。答复工具通过 MCP elicitation 表单向用户收集答案，不接受模型代填；客户端不支持时保留工作台答复。服务端继续核验用户权限、会话归属、待办绑定与重复答复。

`skills/work-control` 是可单独复制到其他宿主的 Agent Skills 包。协议级互操作由官方 MCP Client 测试；未将尚未进行的真实 Codex/Claude Code 登录联调列为验收完成。
