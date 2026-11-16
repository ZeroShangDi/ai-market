import {reactive} from 'vue';
import {phoneCapability} from '@/native/phone';
import {permissionGranted} from '@/modules/device-readiness';
import {logger} from '@/services/logger';
export const phonePermissions=['CALL_PHONE','READ_PHONE_STATE','READ_CALL_LOG'].map(name=>'android.permission.'+name);
export const phoneState=reactive({status:'idle' as 'idle'|'dialing'|'ended'|'unanswered',durationSeconds:0,recordingAvailable:false});
let unsubscribe:(()=>void)|undefined;
export function refreshPhoneObservation(){
 if(!phoneCapability.available()||!phonePermissions.every(name=>permissionGranted(name)===true)){
  try{unsubscribe?.();}catch{logger.warn('phone','listener.release.failed');}unsubscribe=undefined;return false;
 }
 if(!unsubscribe)try{unsubscribe=phoneCapability.observe(event=>{
  phoneState.status=event.kind;
  phoneState.durationSeconds=event.durationSeconds??0;
  phoneState.recordingAvailable=event.localRecordingAvailable===true;
  // Never retain or log the plugin's raw recording path or dialed number.
  logger.info('phone','call.state',{state:event.kind,durationSeconds:phoneState.durationSeconds});
 });}catch{logger.warn('phone','listener.unavailable');return false;}
 return true;
}
