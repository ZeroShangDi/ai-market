# yudao-module-callphone

Call Phone 产品业务域模块。业务 Controller、Service、DO、Mapper、SQL 与配置放在此模块内；Yudao root/server POM 只负责 Maven 装配。已编写客户列表/跟进/阶段、线索池/分配/转化、PC 外呼派发、手机配对/接受/通话回填、AI 使用记录、加密话术版本和本地知识库等部分页面与接口。各项仍需依照 `docs/contracts/page-implementation-status.md` 完成编译、迁移、授权及端到端核验；其余第三级页面继续逐模块实现。

## 本地接入

1. 新数据库先执行 `src/main/resources/sql/mysql/callphone-outbound-v1.sql`，再按序执行 v2–v28。旧版本库逐项核对后应用缺失的迁移；v2、v7、v8、v13 含 `ALTER TABLE`，重复执行前必须确认目标列不存在，其他建表迁移使用 `IF NOT EXISTS`。
2. 启动服务前，在运行环境配置 `CALLPHONE_PII_ENCRYPTION_KEY`：使用密码管理器或系统安全工具生成 32 字节随机密钥并以 Base64 注入。禁止把密钥写入仓库、日志、安装包或数据库；没有密钥时模块会拒绝启动。
3. 执行 `src/main/resources/sql/mysql/callphone-menu-v1.sql` 创建已实现页面菜单/权限，再在菜单管理为角色分配相应权限。脚本不自动把业务权限授给所有现存角色。
4. 客户、线索、设备、通话、获客渠道及知识库元数据由本模块拥有；知识库文件经 Yudao 文件存储 API 存于客户配置的存储，文本和切片使用 Call Phone AES-GCM 加密。首版只支持最大 5 MiB 的 UTF-8 TXT/Markdown 文件；没有在线配对设备时，真实发起外呼会按设计阻止提交。手机配对/派发/回填仍需在运行中的后端和真机完成联调。

加密使用 AES-256-GCM，每条内容使用独立随机 nonce；密文列包括客户姓名、号码、备注和下一步文本。列表只存/返回遮蔽号码。密钥轮换、密钥备份和历史密文重加密流程尚未实现，生产部署前需要补齐。

- v17 `cp_acquisition_channel` 保存租户内唯一渠道配置，供活码等拓客功能共享归因口径。
- v18 `cp_acquisition_tracking_code` 保存渠道、员工、门店、识客四类活码配置和公开编码。管理接口不会模拟写入扫码/线索事件；真实公开落地与归因事件需要独立完成授权流程后再接入。
- v19 `cp_acquisition_marketing_link` 保存 HTTPS 目标页、来源渠道和 UTM 来源。链接直达目标页并可复制 UTM 参数；Call Phone 的真实访问统计/线索归因仍需公开落地服务及授权流程，不虚报演示统计。
- v20 `cp_acquisition_poster` 保存租户内海报名称、标题、模板和活码绑定，并新增页面权限。当前只管理配置；公开活码落地服务完成前真实模式不导出投放图。
- v21 `callphone-v21-acquisition-analytics-menu.sql` 新增渠道数据页面和读取权限，不增加统计表；汇总 Call Phone 本人线索和本人转化记录，访问量待公开扫码事件接入。
- v22 `callphone-v22-ai-call-summaries.sql` 新增本人通话总结表、菜单和读取/编辑权限。总结字段加密保存；核心 AI 服务接通前仅允许人工整理，不模拟真实 AI 调用。
- v23 `callphone-v23-ai-recommendations.sql` 新增加密跟进建议队列、跟进建议第三级菜单和逐项权限。建议只从本人已复核通话总结的下一步提取；采纳时在同一事务创建待办，不触发消息或外呼。
- v24 `callphone-v24-ai-review-suggestions.sql` 新增加密 AI 建议复核队列、页面菜单与 list/review 权限。记录由用户明确触发的 AI run 写入，页面支持查看来源依据并通过、修改或拒绝；当前不接入 AI 生成服务，也不把提示词或录音写入数据库。
- v25 `callphone-v25-risk-alerts.sql` 新增租户预警规则和加密处置队列、风险预警第三级菜单及 list/scan/resolve/rule-manage 权限。扫描仅查询当前操作人自己的逾期事项和长期未更新客户；不自动通知客户。
- v26 `callphone-v26-service-review.sql` 新增本人已结束通话的结构化服务流程抽检表、服务质检第三级菜单及 list/save 权限。低分说明加密保存；没有录音存储能力时页面不提供音频质检假象。
- v27 `callphone-v27-diagnostics-menu.sql` 新增诊断与日志第三级菜单及页面权限；接口日志复用 Yudao `infra_api_access_log`，角色还需管理员显式分配既有 `infra:api-access-log:query` 查询权。
- v28 `callphone-v28-integrations.sql` 新增企业微信、受保护 AI 服务与私有对象存储的租户连接配置表。服务凭据使用部署密钥加密后保存，响应永不回显；页面配置保存/撤销已接通，provider adapter 尚未接入时连接检测和自动同步保持关闭。
