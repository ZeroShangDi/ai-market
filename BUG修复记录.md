# BUG 修复记录

更新日期：2026-10-05

本文记录本次 CallPhone 后台排查过程中已完成的缺陷修复，便于后续逐页回归。

## 1. 顶部菜单超出后无法点击

- **现象**：顶部菜单项目超出可视区域后，溢出菜单的位置不正确，部分项目无法点击。
- **处理**：限制溢出弹层的位置和高度，使其保持在视口内并可滚动访问。
- **涉及文件**：`apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/layout/components/Menu/src/Menu.vue`

## 2. 后台布局没有复用 RuoYi 顶栏和多标签页

- **现象**：CallPhone 页面，尤其是本地预览入口，仍使用独立的左侧菜单骨架，没有正式后台的顶栏和 TagsView 多标签页。
- **处理**：将默认布局设为顶部混合导航；迁移旧版持久化布局偏好时只替换旧默认值，保留用户其他布局设置。预览入口复用正式 `Layout`，并临时注入预览菜单路由和查询参数，让页面在正式顶栏与多标签页框架中打开。
- **涉及文件**：
  - `apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/utils/layout.ts`
  - `apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/store/modules/app.ts`
  - `apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/views/callphone/preview/Shell.vue`

## 3. 登录失败时加载状态处理异常

- **现象**：登录请求失败后的清理过程可能因 loading 实例尚未创建或已经关闭而再次报错，遮住原始登录错误。
- **处理**：在清理 loading 状态时使用安全关闭方式，避免二次异常覆盖登录错误。
- **涉及文件**：`apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/views/Login/components/LoginForm.vue`

## 4. CallPhone 菜单名称乱码

- **现象**：正式后台中只有 CallPhone 菜单显示为类似 `å®¢æˆ·` 的乱码。
- **原因**：CallPhone 菜单记录在写入数据库时发生字符集错解；前端只是显示数据库返回的名称。
- **处理**：增加限定在 `/callphone` 菜单子树内的 UTF-8 修复 SQL，并将本地 MySQL 与迁移脚本明确设为 UTF-8；修复当前本地数据库中的已有菜单名称。
- **涉及文件**：
  - `apps/ruoyi-vue-pro/compose.local.yml`
  - `apps/ruoyi-vue-pro/script/mysql-init-callphone.sh`
  - `apps/ruoyi-vue-pro/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v41-menu-utf8-repair.sql`

## 5. 线索池列表接口返回 500

- **现象**：新增线索保存成功后，线索池 GET `/callphone/lead/page` 返回业务码 500，页面无法刷新列表。
- **原因**：未分配线索的 `ownerUserId` 是 `null`；负责人列表为空时使用 `Map.of()`，随后执行 `owners.get(null)` 会抛出 `NullPointerException`。
- **处理**：在查询负责人映射前跳过空负责人 ID；线索分配页有相同逻辑，也一并修复。重建并重启本地后端后，用原页面请求复验，接口返回成功且列表有 2 条记录。
- **涉及文件**：`apps/ruoyi-vue-pro/yudao-module-callphone/src/main/java/cn/iocoder/yudao/module/callphone/controller/admin/leads/LeadController.java`

## 6. 线索池接口有数据但表格行不显示

- **现象**：接口返回两条线索，页面底部总数也是 2，但表格没有数据行。
- **原因**：后端的 `createTime` 实际以毫秒时间戳数字返回；日期格式化只按字符串处理，调用 `.replace()` 时抛错，导致 Vue 表格行渲染失败。
- **处理**：扩展已有的日期解析函数，使其同时接受毫秒时间戳和日期字符串。重新加载页面后，两条数据行正常显示，控制台没有新的错误。
- **涉及文件**：`apps/ruoyi-vue-pro/yudao-ui-admin-vue3/src/utils/callphone/time.ts`

## 关于时间处理函数

项目此前已经有 `parseCallPhoneDateTime`，并且多个 CallPhone 页面都在使用它。本次没有另建一套时间工具，而是在原函数上增加数字时间戳支持，以兼容后端实际返回格式。
