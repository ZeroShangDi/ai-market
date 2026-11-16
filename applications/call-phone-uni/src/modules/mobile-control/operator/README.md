# App Operator

手机 App 内的底层观察与动作协议。与 Runtime 分工，桌面 Agent 通过独立 WS 通信层调用。这里不接收设备、账号、任务、会话、请求编号、过期或去重字段。

## 入口

- `contracts/action.schema.json`：纯动作 JSON Schema。
- `actions.mjs`：复用 Ajv 校验并复制参数；多余字段拒绝。
- `index.mjs`：Operator 通用执行器，依赖本地 driver；唯一定位、旧快照、应用、可见可操作、坐标边界检查，密码文字脱敏。
- `native-driver.ts`：本地 Android 桥接，不打开 WS、不启用权限。
- `../../uni_modules/portable-operator/`：按 uni 平台要求放置的 AccessibilityService 与 UTS 源码。
- `controller.mjs`：上一轮 Portal 格式研究适配，保留供旧宿主测试使用；不是 App 新 Operator 的入口。

## 定位

三种 Target，必须且只能选一种：

```json
{"match":{"resourceId":"com.example:id/send","text":"发送"}}
{"snapshotId":"当前快照","nodeRef":"n:0.2"}
{"point":{"x":120,"y":320}}
```

match 是 Android 节点属性的精确 AND 匹配，不是 CSS。匹配多个立即 TARGET_AMBIGUOUS，不取第一个，也不先筛掉隐藏节点后随意选中另一个。节点引用须来自当前快照；屏幕点使用物理屏幕坐标并检查边界。setText 与 scroll 必须定位节点。

## 动作及当前能力

| 动作 | 主要参数 | Android 源码现状（均未编译/真机验证） |
| --- | --- | --- |
| observe | 空对象 | 读取前台应用、版本、显示尺寸、节点与快照 |
| click | expectedPackage、target | 节点 ACTION_CLICK 或坐标手势 |
| longClick | 同上，durationMs 可选 | 节点长按；指定时长时使用手势 |
| setText | expectedPackage、target、text、replace 可选默认 true | ACTION_SET_TEXT，密码目标拒绝 |
| swipe | expectedPackage、from、to、durationMs 可选默认 600 | 连续曲线路径，使用原生完成/取消回调 |
| scroll | expectedPackage、target、direction | 容器单次语义滚动；不承诺像素距离 |
| back/home/recentApps | expectedPackage 可选 | 系统全局动作 |
| launchApp | packageName | 打开可启动软件 |
| screenshot | 空参数 | NativeDriver 已宣告，需 Android 30+ 原生截图回调 |
| pressKey | key | NativeDriver 已宣告，系统返回/主页/最近任务走全局动作，文字键需原生输入法桥接 |
| drag | from、to、durationMs | NativeDriver 已宣告，按连续触摸路径执行 |

Driver 能力列表决定实际可调用动作，不能把 Schema 中的定义都当成已支持。

observe 返回只存在于调用链内的界面数据，不写诊断日志。超过2000个节点或64层时失败，不静默截断出看似完整的快照。

## 返回

统一 `{status, verified:false, data?, error?:{code}}`。

- completed：观察已完成或收到原生手势完成回调。
- dispatched：系统接受节点/全局动作或启动应用，不保证渲染或业务完成。
- failed：校验失败、明确未执行或原生拒绝。
- unknown：执行后断言失败、超时或取消后无法确认效果。禁止自动重放。

verified 固定为 false，业务目标由桌面 Agent 重新观察验证。原生回调不允许把此标记改成 true。Error 不回传原始 exception message、stack、业务内容或路径。

## 仍未完成

原生 Kotlin/UTS 尚未编译，资源合并、服务声明、真机开启、坐标系和机型兼容都需验证。没有自动启动控制、自动授权，也没有连通桌面 WS。生成轨迹带时间采样，但当前 Android Path 执行只保证路径几何与总时长，不保证逐点缓入缓出节奏。截图、按键、拖拽需后续完成。

参考：W3C Actions 的触摸序列与 Appium 手势分类；原生调用按 Android AccessibilityService/AccessibilityNodeInfo 文档实现。没有复制 Portal AGPL 源码，也不把浏览器 DOM、任意 JS repl 带入手机底层。

## DSH Go 对齐项

Operator 只报告原生观察和动作结果。暂停、停止、用户确认、敏感应用规则和后台恢复状态由 Runtime 与外层 WS 共同管理。Operator 不保存屏幕正文、密码或输入文本，也不自动开启无障碍权限。

## DSH Go 源码复核结果

DSH Go 的 `PhoneContracts` 将屏幕快照、目标和动作定义成独立 Kotlin 类型。它使用带屏幕前缀的快照 ID、递增的元素 ID，并要求动作只能引用当前任务实际返回的快照。我们的 `snapshotId + nodeRef` 采用同样的防旧引用原则。

它的点击执行器按三层尝试。先执行节点动作，再向上查找可点击祖先，最后才使用坐标手势。它会等待 `dispatchGesture` 的完成或取消回调，不把“已派发”直接当成动作成功。我们下一步将把祖先回退和 GestureResultCallback 结果统一补到 Operator。

它的截图执行器使用 Android 30+ `takeScreenshot`，Android 34+ 优先窗口截图，低版本使用显示截图。截图前隐藏悬浮控件，截图后恢复。安全窗口返回 secure 状态，不能伪造截图。截图还会限制尺寸并可叠加元素编号。

它的输入实现维护当前输入法连接，只在编辑器仍是同一字段时写入，避免把文字发到失去焦点的输入框。我们的 `setText` 当前只有 AccessibilityNodeInfo 的 ACTION_SET_TEXT，后续按这个输入法连接模型补强。

它的工具目录是固定的，工具名称和 schema 不随权限变化。动作权限不可用时返回可执行的原因。我们保留纯 Operator schema 稳定，能力状态通过 Runtime 结果返回。

### 截图实现状态

`portable-operator` 已加入 Android 30+ `takeScreenshot` 回调、HardwareBuffer 转 Bitmap、JPEG 编码、尺寸和 Base64 回传。截图结果仍标记 `verified:false`，低于 Android 30 或系统截图失败时返回明确错误。
