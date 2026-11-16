<template>
  <view v-if="prompt" class="prompt-overlay">
    <view class="prompt-sheet">
      <!-- 审批 -->
      <template v-if="prompt.kind === 'approval'">
        <view class="approval-head">
          <view class="warn-badge">!</view>
          <text class="approval-title">{{ prompt.title }}</text>
          <text class="approval-sub">桌面 Agent 需要你的确认才能继续</text>
        </view>
        <view class="approval-detail">
          <text>{{ prompt.detail }}</text>
        </view>
        <view class="approval-actions">
          <view class="action ghost" :class="{ disabled: busy }" @tap="decide('deny')">拒绝</view>
          <view class="action primary" :class="{ disabled: busy }" @tap="decide('allow')">允许</view>
        </view>
      </template>

      <!-- 选择 / 填空 -->
      <template v-else>
        <view class="step-head">
          <view class="step-copy">
            <text class="step-title">{{ prompt.title }}</text>
            <text class="step-count">第 {{ index + 1 }} / {{ total }} 题</text>
          </view>
          <view class="skip" @tap="skip">跳过</view>
        </view>
        <view class="progress"><view class="progress-bar" :style="{ width: percent + '%' }" /></view>

        <view class="viewport" @touchstart="onTouchStart" @touchend="onTouchEnd">
          <view class="track" :style="{ transform: `translateX(-${index * 100}%)` }">
            <view v-for="question in questions" :key="question.id" class="slide">
              <text class="eyebrow">{{ question.header || (question.options && question.options.length ? '请选择' : '请填写') }}</text>
              <text class="question">{{ question.question }}</text>
              <text v-if="question.detail" class="question-detail">{{ question.detail }}</text>

              <scroll-view v-if="question.options && question.options.length" class="options" scroll-y>
                <view
                  v-for="option in question.options"
                  :key="option.label"
                  class="option"
                  :class="{ active: isSelected(question.id, option.label) }"
                  @tap="choose(question, option.label)"
                >
                  <view class="mark" :class="{ on: isSelected(question.id, option.label), multi: question.multiSelect }">
                    <text v-if="isSelected(question.id, option.label)">✓</text>
                  </view>
                  <view class="option-copy">
                    <text class="option-label">{{ option.label }}</text>
                    <text v-if="option.description" class="option-desc">{{ option.description }}</text>
                  </view>
                </view>
                <input
                  v-model="getDraft(question.id).custom"
                  class="other-input"
                  placeholder="其他回答（可选）"
                  placeholder-class="placeholder"
                />
              </scroll-view>
              <textarea
                v-else
                v-model="getDraft(question.id).custom"
                class="free-input"
                placeholder="输入你的回答"
                placeholder-class="placeholder"
                :maxlength="2000"
              />
            </view>
          </view>
        </view>

        <view class="nav">
          <view class="arrow" :class="{ disabled: index === 0 }" @tap="prev">‹</view>
          <view class="dots">
            <view
              v-for="(question, i) in questions"
              :key="question.id"
              class="dot"
              :class="{ active: i === index, done: i < index }"
              @tap="go(i)"
            />
          </view>
          <view class="next" :class="{ disabled: busy }" @tap="next">
            <text>{{ isLast ? '提交' : '下一题' }}</text>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { closePrompt, promptState } from '@/services/prompt-store';
import type { PromptQuestion } from '@/services/agent-link';

interface Draft {
  selected: string[];
  custom: string;
}

const prompt = computed(() => promptState.current);
const questions = computed<PromptQuestion[]>(() => prompt.value?.questions || []);
const index = ref(0);
const busy = ref(false);
const draft = reactive<Record<string, Draft>>({});
let touchX = 0;

const total = computed(() => Math.max(1, questions.value.length));
const percent = computed(() => ((index.value + 1) / total.value) * 100);
const isLast = computed(() => index.value >= total.value - 1);

watch(
  () => promptState.current?.id,
  () => {
    index.value = 0;
    busy.value = false;
    for (const key of Object.keys(draft)) delete draft[key];
    for (const question of questions.value) {
      draft[question.id] = { selected: [], custom: '' };
    }
  },
  { immediate: true }
);

function getDraft(id: string): Draft {
  if (!draft[id]) draft[id] = { selected: [], custom: '' };
  return draft[id];
}

function isSelected(id: string, label: string) {
  return Boolean(draft[id]?.selected?.includes(label));
}

function choose(question: PromptQuestion, label: string) {
  if (busy.value) return;
  const item = draft[question.id];
  if (!item) return;
  if (question.multiSelect) {
    const position = item.selected.indexOf(label);
    if (position >= 0) item.selected.splice(position, 1);
    else item.selected.push(label);
    return;
  }
  item.selected = [label];
  item.custom = '';
  // 单选完成一个自动切下一个
  if (!isLast.value) {
    setTimeout(() => {
      if (!busy.value) index.value += 1;
    }, 220);
  }
}

function prev() {
  if (index.value > 0) index.value -= 1;
}

function next() {
  if (busy.value) return;
  if (!isLast.value) {
    index.value += 1;
    return;
  }
  void submitAnswers();
}

function go(target: number) {
  if (target >= 0 && target < total.value) index.value = target;
}

function onTouchStart(event: any) {
  touchX = Number(event.touches?.[0]?.clientX || 0);
}

