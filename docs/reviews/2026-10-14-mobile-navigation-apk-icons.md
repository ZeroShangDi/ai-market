# 移动端入口与安装包图标兼容性修补

## 反馈与定位边界

用户反馈：安装 2026-10-14 最新 APK 后，点击底栏中间「应用」没有反应；安装前 APK 图标空白，安装后桌面图标正常。

已解包检查 1.0.6 正式 APK：应用广场的注册路由、业务脚本和样式均存在。使用 APK 自带的 Vue 3.4.21 运行时配合替代渲染宿主，可以完成工作台、应用广场与我的页面渲染，无渲染异常。搜索框 v-model 在此运行时受支持，不能将其作为问题原因。

本机未连接 Android 手机，尚未获取故障现场日志，**没有确认「点击无反应」的真机根因**。本次对点击命中与根页面导航进行兼容性修补，不能将构建/模拟验证写成真机问题已解决。

旧包只包含 hdpi 至 xxxhdpi 图标，缺少默认与 mdpi 图标；aapt2 显示 application 图标可解析，但 launchable-activity 的显式图标为空。此配置存在安装前预览兼容性风险，不能仅据此确认特定文件管理器的空白原因。

## 改动

- 工作台、应用、我的及「全部应用」共用根页面导航，使用 reLaunch 重建根页面栈；保留通话未完成保护，阻止重复点击，失败时给出提示。
- 去除底栏外层 pointer-events:none，扩大每项点击区域，并使内部图形与文字的点击命中落在整项入口。
- manifest 补充 mdpi；nativeResources 提供默认 drawable/icon.png；AndroidManifest 为 PandoraEntry 显式配置图标。品牌生成器同步更新默认图标。
- 版本升至 1.0.7（105），便于区分旧包和覆盖安装。

## 产物与验证

产物：`apps/call-phone-uni/dist/release/apk/tongzige-1.0.7-20261014-fix.apk`，24,986,577 字节。

SHA256：`316c05ff64a79a1dbf695f26c5f5bcd6ac661aecb1dc4bcc0f626f54ede67efc`。

本次没有重新提交云端打包。使用已下载并签名的 1.0.6 正式包作为原生材料，在本地更新 App 资源、Android 图标资源及版本，然后重新对齐并用现有个人证书签名。原包保留。

- 类型检查、131 项移动端测试、App/H5 构建通过。
- 使用 APK 自带 Vue 运行时和替代渲染宿主执行编译后的工作台「应用」点击处理器，调用目标为 `/pages/apps/index`；三页无渲染异常。此检查没有覆盖 Android 触摸命中、WebView 切换和真实页面生命周期。
- v1/v2 签名有效，签名证书与原正式包一致；ZIP 完整性与 16 KB ZIP 对齐通过。
- 19 个原生 dex/so 与原正式包逐文件一致；78 个 App 资源与本次编译结果一致（运行时 manifest 沿用原发布配置，仅更新版本）。
- aapt2 能同时解析 application 与 launchable-activity 的图标；默认、mdpi、hdpi、xhdpi、xxhdpi、xxxhdpi 资源存在。
- 尚待真机覆盖安装验证底栏点击、文件管理器/安装器预览，以及配对身份保留。

原生资源合并方式参考：[DCloud 原生 Android 资源配置](https://uniapp.dcloud.io/tutorial/app-nativeresource-android.html)。
