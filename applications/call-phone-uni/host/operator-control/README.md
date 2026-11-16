# Operator 桌面宿主适配（开发中，尚未真机联调）

最底层的纯动作定义在 `../../src/modules/mobile-control/operator/contracts/action.schema.json`：只含 `operation` 和 `arguments`，不接受设备、连接、鉴权、任务、会话、请求编号或调度字段。

```json
{"operation":"click","arguments":{"snapshotId":"snapshot","nodeRef":"n:0.2","expectedPackage":"com.example.app"}}
```

动作包括 observe、click、longClick、setText、scroll、back、home、launchApp、wait。当前控制器仅实现 observe、click、back、home、launchApp，其他动作是预留。snapshotId、nodeRef 和 expectedPackage 属于界面定位与动作前置条件，不属于连接协议。截图参数尚未接入。

设备执行信封单独定义在 `contracts/request.schema.json`：将纯动作放入 action 字段。能力发现使用外层 control: capabilities；连接撤销与取消由外层管理，不属于动作。MCP 是外层入口，底层控制器不接收信封字段。

外层 DeviceSession 处理设备归属、连接代次与权限；DeviceRuntime 使用 Bottleneck 串行执行，默认最小间隔600ms、每分钟40次、最多排队100项，并处理过期与回执。控制器只收到纯动作。固定频率与曲线路径不保证避免平台限制；曲线手势尚未接通手机。

AppAdapters 是软件与版本范围适配注册器，专用函数复用同一动作入口，目前未接入 MCP。PortalTransport 适配独立安装的 Portal；本应用尚未集成原生无障碍服务。统一结果协议、完整动作实现及真机执行确认仍需完善。

该目录仅保留桌面宿主的连接、MCP、调度与 Portal 原型，不是 App 的 Operator，也不再作为独立插件注册。App Operator 位于 ../../src/modules/mobile-control/operator。
