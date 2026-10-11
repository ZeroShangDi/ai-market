# App 桌面图标

使用用户确认的原项目 `CallPhoneApp/static/phone/phone.png`，蓝绿色背景、白色电话图案。source.png 保留原始素材，各尺寸仅作缩放，未修改图案。

发布图标在 manifest.json 的 app-plus.distribute.icons 中配置，文件随源码保存，避免依赖缺失的 unpackage/res/icons。

CLI 工程云打包还需要项目根目录 static/app-icons 的同名 PNG 副本；修改时须同步。只存在 src 下会导致 HBuilderX 报文件不存在。
