# AI 助手

## 页面

AI 助手下第三级页面：话术助手、知识库、通话总结、跟进建议、人工复核建议、AI 使用记录。

部署边界：话术模板、知识库文档及权限元数据可保存在客户自部署的数据平面；受保护的 AI 推理由产品方核心服务执行。用户触发生成时，客户侧服务只提交必要的文本/字段到产品方 API；摘要、建议与用量记录回写客户自己的数据库。产品方服务不常驻读取客户数据库或录音桶。需要在交互中说明本次云端处理的数据范围。

## 功能与字段

- **话术助手**：话术名称、适用阶段、渠道、标签、正文、变量、版本、发布状态；记录使用/复制次数。
- **知识库**：知识集合、文档名、来源、解析状态、切片数、版本、更新时间、可见团队；支持上传、重新生成切片、停用。来源内容不能当成操作指令。
- **通话总结**：关联通话、生成状态、摘要、重点、客户异议、建议下一步、模型版本、生成时间；摘要须标明 AI 生成并可人工编辑/反馈。
- **跟进建议**：关联客户/通话、建议类型、依据、置信等级、采纳状态、审核人；不会自动改变客户阶段或替用户发送消息。
- **人工复核建议**：待审列表、风险等级、建议内容、原始依据、通过/修改/拒绝及审阅理由。
- **AI 使用记录**：请求人、功能、对象 ID、模型、状态、耗时、token/成本（若服务可提供）、反馈、创建时间；敏感提示词按保留规则受控。

跟进建议首期使用可验证的来源：从本人已复核且含“下一步”的通话总结中提取，明确标记总结来源；此功能暂不称为 AI 生成，直到产品方核心 AI 服务完成接入。

## AI 使用记录首个可交付切片（v14）

- 本地客户数据平面维护 `cp_ai_run` 调用元数据和 `cp_ai_feedback` 用户评分。v14 不存提示词、录音、完整输入或模型原文；反馈自由文本使用 Call Phone AES-GCM 加密。
- `GET /callphone/ai-usage/page` 按当前租户筛选功能、状态、成员和时间范围；`GET /callphone/ai-usage/get?id=` 只返回安全元数据；`POST /callphone/ai-usage/feedback?id=` 仅允许本次调用的发起人提交或更新自己的评分。
- 页面权限：`callphone:ai:usage:list`。AI 推理服务后续在用户明确触发时向客户侧数据平面写入 `cp_ai_run` 元数据；本切片不提供公开写入接口，也不会把 AI 调用输入上传到 SaaS 审计服务。
- 后续 AI 生成功能应复用 `cp_ai_run`，并在对应的产品服务及调用链中补充用户授权、数据最小化和可撤回审计，不能为了填充本页而写入模拟生产记录。

## 通话总结首个可交付切片（v22）

- `cp_call_summary` 保存本人已结束通话的摘要、需求、异议和下一步；正文分别 AES-GCM 加密。通话记录和总结都按当前租户、当前负责人校验，保存使用 `expectedVersion` 做乐观并发检查。
- 管理页可从本人已结束且尚无总结的通话中创建人工总结；保存后为待复核，可再次编辑或确认。编辑后重新置为待复核。查询不按密文姓名检索，只支持通话编号。
- `GET /callphone/ai-call-summary/page`、`GET /available-calls`、`GET /get?callRecordId=`、`POST /save`、`POST /review`。权限为 `callphone:ai:summary:list/edit/review`。
- v22 增加 `cp_call_summary`、通话编号租户唯一索引和页面权限。AI 推理服务未连接前，生成按钮保持禁用；页面内的本地演示样例与真实 AI 输出明确区分。
- AI 生成接入后需在用户点击时从已授权通话读取必要字段、通过产品方核心服务生成，并在客户侧写入结果和 `cp_ai_run` 元数据；不上传录音或常驻访问客户数据库。

## 跟进建议首个可交付切片（v23）

