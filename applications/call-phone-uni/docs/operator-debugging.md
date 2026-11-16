# 无障碍（Operator）调试与授权恢复

本文只针对开发调试，不改变生产构建的无障碍授权策略。当前 App 的无障碍执行器位于 `src/uni_modules/portable-operator`，本地动作入口是 `src/modules/mobile-control/operator`。调试工具为 [scripts/operator-debug.mjs](../scripts/operator-debug.mjs)。

## 结论

- **授权为什么会失效**：HBuilderX 的“运行”会 force-stop 应用；MIUI 在 force-stop 时把 `enabled_accessibility_services` 清空。不是 App 代码关闭服务，也不是 `OperatorService` 崩溃。
- **能不能解决**：开发阶段可以。打开手机开发者选项的“USB 调试（安全设置）”后，ADB 能写回无障碍设置；`enable` / `watch` 已实测可在每次 force-stop 后自动恢复。只靠 App 自己不能绕过系统授权，正式用户仍需手动开启。
- **怎么调试**：无线 ADB + WebView DevTools 可以真实触摸 App 的“检查无障碍读取”按钮并读取结果；`uiautomator` 树和 logcat 用于对照。当前没有把逻辑层 Operator 暴露成 CDP 全局对象，原因是 uni-app 的逻辑层和页面视图层分离，直接注入 `window` 不会进入 App 业务上下文。

## 现场确认

本机小米 M2011K2C（Android 12 / MIUI 13）实测：

```sh
adb shell settings get secure enabled_accessibility_services
# uni.UNID608100/dev.appoperator.OperatorService

adb shell am force-stop uni.UNID608100
adb shell settings get secure enabled_accessibility_services
# null
```

打开“USB 调试（安全设置）”后执行 `node scripts/operator-debug.mjs enable`，设置被写回，`dumpsys accessibility` 显示“手机操作助手”重新绑定。未打开该开关时，MIUI 会拒绝：

```text
java.lang.SecurityException: Permission denial: writing to settings requires:
android.permission.WRITE_SECURE_SETTINGS
```

这是 MIUI 对 ADB shell 的限制，不是 App 缺少权限声明。

## 工具命令

在 `applications/call-phone-uni` 下执行：

```sh
# 设备、版本、无障碍设置/绑定、WebView 调试状态
node scripts/operator-debug.mjs status

# 尝试恢复无障碍；已开启时直接返回
node scripts/operator-debug.mjs enable

# 常驻监听：force-stop 后自动恢复（需要“USB 调试（安全设置）”）
node scripts/operator-debug.mjs watch

# 真机自检：通过 CDP 触摸“检查无障碍读取”，读取节点数/错误码
node scripts/operator-debug.mjs test

# 读取系统 uiautomator 树，和 Operator 快照对照
node scripts/operator-debug.mjs tree

# 只看 Operator/无障碍相关 logcat
node scripts/operator-debug.mjs logs
```

`--device <serial>` 指定设备；默认取第一个已授权无线 ADB 设备。`test --json` 返回结构化结果；UI 树默认写入忽略提交的 `.local/`。

## CDP 自检的工作方式

`test` 会：

1. 用 `adb shell pidof` 找到 App 进程，确认存在 `@webview_devtools_remote_<pid>`；
2. `adb forward tcp:0` 把 DevTools socket 映射到本机回环端口；
3. 在 `/json` 目标中找到权限页；
4. 在页面里找到“检查无障碍读取”按钮，滚动到可见位置；
5. 用 CDP `Input.dispatchTouchEvent` 发送真实触摸（MIUI 默认拒绝 `adb shell input tap`，但 CDP 触摸可用）；
6. 读取按钮下方结果，例如“读取成功 · 58 个节点”或“读取失败 · ACCESSIBILITY_UNAVAILABLE”。

这一步实际调用的是 App 现有的 `NativeDriver` / `Operator` 路径，不是 mock。按钮本身只做 observe，不执行点击、输入等有副作用的动作。

## 为什么没有直接调用 observe/action

uni-app App-plus 的逻辑层与页面视图层不是同一个 JS 上下文。CDP 连接的是页面视图层，`window` 上注入的函数不会自动进入 `App.vue` / `Operator` 所在的逻辑层；实测在视图层写 `window.__TZ_OPERATOR__` 后，页面导航/重启都不会出现在业务上下文。因此本工具没有提供“CDP 直接执行任意动作”的入口，避免把未验证能力写成已接通。

要测试 click/setText/swipe 等动作，下一步应在**逻辑层**增加受控调试入口，二选一：

- App 内隐藏的开发者页面：按钮/JSON 输入调用 `Operator.execute`，页面只在开发构建显示；
- 复用已鉴权的手机宿主连接：桌面下发动作、手机执行并回传，这属于 mobile-execution v1 的正式路线，不能绕过现有配对与审批。

这两项都未在本次实现，不能声称手机已能由桌面 Agent 远程执行动作。

## 推荐的日常流程

### 已打开“USB 调试（安全设置）”

1. 终端运行 `node scripts/operator-debug.mjs watch`。
2. HBuilderX 正常“运行”或重装自定义基座；`watch` 检测到设置被清空后自动写回。
3. 用 `test` 验证 observe，用 `tree`/`logs` 定位差异。

### 暂时不改手机安全设置

1. HBuilderX 运行一次，手动在系统无障碍设置开启“手机操作助手”。
2. 之后只保存 JS/Vue 文件触发热更新，不反复点“运行”。
3. 必须重启原生基座时，再手动开启一次。

只改页面资源、不改原生插件时，优先用热更新。原生插件（Kotlin/UTS）变更必须重启基座，无法避免 force-stop。

## 常见问题

- `enable` 提示 `SecurityException`：打开“USB 调试（安全设置）”（部分版本写作“允许通过 USB 调试修改权限或模拟点击”）。
- `test` 提示无法打开权限页：先在 App 中手动进入“我的 → 权限设置”，再重试。
- `test` 提示 DevTools 不可用：确认使用调试基座、App 正在运行、不是 release 包；生产包关闭 WebView 调试。
- `uiautomator dump` 与 Operator 快照节点数不同：读取路径不同，WebView/系统窗口可见性判断也可能不同；以 Operator 的 `snapshotId` 和按钮自检结果为准，`tree` 只用于对照。
- 截图/日志可能包含屏幕内容或业务信息：只保存在本机 `.local/`，不要提交或上传。

## 本机验证记录（2026-11-16）

- `am force-stop uni.UNID608100` 后，`enabled_accessibility_services` 从组件值变为 `null`，复现授权丢失。
- 打开“USB 调试（安全设置）”后，`enable` 写回设置并验证 `Bound services` 已包含“手机操作助手”。
- `test` 的 CDP 触摸回退路径实测返回“读取成功 · 58 个节点”等真实节点数；不是 mock。
- 未实现逻辑层动作调试入口，未宣称任意动作/桌面远程执行已接通。

## 边界

- 自动恢复依赖 ADB 和手机开发者选项，不是普通用户的生产方案；正式用户仍需在系统设置中手动授权。
- 未开启“USB 调试（安全设置）”时，ADB 不能写无障碍设置，也不能用 `input tap`；App 不能绕过该限制。
- 自检只读；不记录屏幕正文、输入文字、客户号码或原始文件路径。
