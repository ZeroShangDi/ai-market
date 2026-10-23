# 三个基础包冻结前复查

| 项目 | 结果 |
|---|---|
| 日期 | 2026-10-23 |
| 结论 | 三个已复现阻塞问题均已修复并加入确定性回归；可提交本次代码，真实集成验收边界保留 |
| 操作范围 | 审查后经用户授权修复 chat/work，voice 未修改；未包含用户 next/README.md 修改 |
| 既有测试 | 修复后 chat 12、work 36 全通过；voice 未改，复查时 Python 43、浏览器终端 4 全通过；共 95 项 |
| 验证边界 | 未调用付费模型、真实 Claude CLI 或麦克风/扬声器；通过单测不等于真实集成验收 |

## 已修复问题（保留原复现证据）

| 优先级 | 位置 | 触发与实测结果 | 影响 | 修复方向 |
|---|---|---|---|---|
| P1 | [work/src/main.py](../../packages/work/src/main.py#L445)，_execute 异常处理与 cancel_run | 执行器 run 抛异常；异常处理等待 executor.cancel 时再次调用 cancel_run。返回 status=succeeded、content=''、error_code=None | 实际执行失败被持久化为成功，终态事件也可能误导上层完成任务 | 进入清理前确定失败/中断状态，保护收尾不受再次取消打断；不能用默认 succeeded 进入 finally |
| P1 | [chat/src/main.py](../../packages/chat/src/main.py#L245)，_run finally 与 _cancel | 生成器正常结束，最终 save(completed) 尚未提交时调用 cancel_generation。返回 completed，但存储仍为 running，事件只有 started/delta | 客户端收到虚假完成状态，终态事件缺失；重启后又显示 interrupted | 明确终态提交与取消的先后关系，保护最终保存及终态事件发布，避免清理阶段再次取消 |
| P1 | [chat/src/main.py](../../packages/chat/src/main.py#L190)，发送保存失败后的回滚 | store.save 已提交第一条输入再抛异常；内存回滚后允许发送第二条。存储由 ['first accepted in storage',''] 变为 ['second','reply'] | 存储中已接纳的消息被旧内存快照覆盖，造成历史丢失 | 不确定提交后阻止继续写入，暴露存储故障并要求核对/重建，或实现可靠的提交版本核对 |

## 复现方法

| 场景 | 确定性控制方式 |
|---|---|
| 工作失败清理竞态 | 自定义 Executor.run 立即抛 ValueError；cancel 用 asyncio.Event 标记进入后阻塞；等待标记再调用公开 cancel_run |
| 聊天终态提交竞态 | 内存 Store 对 completed 快照设置 Event 后阻塞，其他保存正常；等待标记后调用公开 cancel_generation，再读取存储和流事件 |
| 聊天不确定提交 | 内存 Store 先 deepcopy 保存快照再抛 OSError，仅失败一次；捕获首次 send_message 的 STORAGE_FAILED，再发送第二条并比较存储 |

## 冻结条件

| 项目 | 要求 |
|---|---|
| 当前阻塞 | 已完成三项修复及回归；失败不误报成功、终态提交不被迟到取消截断、不确定提交后禁止继续覆盖 |
| 契约 | 已同步两包 README 中取消与终态提交、存储异常后的可读/可写状态 |
| 应用期边界 | 应用通过公开接口、注入口和外部编排接入；不能为应用便利直接修改基础包 |
| 真实集成 | 云端 SDK 恢复与真实设备音频仍待验收，不能据本次结果承诺冻结后绝无缺陷；发现包内缺陷需独立评审修复 |