- `cp_ai_recommendation` 保存本人从已复核总结提取的下一步建议。建议正文和驳回原因使用 Call Phone AES-GCM 密文；租户内以通话 ID 与总结版本去重，使用版本号阻止并发覆盖。
- 页面提供“提取待确认→编辑计划与内容→采纳或驳回”的流程。采纳在同一数据库事务内创建 `cp_follow_up_task`，记录通话来源、负责人及截止时间；重复采纳返回既有待办 ID，不会重复创建任务。驳回原因加密保存并保留审核人和时间，可在建议行重新查看。
- 可提取来源限于当前用户本人已结束、客户仍有效、总结已复核且下一步非空的记录；姓名只按当前负责人关系读取，客户/总结/派发等敏感正文不得跨用户返回。
- 接口：`GET /callphone/ai-recommendation/page`（分页状态、通话编号筛选及状态总数）、`GET /available-summaries`、`POST /prepare`、`POST /update`、`POST /adopt`、`POST /dismiss`。`expectedVersion` 用于更新/采纳/驳回并发校验；已采纳命令幂等返回既有 task ID。
- 权限：`callphone:ai:recommendation:list/prepare/edit/adopt/review`。迁移为 v23；核心 AI 服务未连通，因此页面把该首期功能标注为“总结提取”，不写入伪造 AI 来源记录。

## 人工复核建议首个可交付切片（v24）

- `cp_ai_review_suggestion` 保存授权 AI run 返回的单条建议、风险等级、来源通话和依据摘录；建议、依据及复核说明使用 Call Phone AES-GCM 加密。以租户和 `source_run_id` 唯一约束保证重复回调幂等。
- 复核人员可以查看来源、通过、修改后通过或拒绝。修改/拒绝须填写复核说明；提交以 `expectedVersion` 做乐观锁，终态记录不允许再次覆盖。高风险待复核数独立展示；队列按通话负责人过滤，只返回当前用户有权查看的客户和通话。
- API：`GET /callphone/ai-review-suggestion/page`（状态/风险/通话编号、状态统计）、`GET /get?id=`、`POST /review`。权限：`callphone:ai:review-suggestion:list/review`。
- 客户侧 AI 编排在用户显式触发并获得必要授权后调用 `AiReviewSuggestionService.recordModelOutput` 写入客户数据库；不开放匿名写入接口，核心 AI 服务尚未连接时不填充伪造生产建议。
- v24 新建复核队列表、菜单及权限。记录只保留结构化建议和最小依据摘录，不存原始提示词、录音或全量模型输入。

## 话术助手首个可交付切片（v15）

- `cp_ai_script_template` 使用 `template_key + version_no` 保存历史版本；正文 AES-GCM 加密，标签与变量白名单作为 JSON 元数据保存在客户自己的库。
- 仅 `draft` 可编辑。发布前要求该草稿是最新版本；发布时将旧的 `published` 版本标记为 `superseded`，历史正文不覆盖。修改已发布话术需创建下一版本草稿。
- 变量只允许 `customerName`、`ownerName`、`companyName`、`need`、`product`、`objection`。未知 token 拒绝保存；话术预览样例和值替换留在浏览器端。复制必须由用户点击，服务端只记录次数，不会调用发送消息或发起外呼。
- 页面 API：`GET /callphone/ai-script-template/page`、`GET /get?id=`、`POST /save-draft`、`POST /create-version?id=`、`POST /publish?id=`、`POST /record-usage?id=&action=copy`。
- 权限：`callphone:ai:script:list/edit/publish/use`。v15 建表，话术菜单和动作权限在 `callphone-menu-v1.sql`；菜单授权仍需由管理员显式分配角色。
- 前端按当前账号权限分别显示编辑、新建、发布和复制操作；无登录态预览模式保留演示操作。若剪贴板复制成功但使用计数接口失败，页面明确提示“已复制但未记录”，不再弹出误导性的计数成功提示。

## 知识库首个可交付切片（v16）

