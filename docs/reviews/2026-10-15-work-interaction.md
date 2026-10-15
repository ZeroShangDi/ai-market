# Work 移动端交互调整验证

本轮为本地代码修改，未提交、未部署、未发布 APK。保留工作区原有 `.gitignore` 和宠物预览脚本修改。

## 已完成验证

- 手机端类型检查通过；最新全量测试 163 项通过。
- agent-service 测试 20 项通过，包含只读查询无高风险批准、真实来源事件、账号隔离、已读序号不覆盖后续结果。
- MobileWorkControllerTest 4 项通过，包含工作列表过滤已删除会话、权限服务故障不被静默隐藏。
- H5 与 App 编译通过；存在项目既有 Sass legacy API 弃用提示。
- 手机尺寸 390 × 844 浏览器检查：精简首页、模式选择、分类添加、工作步骤、底部授权、提问选项、产物及来源、历史面板；选项选中、搜索过滤与底部卡片边界断言通过，无页面运行错误。
- 浏览器使用合成工作接口数据，不访问真实业务，也不代表真实猪肉价格查询或发货操作。

## 预览

- [新会话](assets/work-interaction/empty.png)
- [分类添加](assets/work-interaction/add.png)
- [授权卡片](assets/work-interaction/approval.png)
- [提问卡片](assets/work-interaction/question.png)
- [结果与来源](assets/work-interaction/result.png)

## 待真机与联调

- 后端、agent、手机新版同步部署后检查任务列表、已读、来源事件；旧 agent 不提供新列表接口。
- Android 系统文件选择、取消返回、键盘高度与长问题滚动、产物打开/保存。
- 真机离页后台运行、网络中断后恢复、待处理提醒、完成待查看。
- 组件规划、架构取舍与性能边界见 [Work 交互规划](../modules/work-interaction-plan.md)。
