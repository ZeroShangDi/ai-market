<template>
  <view class="page"
    ><MobileHeader title="登录 Call Phone" /><view class="form">
      <text class="intro">使用与电脑相同的工作区和员工账户登录</text>
      <text>客户侧数据服务地址</text
      ><input
        v-model="serviceUrl"
        placeholder="https://服务域名 或 http://电脑局域网IP:48080"
      />
      <text class="hint"
        >手机上的 127.0.0.1 指向手机本身。请填写手机可访问的地址。</text
      >
      <text>工作区编号</text
      ><input v-model="tenantId" type="number" placeholder="与电脑工作区一致" />
      <text>员工账号</text
      ><input
        v-model="username"
        maxlength="30"
        autocomplete="username"
        placeholder="电脑端登录账号"
      />
      <text>密码</text
      ><input
        v-model="password"
        :password="true"
        maxlength="16"
        placeholder="账户密码"
      />
      <text v-if="failure" class="failure">{{ failure }}</text>
      <button :disabled="busy" @tap="submit">
        {{ busy ? "登录中…" : "登录" }}
      </button>
      <text class="hint"
        >登录令牌与设备密钥只保存在当前进程，退出或重启后需要重新登录与配对。</text
      >
      <button class="verify" :disabled="busy" @tap="openCaptcha">
        完成登录验证
      </button> </view
    ><LoginCaptcha
      :visible="captchaVisible"
      @close="captchaVisible = false"
      @success="verified"
  /></view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import LoginCaptcha from "@/components/LoginCaptcha.vue";
import MobileHeader from "@/components/MobileHeader.vue";
import { connectionSettings, saveConnectionSettings } from "@/config";
import { messageOf } from "@/api/http";
import { login } from "@/services/session";
const captchaVisible = ref(false);
let verification: string | undefined;
const defaults = connectionSettings();
const serviceUrl = ref(defaults.serviceUrl),
  tenantId = ref(defaults.tenantId),
  username = ref(""),
  password = ref(""),
  failure = ref(""),
  busy = ref(false);
onLoad(() => {
  password.value = "";
});
function openCaptcha() {
  try {
    saveConnectionSettings(serviceUrl.value, tenantId.value);
    captchaVisible.value = true;
  } catch (e) {
    failure.value = messageOf(e);
  }
}
function verified(value: string) {
  verification = value;
  captchaVisible.value = false;
  void submit();
}
async function submit() {
  if (busy.value) return;
  failure.value = "";
  if (!username.value.trim() || !password.value) {
    failure.value = "请填写账号和密码";
    return;
  }
  busy.value = true;
  try {
    saveConnectionSettings(serviceUrl.value, tenantId.value);
    await login(username.value.trim(), password.value, verification);
    password.value = "";
    uni.reLaunch({ url: "/pages/mine/index" });
  } catch (e) {
    failure.value = messageOf(e);
    if (/验证码|captcha/i.test(failure.value)) openCaptcha();
  } finally {
    busy.value = false;
    verification = undefined;
  }
}
</script>
<style scoped>
.page {
  min-height: 100vh;
  background: #f7f8fc;
}
.form {
  max-width: 500px;
  margin: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
}
.intro {
  font-size: 16px;
  margin-bottom: 10px;
}
.form input {
  height: 46px;
  padding: 0 12px;
  border: 1px solid #e3e8f2;
  border-radius: 12px;
  background: white;
  font-size: 14px;
}
.form button {
  margin-top: 10px;
  width: 100%;
  background: #294fdb;
  color: white;
  border-radius: 14px;
  font-size: 14px;
}
.hint {
  font-size: 12px;
  color: #636e82;
  line-height: 1.6;
}
.failure {
  color: #c0392b;
}
</style>