- `cp_knowledge_base` 保存知识库状态和可见部门 ID；`cp_knowledge_document` 保存文件元数据、SHA-256 去重值、加密解析文本与解析状态；`cp_knowledge_chunk` 保存单独加密的 UTF-8 文本切片。文件实体由当前芋道部署配置的文件存储承载，不上传到 Call Phone 产品方服务。
- 页面支持新建/编辑/启停知识库、查看文档、上传 UTF-8 `.txt`/`.md`、按固定窗口切片、相同内容去重和重新生成切片。首版同步解析，不解析 PDF/Office、不生成向量、不提供检索服务。`teams` 可见范围按当前用户所属的直接部门 ID 限制知识库/文档操作；后续检索仍需沿用这项服务端校验，并保持查询片段留在客户侧直到用户明确触发 AI 功能。
- 上传限制为 5 MiB。文件原文不回显；数据库中的全文和切片使用当前 Call Phone AES-GCM 密钥加密。文件存储成功而数据库事务失败时，文件服务可能遗留孤儿对象，部署侧需配置定期清理或在后续任务队列中增加补偿删除。
- API：`GET /callphone/knowledge-base/page`、`POST /save`、`PUT /status?id=&status=`、`GET /documents?knowledgeBaseId=`、`POST /upload-document?knowledgeBaseId=`（multipart `file`）、`POST /retry-document?id=`（重建切片）。
- 权限：`callphone:ai:knowledge:list/manage/upload/retry`。v16 DDL 在 `callphone-v16-ai-knowledge.sql`；页面和权限项在 `callphone-menu-v1.sql`。团队可见范围由系统部门 ID 保存，关联到 AI 检索的服务端访问过滤仍需在检索能力接入时完成，不以页面筛选代替权限。

## 数据模型

- `cp_knowledge_base(id, tenant_id, name, description, visibility, visible_department_ids_json, status, document_count, chunk_count)`、`cp_knowledge_document(id, tenant_id, knowledge_base_id, source_name, storage_url, checksum, content_ciphertext, parse_status, chunk_count, retry_count)`、`cp_knowledge_chunk(id, tenant_id, knowledge_base_id, document_id, chunk_no, content_ciphertext)`。
- `ai_runs(id, workspace_id, actor_id, feature, source_type, source_id, model_key, prompt_version, status, input_ref, output_json, latency_ms, token_usage_json, error_code, created_at)`。受限原文应放在加密对象存储并保留引用，不把敏感输入无差别复制到审计表。
- `cp_ai_recommendation(id, tenant_id, call_record_id, source_summary_id, source_summary_version, customer_id, owner_user_id, source_summary_origin, content_ciphertext, review_status, review_reason_ciphertext, reviewer_id, reviewed_at, follow_up_task_id, due_at, version)`；租户、用户、来源总结和跟进任务均保留显式关联。
- `ai_feedback(id, workspace_id, ai_run_id, actor_id, rating, reason_code, comment, created_at)`。
- `cp_ai_script_template(id, tenant_id, template_key, version_no, name, stage_code, channel, tags_json, content_ciphertext, variables_json, status, usage_count, copy_count, created_by, published_by, published_at)`。

## API 草案

- `GET /callphone/ai-script-template/page`、`GET /get?id=`、`POST /save-draft`、`POST /create-version?id=`、`POST /publish?id=`、`POST /record-usage?id=&action=copy`。
- 当前页面 API：`GET /callphone/knowledge-base/page`、`POST /save`、`PUT /status`、`GET /documents`、`POST /upload-document`、`POST /retry-document`（见 v16 切片）；面向模块间的稳定契约可进一步统一到 `/api/v1/ai/knowledge-bases`，但不能绕过当前部署的数据与部门权限校验。
- 客户侧 `POST /api/v1/ai/call-summaries`（`call_record_id`，由数据平面读取当前有权访问的通话内容，经用户授权调用产品方核心 API，返回 `run_id/status`）；`GET /api/v1/ai/runs/{id}` 从客户自己的数据库读取结果。
- 跟进建议客户侧接口：`GET /callphone/ai-recommendation/page`、`GET /available-summaries`、`POST /prepare|update|adopt|dismiss`；实际 AI 输出及 run 记录需等核心服务接通后按授权提交。
- `GET /api/v1/ai/recommendations`、`POST /api/v1/ai/recommendations/{id}/review`、`POST /api/v1/ai/runs/{id}/feedback`、`GET /api/v1/ai/usage`。

生成接口采用异步任务，客户端轮询或订阅状态；重复请求使用幂等键。人工复核前不得把高影响建议自动应用到客户、权限、消息或数据删除。
