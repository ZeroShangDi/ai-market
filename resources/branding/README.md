# 统子哥品牌初版

产品临时名称：统子哥。定位：AI 办公私人助理与提效工具入口。

- tongzige.svg：可编辑 APP 图标，蓝紫背景、白色助理对话形象、薄荷色星点。
- tongzige.png：1024px PNG 原图，由 SVG 渲染。
- ai-chat.png：AI 对话应用图标预览，源为 resources/icons/custom/app-ai.svg。
- 原拨号 APP 图标保留在 resources/icons/custom/app-phone.png，作为拨号应用图标。
- 自定义应用图标通过统一图标注册表调用，保持原色，不套单色主题。

使用 sharp 生成发布图标：

```sh
node resources/branding/build-icons.cjs
node resources/icons/build.mjs
```

sharp 可复用 tools/assets 的可选依赖或已有安装，通过 SHARP_MODULE 指定模块路径。生成命令将 SVG 同步到统一图标目录，并同步 uni 的 src/static 与根 static 两处发布 PNG。名称在 manifest.json、pages.json 与 H5 标题配置；包名与 AppID 保持原有绑定。
