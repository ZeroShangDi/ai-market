import type { ChatStreamEvent, ChatTransport } from '@/types/ai-chat';

let serial = 0;
export function previewId() { return `${Date.now()}${String(++serial).padStart(6, '0')}`; }
export function previewRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function answerFor(content: string) {
  if (/话术|跟进|开场|沟通/.test(content) && !/计划|安排|今天|工作/.test(content)) return `可以先用一段简短、自然的开场，给客户一个容易回答的问题。\n\n### 跟进话术示例\n\n您好，上次聊到的方案我又梳理了一下。想了解一下，您目前更关注**使用效果、落地时间，还是预算**？我可以按您关心的部分做一个简短说明。\n\n### 下一步怎么接\n\n- **关注效果**：先问具体场景，再提供对应案例。\n- **关注预算**：确认需求范围，再讨论方案选择。\n- **暂时没空**：约一个方便的时间，避免连续追问。\n\n这是一段通用演示话术，你可以继续补充沟通场景。`;
  if (/客户|分析|总结/.test(content) && !/计划|安排|今天|工作/.test(content)) return `可以从三个方面整理客户情况。\n\n### 1. 当前需求\n\n客户想解决什么问题？哪些需求已经确认，哪些还需要进一步沟通？\n\n### 2. 决策条件\n\n关注**预算、时间和参与决策的人**，不要仅凭一次沟通判断意向。\n\n### 3. 下一步行动\n\n| 需要确认 | 建议动作 |\n| --- | --- |\n| 需求还不清楚 | 约一次简短需求沟通 |\n| 正在比较方案 | 提供针对性的方案说明 |\n| 暂无明确时间 | 约定下一次联系时间 |\n\n以上是演示分析框架，尚未读取任何真实客户资料。`;
  if (/计划|安排|今天|工作/.test(content)) return `可以把今天的工作分成三段，先处理最需要推进的事项。\n\n### 今日安排示例\n\n1. **先回顾**：整理待跟进事项，确认每项的下一步。\n2. **集中沟通**：优先联系已约好时间、需求明确的客户。\n3. **收尾记录**：补齐沟通结果，安排下一次跟进。\n\n建议每项任务都写清楚「联系谁、确认什么、何时完成」，比只列客户名单更容易执行。\n\n这是一份通用演示计划，不代表你的实际待办。`;
  return `收到。当前是**页面演示模式**，这条回复用于预览排版和逐字输出效果。\n\n你可以试试：\n\n- 帮我写一段客户跟进话术\n- 如何分析客户的当前意向？\n- 帮我安排今天的跟进工作\n\n也可以继续追问，体验多轮消息、停止生成和会话切换。真实 AI 接入后，这里会根据你的问题生成回复。`;
}

/** No network or storage access. Emits the same event shapes as the proposed SSE contract. */
export const previewChatTransport: ChatTransport = {
  stream(request, onEvent) {
    const userId = previewId(), assistantId = request.retry_of || previewId();
    const characters = Array.from(answerFor(request.content));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0, offset = 0, content = '', terminal = false;
    const emit = (payload: Record<string, unknown>) => onEvent({
      request_id: request.request_id, conversation_id: request.conversation_id,
      sequence: ++sequence, ...payload,
    } as ChatStreamEvent);
    const finish = (reason: 'stop' | 'cancelled') => {
      if (terminal) return;
      terminal = true;
      clearTimeout(timer);
      emit({ type: 'completed', assistant_message_id: assistantId, content, finish_reason: reason });
    };
    const tick = () => {
      if (terminal) return;
      const delta = characters.slice(offset, offset + 5).join('');
      offset += 5;
      content += delta;
      emit({ type: 'delta', assistant_message_id: assistantId, delta });
      if (offset >= characters.length) finish('stop');
      else timer = setTimeout(tick, 45);
    };
    timer = setTimeout(() => {
      if (terminal) return;
      emit({ type: 'started', user_message_id: userId, assistant_message_id: assistantId });
      timer = setTimeout(tick, 240);
    }, 180);
    return { cancel: () => finish('cancelled') };
  },
};
