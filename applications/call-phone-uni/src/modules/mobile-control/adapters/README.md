# App Functions

这里存放针对具体软件的预置函数。每个函数必须通过 Runtime 提供的执行上下文调用 Operator 动作，不能直接访问 Android 服务、坐标注入或 WS。

注册条件包括软件包名、版本范围和本地已安装函数。桌面 Agent 只能选择已注册函数，不能上传 JavaScript 或 Kotlin 代码。函数执行前后由 Runtime 检查前台软件和版本，业务是否成功仍由桌面 Agent 观察验证。
