# 复用与证据

- Bottleneck 2.19.5（MIT）：直接依赖，使用 light.js 本地构建，不带 Redis/Node 集群入口。https://github.com/SGrondin/bottleneck
- bezier-js 6.1.4（MIT）：直接依赖，生成曲线几何；不声称能规避平台限制。https://github.com/Pomax/bezierjs
- semver 7.8.6（ISC）：直接依赖，软件函数版本范围匹配。https://github.com/npm/node-semver
- Ajv 8.20.0（MIT）：直接依赖，校验纯动作与 Runtime 调用。https://github.com/ajv-validator/ajv
- W3C WebDriver Actions：借鉴触摸序列语义，不使用其 session 传输。https://www.w3.org/TR/webdriver/#actions
- Appium UiAutomator2：借鉴 swipe/scroll/drag 等动作区分；不是将 Appium 测试服务嵌入手机。https://github.com/appium/appium-uiautomator2-driver/blob/master/docs/android-mobile-gestures.md
- Android 官方：原生服务、节点动作与手势完成回调依据。https://developer.android.com/reference/android/accessibilityservice/AccessibilityService 与 https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo
- Sider：用户提供的两轮实际调用说明与下载目录调研，能确认 use_browser 外层、siderRuntime 动作与站点函数；无法证明原始 WS 帧或黑盒函数实现。我们保留 operator/runtime 两层命名，不宣称是 Sider 源码复刻。
- Portal：此前核查过 local-api 与 GestureController。没有把 AGPL 原生源码复制到本实现。现有 Portal 控制器仅作独立研究适配，App 新实现直接使用 Android 系统 API。

## DSH Go 复核

当前工作区没有发现名为 DSH Go 的独立移动控制实现。找到的 `pd-control` 是桌面 Agent 的 HTTP 控制服务，Agent 通过 `/click`、`/type`、`/key`、`/drag` 和 `/screen` 调用后端，后端用 pyautogui 输入、mss 截图。它是桌面坐标控制参考，不能直接作为 Android 无障碍实现。

## DSH Go 源码与产品实现复核（2026-11-15）

DSH Go 是 AGPL-3.0 的 Android/Dart 项目，手机操控由 Android AccessibilityService 提供。公开文档确认它把屏幕读取、截图、点击、输入、应用启动、暂停、停止和操作确认放在同一条本机引擎链路上。它还提供独立 Android Shell 通道，支持 Shizuku、Sui、root 和自连 ADB。Shell 不应混进 Operator 首版。

可直接借鉴到本 App 的行为包括：

- 手机操控开关与无障碍准备状态分开显示，开启前说明屏幕数据会发给哪个模型。
- 当前屏幕读取单独提供，读取动作本身不自动发送给模型。
- 每一步返回暂停、停止和等待用户确认的状态。
- 密码、验证码、付款、系统设置默认交回用户，敏感 App 可配置不操作或每一步确认。
- 原生动作成功、用户确认、任务完成分别记录，不能把其中一个当成另外两个。
- 无障碍恢复需要明确授权，失败重试采用逐步退避，不能无限重试。
- 最近操作只保存动作摘要，不保存屏幕内容和输入正文。

DSH Go 的 AGPL 代码不能直接复制进本项目。当前采用 Android 官方 AccessibilityService API 重写同样的执行边界，保留 operator/runtime 两层。公开文档是行为参考，未把 DSH 的内部 Dart/Kotlin 类名当作已确认接口。

来源：https://github.com/ccch1mneyyy/dsh-Go/blob/main/docs/guide/zh/04-phone-control.md

### 可迁移的 DSH Go 源码位置

- `phone/PhoneContracts.kt`：快照、目标、Tap、Type、Scroll、Key、坐标手势及结果类型。
- `phone/a11y/Actuator.kt`：节点动作、祖先回退、坐标手势和 GestureResultCallback。
- `phone/a11y/ScreenShooter.kt`：Android 30+ 截图、Android 34+ 窗口截图、安全窗口和悬浮控件隐藏。
- `phone/a11y/FocusInputMethod33.kt`：输入法连接与焦点生命周期检查。
- `phone/PhoneToolCatalog.kt`：固定工具目录与 schema。
- `phone/PhoneTaskDriver.kt`：任务拥有的快照引用、暂停和停止。

这些文件来自 AGPL-3.0 项目，只作为行为与接口研究材料，未复制源码。
