# 统子哥 App 桌面图标

产品临时更名为「统子哥」，定位为 AI 办公私人助理和提效工具入口。当前桌面图标为蓝紫背景的助理对话形象，源文件在 resources/branding/tongzige.svg；source.png 与各尺寸由该源生成。

原项目 CallPhoneApp/static/phone/phone.png 的蓝绿拨号图标已完整保留在 resources/icons/custom/app-phone.png，用于应用广场和工作台中的拨号应用，不再作为整个产品的桌面图标。

发布图标在 manifest.json 的 app-plus.distribute.icons 中配置，文件随源码保存，避免依赖缺失的 unpackage/res/icons。

CLI 工程云打包还需要项目根目录 static/app-icons 的同名 PNG 副本；修改时须同步。只存在 src 下会导致 HBuilderX 报文件不存在。

再生成命令：node resources/branding/build-icons.cjs（项目根执行，需 sharp；可通过 SHARP_MODULE 指向已有安装）。该命令同步两处发布图标，不修改 AppID、包名、版本号或插件绑定。桌面名称和图标变更需重新生成安装包才能在真机生效。
