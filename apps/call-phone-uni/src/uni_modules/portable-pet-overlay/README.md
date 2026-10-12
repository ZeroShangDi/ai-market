# portable-pet-overlay

独立 Android UTS/Kotlin 桌宠窗口插件，EasyFloat 2.0.4，Android 23+。复制整个目录到另一 uni-app 的 `src/uni_modules` 即可复用原生层；需原生编译、悬浮窗用户授权、可用前台 Activity。EasyFloat 许可证随目录保留在 LICENSE-EasyFloat。

## API v1

- `getApiVersion()`：Android 为 1，未支持平台为 0。
- `getPermission()`：1 已授权，0 未授权，-1 无法判断。
- `execute(command, payloadJSON, callback)`：主线程执行，回调 JSON `{ok, code, message, visible}`；每个命令至多一次回调。
- `onOverlayEvent(callback)` / `offOverlayEvent()`：每个 JS 运行时注册一次持续回调；事件 `closed`（用户关闭）、`lost`（窗口不可用）、`error`。宿主负责在释放时移除。

命令：`show`、`hide`、`status`、`text`、`settings`、`front`、`dispose`。`show` 参数：`{version:1,imagePath,assetPath,columns,frames:[{cell,duration}],sizeDp,text}`。imagePath 为本地绝对路径；assetPath 为 APK assets 相对路径兜底，不接受 `..`。columns 1–16，frames 1–64，duration 50–60000ms，sizeDp 32–256，text ≤80 字符；图片不超过 8388608 像素。图片各帧等宽，单行，原生缩放为 256×256。

`show` 在 View 已挂载后成功，5 秒未挂载失败；宿主应另设桥接超时。`hide/dispose` 检查实际卸载结果，失败仍保留引用以便重试。`visible` 是应用侧挂载/显示检查，不能证明系统未遮挡、允许锁屏显示或后台进程持续存活。没有前台 Service。

原生层不保存开关偏好、不参与电话/网络/账号逻辑。单窗口单例：多前端不能同时竞争同一窗口；多实例支持需要扩展协议与窗口标识。宿主只能传自己的可信本地素材。

来源：[EasyFloat](https://github.com/princekin-f/EasyFloat/tree/2.0.4)、[UTS Kotlin 混编](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin-hybrid.html)、[UTS 插件配置](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html)。