function onTouchEnd(event: any) {
  const end = Number(event.changedTouches?.[0]?.clientX || 0);
  const delta = end - touchX;
  if (Math.abs(delta) < 50) return;
  if (delta > 0) prev();
  else if (!isLast.value) index.value += 1;
}

async function decide(decision: 'allow' | 'deny') {
  if (busy.value || !prompt.value) return;
  busy.value = true;
  try {
    await prompt.value.submit({ decision });
    closePrompt();
    uni.showToast({ title: decision === 'allow' ? '已允许桌面操作' : '已拒绝桌面操作', icon: 'none' });
  } catch {
    uni.showToast({ title: '提交失败，请重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

function collectAnswers() {
  return questions.value.map((question) => {
    const item = draft[question.id] || { selected: [], custom: '' };
    const custom = item.custom.trim();
    return {
      id: question.id,
      selected: [...item.selected],
      ...(custom ? { custom } : {})
    };
  });
}

async function submitAnswers() {
  if (busy.value || !prompt.value) return;
  busy.value = true;
  try {
    await prompt.value.submit({ answers: collectAnswers() });
    closePrompt();
  } catch {
    uni.showToast({ title: '提交失败，请重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function skip() {
  if (busy.value || !prompt.value) return;
  busy.value = true;
  try {
    const answers = questions.value.map((question) => ({ id: question.id, selected: [] as string[] }));
    await prompt.value.submit({ answers });
    closePrompt();
  } catch {
    uni.showToast({ title: '提交失败，请重试', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(16, 24, 40, 0.44);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.prompt-sheet {
  width: 100%;
  max-width: 500px;
  max-height: 84vh;
  background: #fff;
  border-radius: 26px 26px 0 0;
  padding: 22px 20px calc(18px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 -16px 48px rgba(20, 31, 51, 0.18);
}

/* 审批 */
.approval-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  text-align: center;
}
.warn-badge {
  width: 46px;
  height: 46px;
  border-radius: 23px;
  background: #fff4e5;
  color: #f79009;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.approval-title {
  font-size: 19px;
  font-weight: 600;
  color: #1a1f2e;
}
.approval-sub {
  font-size: 12px;
  color: #98a2b3;
}
.approval-detail {
  background: #f6f8fb;
  border-radius: 14px;
  padding: 14px 15px;
  font-size: 13px;
  line-height: 21px;
  color: #5d6a80;
  max-height: 30vh;
  overflow-y: auto;
}
.approval-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.action {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 500;
}
.action.ghost {
  background: #f2f4f8;
  color: #5d6a80;
}
.action.primary {
  background: #294fdb;
  color: #fff;
}
.action.disabled {
  opacity: 0.5;
}

/* 选择 / 填空 */
.step-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.step-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.step-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1f2e;
}
.step-count {
  font-size: 12px;
  color: #98a2b3;
}
.skip {
  font-size: 13px;
  color: #8b95a8;
  padding: 4px 2px;
  flex-shrink: 0;
}
.progress {
  height: 4px;
  border-radius: 2px;
  background: #eef1f6;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 2px;
  background: #294fdb;
  transition: width 0.25s ease;
}
.viewport {
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.track {
  display: flex;
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.slide {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 52vh;
  padding-right: 2px;
}
.eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #294fdb;
  text-transform: uppercase;
}
.question {
  font-size: 16px;
  line-height: 23px;
  color: #1a1f2e;
  font-weight: 500;
}
.question-detail {
  font-size: 12px;
  line-height: 19px;
  color: #8b95a8;
  margin-bottom: 4px;
}
.options {
  flex: 1;
  min-height: 0;
  margin-top: 2px;
}
.option {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 12px 13px;
  border: 1px solid #e9edf4;
  border-radius: 14px;
  background: #fbfcfe;
  margin-bottom: 8px;
}
.option.active {
  border-color: #294fdb;
  background: #eef3ff;
}
.mark {
  width: 20px;
  height: 20px;
  border-radius: 10px;
  border: 1.5px solid #c2c9d6;
  margin-top: 1px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  background: #fff;
}
.mark.multi {
  border-radius: 6px;
}
.mark.on {
  border-color: #294fdb;
  background: #294fdb;
}
.option-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.option-label {
  font-size: 14px;
  line-height: 20px;
  color: #1a1f2e;
}
.option-desc {
  font-size: 12px;
  line-height: 17px;
  color: #8b95a8;
}
.other-input {
  height: 42px;
  padding: 0 13px;
  border: 1px solid #e9edf4;
  border-radius: 13px;
  background: #fbfcfe;
  font-size: 13px;
  color: #1a1f2e;
  margin-bottom: 6px;
}
.free-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 110px;
  margin-top: 4px;
  padding: 12px 13px;
  border: 1px solid #e9edf4;
  border-radius: 14px;
  background: #fbfcfe;
  font-size: 14px;
  line-height: 21px;
  color: #1a1f2e;
}
.placeholder {
  color: #a7b0c0;
}
.nav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}
.arrow {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: #f2f4f8;
  color: #5d6a80;
  font-size: 24px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.arrow.disabled {
  opacity: 0.35;
}
.dots {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: #d5dbe6;
  transition: all 0.2s;
}
.dot.done {
  background: #aebbe0;
}
.dot.active {
  width: 18px;
  background: #294fdb;
}
.next {
  height: 42px;
  padding: 0 20px;
  border-radius: 13px;
  background: #294fdb;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.next.disabled {
  opacity: 0.5;
}
</style>
