/**
 * 全局交互监听：审批、单选/多选、填空都推给 PromptHost 弹层。
 * 无论当前在哪个页面，只要配对 Agent 有 pending 交互就显示。
 */
import {
  answerQuestion,
  decideApproval,
  fetchMessages,
  loadBindings,
  type AgentLinkBinding,
  type PromptQuestion,
  type RemoteMessage
} from './agent-link';
import { openPrompt, promptState } from './prompt-store';

const handled = new Set<string>();
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

export function startApprovalWatcher() {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), 3000);
}

export function stopApprovalWatcher() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

async function tick() {
  if (running || promptState.current) return;
  running = true;
  try {
    for (const binding of loadBindings()) {
      let page: { messages?: RemoteMessage[] };
      try {
        page = await fetchMessages(binding, 0);
      } catch {
        continue;
      }
      const rows = page.messages || [];
      const approvalResolved = new Set(
        rows.filter((item) => item.type === 'approval-result' && item.approvalId).map((item) => item.approvalId as string)
      );
      const approval = rows.find(
        (item) =>
          item.type === 'approval' &&
          item.status === 'pending' &&
          item.approvalId &&
          !approvalResolved.has(item.approvalId) &&
          !handled.has(item.approvalId)
      );
      if (approval?.approvalId) {
        showApproval(binding, approval);
        break;
      }

      const questionResolved = new Set(
        rows.filter((item) => item.type === 'question-result' && item.requestId).map((item) => item.requestId as string)
      );
      const question = rows.find(
        (item) =>
          item.type === 'question' &&
          item.status === 'pending' &&
          item.requestId &&
          !questionResolved.has(item.requestId) &&
          !handled.has(item.requestId)
      );
      if (question?.requestId) {
        showQuestion(binding, question);
        break;
      }
    }
  } finally {
    running = false;
  }
}

function showApproval(binding: AgentLinkBinding, message: RemoteMessage) {
  const approvalId = message.approvalId as string;
  handled.add(approvalId);
  const reason = String(message.reason || message.title || '需要批准的操作');
  openPrompt({
    id: approvalId,
    kind: 'approval',
    title: '需要批准',
    detail: reason.length > 300 ? `${reason.slice(0, 300)}…` : reason,
    submit: async ({ decision }) => {
      try {
        await decideApproval(binding, approvalId, decision || 'deny');
      } catch (error) {
        handled.delete(approvalId);
        throw error;
      }
    }
  });
}

function showQuestion(binding: AgentLinkBinding, message: RemoteMessage) {
  const requestId = message.requestId as string;
  const questions = (message.questions || []) as PromptQuestion[];
  handled.add(requestId);
  openPrompt({
    id: requestId,
    kind: questions.some((item) => item.options && item.options.length) ? 'choice' : 'input',
    title: message.title || '需要你确认',
    questions,
    submit: async ({ answers }) => {
      try {
        await answerQuestion(binding, requestId, answers || []);
      } catch (error) {
        handled.delete(requestId);
        throw error;
      }
    }
  });
}
