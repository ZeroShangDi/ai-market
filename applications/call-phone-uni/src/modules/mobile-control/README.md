# Mobile Control

移动端控制能力统一模块，包含三个目录：

- `operator`：标准控制器和纯动作协议。
- `runtime`：运行时调度、等待、限频、手势策略和调用入口。
- `adapters`：基于标准控制器的特定软件适配函数。

Android 原生无障碍桥接位于 `src/uni_modules/portable-operator`，属于 operator 的平台实现。
