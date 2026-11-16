<template>
 <view class="page">
  <MobileHeader title="拨号" back-icon-name="chevron-left"/>
  <view class="dialer">
   <input v-model="number" type="tel" maxlength="32" placeholder="输入电话号码" aria-label="电话号码" :disabled="busy"/>
   <button :disabled="busy||!available" @tap="call">{{busy?'正在拨号…':'拨打电话'}}</button>
   <text v-if="phoneState.status!=='idle'" class="message">{{({dialing:'通话已发起',ended:'通话已结束',unanswered:'未接通'})[phoneState.status]}}</text>
   <text v-if="message" class="message" role="status">{{message}}</text>
  </view>
 </view>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import {phoneCapability} from '@/native/phone';
import {permissionGranted,requestRuntimePermissions} from '@/modules/device-readiness';
import {phonePermissions,phoneState,refreshPhoneObservation} from '@/services/phone';
const number=ref(''),busy=ref(false),available=ref(false),message=ref('');
onShow(()=>{available.value=phoneCapability.available();refreshPhoneObservation();if(!available.value)message.value='请使用包含拨号插件的 Android 安装包';});
async function call(){
 if(busy.value)return;
 const phone=number.value.replace(/[\s()-]/g,'');
 if(!/^\+?[0-9]{3,20}$/.test(phone)){message.value='请输入有效的电话号码';return;}
 busy.value=true;message.value='';
 try{
  const missing=phonePermissions.filter(name=>permissionGranted(name)!==true);if(missing.length)await requestRuntimePermissions(missing);if(!phonePermissions.every(name=>permissionGranted(name)===true)){message.value='请先允许电话、电话状态和通话记录权限';return;}
  if(!refreshPhoneObservation()){message.value='通话监听尚未就绪，请检查插件和权限';return;}
  await phoneCapability.dial(phone);message.value='已请求拨号，请查看系统通话界面';
 }catch(e){message.value=e instanceof Error?e.message:'拨号结果未确认，请先检查系统通话状态';}
 finally{busy.value=false;}
}
</script>
<style scoped>
.page{max-width:500px;margin:auto;padding:12px 20px;min-height:100vh;background:#f7f8fc}.dialer{margin-top:48px;display:flex;flex-direction:column;gap:24px}.dialer input{height:64px;background:white;border-radius:12px;padding:0 16px;font-size:26px}.dialer button{width:100%;background:#294fdb;color:white;border-radius:12px}.message{font-size:14px;color:#68758d;line-height:1.6}
</style>
