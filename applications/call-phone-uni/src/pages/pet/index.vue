<template>
  <view class="page">
    <MobileHeader title="手机宠" back-icon-name="chevron-left"/>
    <view class="pet-summary"><view class="pet-symbol"><AppIcon name="brand-assistant" :size="38"/></view><view><text class="pet-name">{{activePackage()?.name || '选择你的手机宠'}}</text><text class="pet-state">{{mobilePet.visible?'正在桌面陪伴你':mobilePet.enabled?'等待显示':'未开启'}}</text></view></view>
    <view class="card"><view class="row"><text>桌面显示</text><switch color="#4964d8" :checked="mobilePet.enabled" :disabled="busy||!native" @change="togglePet"/></view><view class="row"><text>宠物语音</text><button :disabled="!native||(!mobilePet.visible&&!voice.active&&!voice.opening)" @tap="toggleDesktopVoice">{{voice.opening?'取消连接':voice.active?'结束语音':'开启语音'}}</button></view></view>
    <text v-if="!native" class="note">桌面显示与宠物语音需在 Android App 中使用</text>
    <view v-else-if="mobilePet.enabled&&!mobilePet.visible" class="recovery"><text>{{mobilePet.permission===false?'请先允许悬浮窗权限':'请检查角色是否已下载并启用'}}</text><button @tap="recover">{{mobilePet.permission===false?'设置权限':'重试显示'}}</button></view>
    <PackageSettings/>
  </view>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import AppIcon from '@/components/AppIcon.vue';
import PackageSettings from '@/modules/pet-packages/PackageSettings.vue';
import {activePackage} from '@/modules/pet-packages';
import {mobilePet,setMobilePetEnabled,refreshMobilePet,openOverlaySettings} from '@/modules/mobile-pet';
import {toggleDesktopVoice,closeVoice,voice} from '@/modules/voice';
const native=typeof plus!=='undefined'&&uni.getSystemInfoSync().platform==='android',busy=ref(false);
async function togglePet(e:any){if(busy.value)return;busy.value=true;try{if(!e.detail.value)closeVoice();await setMobilePetEnabled(e.detail.value);}catch{uni.showToast({title:'请检查悬浮权限及角色资源',icon:'none'});}finally{busy.value=false;}}
async function recover(){try{if(mobilePet.permission===false)await openOverlaySettings();else await refreshMobilePet();}catch{uni.showToast({title:'暂时无法显示手机宠',icon:'none'});}}
onShow(()=>{void refreshMobilePet();});
</script>
<style scoped>
.page{box-sizing:border-box;max-width:500px;min-height:100vh;margin:auto;padding:12px 20px 40px;background:#f5f6fa}.pet-summary{display:flex;align-items:center;gap:16px;padding:30px 4px}.pet-symbol{width:62px;height:62px;display:grid;place-items:center;background:#fff;border-radius:20px}.pet-name{display:block;font-size:19px;font-weight:600;color:#253047}.pet-state{display:block;margin-top:8px;font-size:12px;color:#8993a6}.card{padding:0 18px;background:#fff;border-radius:16px}.row{display:flex;align-items:center;justify-content:space-between;min-height:68px;font-size:14px}.row+.row{border-top:1px solid #f0f2f7}.row button,.recovery button{margin:0;font-size:12px;line-height:34px;border-radius:18px;padding:0 14px;background:#edf1fc;color:#4964d8}.row button::after,.recovery button::after{border:0}.row button[disabled]{color:#a5adbf;background:#f5f6f9}.note{display:block;font-size:12px;line-height:1.6;color:#929aab;margin:14px 4px}.recovery{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#8b94a6;margin-top:12px}
</style>
