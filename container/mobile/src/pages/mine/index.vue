<template><view class="page"><view class="wrap"><MobileHeader title="我的"/><view class="license"><text class="edition">{{ session.identity?.user.nickname || '未登录' }}</text><text>{{ session.identity?'账户已连接':'登录后管理账户与公共服务' }}</text><text>Container</text></view><view class="setting" @tap="go('/pages/account/index')"><view class="setting-icon"><AppIcon name="user" :size="21" color="#294fdb"/></view><view class="setting-text"><text>账户与连接</text><text>账户、服务器与工作区</text></view><AppIcon name="chevron-right" :size="18" color="#8791a4"/></view><view class="setting" @tap="go('/pages/config/index')"><view class="setting-icon"><AppIcon name="settings" :size="21" color="#294fdb"/></view><view class="setting-text"><text>公共配置</text><text>读取服务端公开参数</text></view><AppIcon name="chevron-right" :size="18" color="#8791a4"/></view><!-- #ifdef APP-PLUS --><AppUpdateRow/><!-- #endif --><DiagnosticLogs/></view><TabBar current="mine"/></view></template>
<script setup lang="ts">import MobileHeader from '@/components/MobileHeader.vue';import TabBar from '@/components/TabBar.vue';import AppIcon from '@/components/AppIcon.vue';import AppUpdateRow from '@/components/AppUpdateRow.vue';import DiagnosticLogs from '@/components/DiagnosticLogs.vue';import {session} from '@/platform';function go(url:string){uni.navigateTo({url});}</script>
<style scoped lang="scss">
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.panel .panel-dismiss {
  margin: 0;
  padding: 0;
  width: 40px;
  height: 40px;
  line-height: 38px;
  background: transparent;
  font-size: 28px;
  color: #687386;
}
.panel-dismiss::after {
  border: none;
}

.page {
  min-height: 100vh;
  background: #f7f8fc;
  padding-bottom: calc(110px + env(safe-area-inset-bottom));
}
.wrap {
  max-width: 500px;
  margin: auto;
  padding: 0 15px;
}
.head {
  height: 46px;
  margin: 0 4px;
  display: flex;
  align-items: center;
  font-size: 25px;
  font-weight: 500;
}
.license {
  height: 118px;
  margin-top: 12px;
  padding: 18px;
  border-radius: 22px;
  background: #294fdb;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  color: #dbe8ff;
  display: flex;
  flex-direction: column;
  gap: 11px;
  position: relative;
  font-size: 12px;
}
.license .edition {
  color: white;
  font-size: 15px;
  font-weight: 500;
}
.license image {
  position: absolute;
  right: 20px;
  top: 45px;
  width: 20px;
  height: 20px;
}
.setting {
  height: 68px;
  margin-top: 12px;
  padding: 14px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(20, 31, 51, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
}
.setting:first-of-type {
  margin-top: 22px;
}
.setting-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: #e8f0ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.setting-icon image {
  width: 20px;
  height: 20px;
}
.setting-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.setting-text text:first-child {
  font-size: 14px;
  font-weight: 500;
}
.setting-text text:last-child {
  font-size: 11px;
  color: #636e82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow {
  width: 18px;
  height: 18px;
}
.divider {
  height: 1px;
  margin: 25px 16px 15px;
  background: #e3e8f2;
}
.hint {
  margin: 0 4px;
  font-size: 12px;
  color: #636e82;
}
.state {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: white;
  color: #636e82;
  font-size: 12px;
}
.panel-scrim {
  position: fixed;
  z-index: 30;
  inset: 0;
  background: rgba(14, 22, 42, 0.42);
  display: flex;
  align-items: flex-end;
}
.panel {
  width: 100%;
  border-radius: 22px 22px 0 0;
  background: #f5f7fa;
  max-height: 88vh;
  overflow-y: auto;
  padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  color: #636e82;
}
.panel-title {
  color: #1a1f2e;
  font-size: 18px;
  font-weight: 600;
}
.panel button {
  width: 100%;
  border-radius: 14px;
  font-size: 13px;
}
.secondary {
  color: #294fdb;
  background: #e8f0ff;
}
.close {
  color: white;
  background: #294fdb;
}
</style>
<style scoped lang="scss">
.pairing-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: #f7f8fc;
}
.pairing-title {
  color: #1a1f2e;
  font-size: 14px;
  font-weight: 600;
}
.pairing-input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid #e3e8f2;
  border-radius: 11px;
  background: #fff;
  color: #1a1f2e;
  font-size: 14px;
}
.code-input {
  text-align: center;
  letter-spacing: 8px;
  font-size: 18px;
}
.pairing-form .primary {
  background: #294fdb;
  color: #fff;
}
.pairing-form .primary[disabled] {
  opacity: 0.55;
}
.pairing-hint {
  color: #8490a5;
  font-size: 11px;
  line-height: 1.5;
}
</style>
<style scoped>
.check-group { padding: 0 14px; background: #f7f9fc; border-radius: 14px; }
.group-heading { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 14px; font-weight: 600; color: #273247; }
.group-heading text:last-child { font-size: 11px; color: #8b95a6; font-weight: 400; }
.group-note { color: #788397; font-size: 12px; line-height: 1.65; }
.group-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.panel .group-actions button { width: auto; flex: 1 1 42%; margin: 0; min-height: 44px; line-height: 44px; font-size: 12px; }
.panel .danger-action { background: #fff1f0; color: #bd4545; }
</style>
<style scoped>
.card-list { display: flex; flex-direction: column; gap: 9px; }
.card-list :deep(.check-card) { margin-bottom: 0; }
</style>
