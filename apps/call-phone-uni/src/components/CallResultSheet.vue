<template>
  <view v-if="visible" class="scrim"
    ><view class="sheet">
      <text class="sheet-title">通话结果</text>
      <text class="sheet-help">{{
        dialStarted
          ? automaticSuggestion
            ? "已根据通话状态预选结果，如不符可修改。未接通可能是无人接听或拒接。"
            : "请选择实际通话结果，备注可选。"
          : dialUncertain
            ? "未收到拨号插件确认，请检查本机实际通话状态后选择结果。"
            : "拨号未能启动，请记录实际结果。"
      }}</text>
      <view class="choices"
        ><view
          v-for="item in availableOptions"
          :key="item.code"
          class="choice"
          :class="{ selected: chosen === item.code }"
          @tap="choose(item.code)"
          >{{ item.label }}</view
        ></view
      >
      <textarea
        v-model="note"
        class="note"
        placeholder="备注（可选）"
        maxlength="300"
      />
      <text class="sheet-help"
        >挂断后保存即可；未收到结束回调时，保存同时记录本次通话结束。</text
      >
      <button class="submit" :disabled="saving || !chosen" @tap="submit">
        {{ saving ? "保存中…" : "保存结果" }}
      </button>
    </view></view
  >
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { completeCall } from "@/services/calls";
import { messageOf, getSessionVersion } from "@/api/http";
import { resultLabels, toast } from "@/ui/format";
import { suggestCallResult } from "@/services/call-result";
import type { ResultCode } from "@/types/mobile";
const props = defineProps<{
  visible: boolean;
  callId: string;
  startedAt: string;
  dialStarted: boolean;
  dialUncertain?: boolean;
  suggested?: ResultCode;
  durationSeconds?: number;
  recordingPath?: string;
  endedAt?: string;
}>();
const emit = defineEmits<{ (e: "saved", result: ResultCode): void }>();
const options = (Object.keys(resultLabels) as ResultCode[]).map((code) => ({
  code,
  label: resultLabels[code],
}));
const availableOptions = computed(() =>
  props.dialStarted ||
  props.dialUncertain ||
  automaticSuggestion.value === "connected"
    ? options
    : options.filter((item) => item.code !== "connected"),
);
const chosen = ref<ResultCode | "">("");
const note = ref("");
const saving = ref(false);
const automaticSuggestion = computed(() => suggestCallResult(props));
const manuallyChosen = ref(false);
function choose(result: ResultCode) {
  manuallyChosen.value = true;
  chosen.value = result;
}
watch(
  () => [props.callId, props.visible] as const,
  () => {
    if (!props.visible) return;
    manuallyChosen.value = false;
    saving.value = false;
    chosen.value = automaticSuggestion.value || "";
    note.value = "";
  },
  { immediate: true },
);
watch(automaticSuggestion, (value) => {
  if (!manuallyChosen.value) chosen.value = value || "";
});
async function submit() {
  if (!chosen.value || saving.value) return;
  saving.value = true;
  const callId = props.callId,
    session = getSessionVersion(),
    resultCode = chosen.value;
  const current = () =>
    props.callId === callId && session === getSessionVersion();
  try {
    const state = await completeCall(
      props.callId,
      chosen.value,
      props.startedAt,
      props.durationSeconds,
      note.value,
      props.recordingPath,
      props.endedAt,
      true,
    );
    if (!current()) return;
    saving.value = false;
    toast(
      state === "recording_synced"
        ? "通话结果与录音已同步"
        : state === "synced"
          ? "通话结果已保存"
          : state === "mock"
            ? "演示结果已记录；未上传真实录音"
            : state === "recording_pending"
              ? "通话结果已保存；录音上传失败，已保留重试任务"
              : "同步失败，已保留本次结果；请保持应用打开后重试",
    );
    emit("saved", resultCode);
  } catch (e) {
    if (current()) toast(messageOf(e));
  } finally {
    if (current()) saving.value = false;
  }
}
</script>
<style scoped lang="scss">
.scrim {
  position: fixed;
  z-index: 30;
  inset: 0;
  background: rgba(14, 22, 42, 0.42);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: white;
  border-radius: 22px 22px 0 0;
  padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.sheet-title {
  font-size: 19px;
  font-weight: 600;
}
.sheet-help {
  color: #636e82;
  font-size: 12px;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.choice {
  padding: 9px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 16px;
  color: #636e82;
  font-size: 12px;
}
.selected {
  color: #294fdb;
  border-color: #294fdb;
  background: #e8f0ff;
}
.note {
  width: 100%;
  height: 65px;
  padding: 10px;
  background: #f7f8fc;
  border-radius: 10px;
  font-size: 12px;
}
.submit {
  width: 100%;
  background: #294fdb;
  color: white;
  border-radius: 14px;
  font-size: 14px;
}
</style>
