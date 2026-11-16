# Operator 本轮开发记录

- 参考 DSH Go 的 Android AccessibilityService 行为，将当前屏幕读取、动作结果、暂停/停止边界、敏感操作交回用户、失败退避与摘要记录纳入 Runtime 设计。
- DSH Go 的 Android Shell 保持为独立后续能力，不混入 Operator。
- DSH Go 为 AGPL-3.0，未复制其源码，使用 Android 官方 API 进行同等职责重写。
- 截图、拖拽、按键已加入 Operator 能力声明与原生桥接入口。截图需 Android 30+，普通文字按键仍需输入法桥接。
- 复核 DSH Go 源码目录，确认其 Operator 采用节点动作→可点击祖先→坐标手势的回退顺序，并等待原生手势完成/取消回调。
- 确认其截图使用 Android 30+ takeScreenshot、Android 34+ 窗口截图、安全窗口状态与悬浮控件隐藏。
- 确认其输入通过输入法连接生命周期保护焦点，固定工具目录不随权限变化。

- 按最终验收口径整理为 mobile-control 下的 operator、runtime 和 adapters 三个移动端核心目录，特定软件函数从 runtime 中独立出来。
