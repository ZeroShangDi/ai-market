# portable-pet-overlay

独立 Android UTS/Kotlin 桌宠窗口插件，EasyFloat 2.0.4，Android 23+。复制整个目录到另一 uni-app 的 `src/uni_modules` 即可复用原生层；需原生编译、悬浮窗用户授权、可用前台 Activity。EasyFloat 许可证随目录保留在 LICENSE-EasyFloat。

## API v1

- `getApiVersion()`：Android 为 1，未支持平台为 0。
- `getPermission()`：1 已授权，0 未授权，-1 无法判断。
- `execute(command, payloadJSON, callback)`：主线程执行，回调 JSON `{ok, code, message, visible}`；每个命令至多一次回调。
- `onOverlayEvent(callback)` / `offOverlayEvent()`：每个 JS 运行时注册一次持续回调；事件 `closed`（用户关闭）、`lost`（窗口不可用）、`error`。宿主负责在释放时移除。

命令：`show`、`hide`、`status`、`text`、`settings`、`front`、`dispose`。`show` 参数：`{version:1,imagePath,assetPath,columns,rows,frames:[{cell,duration}],sizeDp,text}`。imagePath 为本地绝对路径；assetPath 为 APK assets 相对路径兜底，不接受 `..`。columns 1–16，frames 1–64，duration 50–60000ms，sizeDp 32–256，text ≤80 字符；图片不超过 8388608 像素。rows 默认为 1，支持 1–16 行；图片宽高须分别整除 columns/rows。cell 按行优先编号，原生将每格缩放为 256×256。

`show` 在 View 已挂载后成功，5 秒未挂载失败；宿主应另设桥接超时。`hide/dispose` 检查实际卸载结果，失败仍保留引用以便重试。`visible` 是应用侧挂载/显示检查，不能证明系统未遮挡、允许锁屏显示或后台进程持续存活。没有前台 Service。

原生层不保存开关偏好、不参与电话/网络/账号逻辑。单窗口单例：多前端不能同时竞争同一窗口；多实例支持需要扩展协议与窗口标识。宿主只能传自己的可信本地素材。

来源：[EasyFloat](https://github.com/princekin-f/EasyFloat/tree/2.0.4)、[UTS Kotlin 混编](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin-hybrid.html)、[UTS 插件配置](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html)。

## 动作选择

宿主可追加 `sheets: [{imagePath, assetPath, columns, rows}]` 和 `actions: [{id, label, group, sheet, frames, repeats}]`。sheet 为图集下标，首个动作必须为 `idle`、repeats 为 0，且与顶层默认图集及帧配置一致；其他动作 repeats 为 1–6。最多 8 个图集、24 个动作，动作 id 必须唯一。

长按 650ms 后松开展开菜单，选择动作后播放指定次数并回到待机。移动超过阈值、拖动、取消和多指操作不会触发菜单；菜单展开时禁止拖动，收起后恢复。点击返回 App；关闭桌宠使用 App 内开关。动作按需在后台解码，缓存待机和最多两个其他动作；关闭窗口会取消回调并忽略过期解码结果。播放时不额外施加整体平移、旋转或缩放。

## 当前素材与验证（2026-10-13）

本版暂用三张 v3 PNG 图集，共 12 个动作、72 帧。素材仍有姿态不连续和帧间位置变化，尚未达到流畅度目标，后续逐个替换。替换等规格图集不影响菜单逻辑。

本次改动在 HEAD 基础的隔离副本中通过 76 项 JS 测试及 TypeScript 类型检查。原生手势边界测试通过；PetOverlayNative/PetGesture 使用 Kotlin 1.9.24、Android 8.1 API 和 EasyFloat 2.0.4 完成独立编译检查。此检查不等同于完整 UTS/APK 打包或真机验收。

工作目录的完整 App 构建被现有 `@tdesign/uniapp-chat/chat-message/chat-message.vue` 缺失阻塞。真机仍需确认长按/拖动、多次展开收起、连续切换动作、播放后返回待机、横竖屏边缘位置及关闭后的回调清理。
