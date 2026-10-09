<template>
  <view v-if="visible" class="scrim"
    ><view class="challenge">
      <text class="title">登录验证</text
      ><text class="hint">拖动滑块，让拼图与缺口对齐</text>
      <view
        v-if="image"
        class="picture"
        :style="{ width: width + 'px', height: height + 'px' }"
      >
        <image
          class="background"
          :src="'data:image/png;base64,' + image"
          :style="{ width: width + 'px', height: height + 'px' }"
        />
        <image
          class="piece"
          :src="'data:image/png;base64,' + piece"
          :style="{
            left: (position * width) / 310 + 'px',
            width: (47 * width) / 310 + 'px',
            height: height + 'px',
          }"
        />
      </view>
      <slider
        :value="position"
        :min="0"
        :max="263"
        :step="1"
        :disabled="busy || !image"
        activeColor="#294fdb"
        @changing="position = $event.detail.value"
        @change="check($event.detail.value)"
      />
      <text class="hint">{{ feedback }}</text
      ><button :disabled="busy" @tap="refresh">换一张</button
      ><button :disabled="busy" @tap="$emit('close')">取消</button>
    </view></view
  >
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import CryptoJS from "crypto-js";
import { captchaRequest, messageOf } from "@/api/http";
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (event: "success", verification: string): void;
  (event: "close"): void;
}>();
const width = Math.min(310, uni.getSystemInfoSync().windowWidth - 48),
  height = width / 2;
const image = ref(""),
  piece = ref(""),
  position = ref(0),
  busy = ref(false),
  feedback = ref("");
let token = "",
  secretKey = "",
  generation = 0;
function encrypt(text: string) {
  return secretKey
    ? CryptoJS.AES.encrypt(
        CryptoJS.enc.Utf8.parse(text),
        CryptoJS.enc.Utf8.parse(secretKey),
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
      ).toString()
    : text;
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) void refresh();
    else {
      generation++;
      image.value = "";
      piece.value = "";
      token = "";
      secretKey = "";
      busy.value = false;
    }
  },
);
async function refresh() {
  const version = ++generation;
  busy.value = true;
  image.value = "";
  piece.value = "";
  feedback.value = "加载验证图片…";
  position.value = 0;
  try {
    const result = await captchaRequest<{
      originalImageBase64: string;
      jigsawImageBase64: string;
      token: string;
      secretKey?: string;
    }>("get", { captchaType: "blockPuzzle" });
    if (version !== generation) return;
    image.value = result.originalImageBase64;
    piece.value = result.jigsawImageBase64;
    token = result.token;
    secretKey = result.secretKey || "";
    feedback.value = "";
  } catch (e) {
    if (version === generation) feedback.value = messageOf(e);
  } finally {
    if (version === generation) busy.value = false;
  }
}
async function check(x: number) {
  if (busy.value || !token) return;
  const version = generation;
  busy.value = true;
  position.value = x;
  const point = JSON.stringify({ x, y: 5.0 });
  try {
    await captchaRequest("check", {
      captchaType: "blockPuzzle",
      token,
      pointJson: encrypt(point),
    });
    if (version === generation) emit("success", encrypt(token + "---" + point));
  } catch (e) {
    if (version === generation) {
      feedback.value = messageOf(e);
      await refresh();
    }
  } finally {
    if (version === generation) busy.value = false;
  }
}
</script>
<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(14, 22, 42, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
}
.challenge {
  padding: 20px;
  background: white;
  border-radius: 18px;
  max-width: calc(100vw - 16px);
}
.title,
.hint {
  display: block;
  margin-bottom: 12px;
}
.title {
  font-size: 18px;
}
.hint {
  font-size: 12px;
  color: #636e82;
}
.picture {
  position: relative;
  overflow: hidden;
}
.background {
  display: block;
}
.piece {
  position: absolute;
  top: 0;
}
.challenge button {
  font-size: 13px;
  margin-top: 8px;
}
</style>
