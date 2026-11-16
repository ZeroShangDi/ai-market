# App Runtime

分工固定：桌面 Agent（思考、推理、规划、验证） → 独立 WS 层 → Runtime → Operator → Android。

## 已有实现

- `index.mjs`：手机本地运行时，复用 Bottleneck 浏览器 light 构建串行执行、600ms 最小间隔、每分钟40次、100项队列上限；可配置。取消排队动作不执行；已开始的原生动作等真实回执，不假称已撤回。不自动重试动作。
- `waitFor`：等待前台应用、节点出现/消失或快照稳定。最多30秒；配额耗尽时仍受超时限制；匹配多个明确失败。等待属于 Runtime，不是底层睡眠动作。
- `gestures.mjs`：复用 bezier-js 生成有边界的曲线路径与时间采样。不是反检测保证；Android 当前不保证逐点时间曲线。
- `apps.mjs`：预置函数注册/发现/调用，复用 semver 匹配版本；核验观察到的实际版本与前台应用，动作重新进入相同 Runtime/Operator。没有内置具体软件业务函数，没有远程源码 eval。
- `calls.mjs`：类似 use_browser 的结构化调用入口，接受 action/apps/invoke/waitFor；与鉴权后的 WS 处理器衔接，不持有连接。连接/任务/路由字段须在外层处理，传入则拒绝。
- `app.ts`：创建本地 Runtime、注册器和 NativeDriver。仅定义工厂，尚未接 App 的 WS 生命周期。

## 调用示例

纯 Operator 点击：

```json
{"operation":"click","arguments":{"expectedPackage":"com.example","target":{"match":{"resourceId":"com.example:id/send"}}}}
```

Runtime 调用（仍不是 WS 连接信封）：

```json
{"operation":"action","action":{"operation":"swipe","arguments":{"expectedPackage":"com.example","from":{"point":{"x":200,"y":600}},"to":{"point":{"x":200,"y":200}},"durationMs":600}}}
{"operation":"apps","packageName":"com.example","version":"1.2.3"}
{"operation":"invoke","id":"example","functionName":"openSearch","packageName":"com.example","version":"1.2.3","args":{}}
{"operation":"waitFor","condition":{"type":"visible","match":{"resourceId":"com.example:id/result"}},"timeoutMs":10000}
```

WS 接收方在既有认证/授权之后剥离连接信封，调用 dispatchRuntimeCall；返回值再由连接层绑定原请求回传。此处不编造尚未核实的现有 WS 路由与认证格式。

## 边界与限制

手机控制逻辑仅在 mobile-control 下的 operator、runtime 和 adapters 三个目录；原生配置和桥接按 uni 构建规则位于 uni_modules/portable-operator，属于 Operator 平台实现。host/operator-control 是上一轮桌面研究原型，不能用其 MCP、Node SQLite 等替代手机实现。

未接桌面 WS，未注册具体 App 函数；Android 源码尚未原生编译或真机验证。只有 JS 层测试和浏览器构建验证，不能视作端到端完成。

只修改新应用 applications/call-phone-uni 内文件。下一步应先验证原生构建，再对接经确认的 WS 接收入口，最后做真实观察→动作→结果验证。

## 本地状态

Runtime 现在提供暂停、继续、停止、最近动作摘要和软件规则。摘要只保存动作名称、状态和时间，不保存屏幕、输入文本、坐标或文件路径。软件规则支持 `normal`、`confirm`、`deny`，规则只在 Runtime 内生效，确认 UI 和 WS 绑定由外层处理。
