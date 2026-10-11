import { reactive } from 'vue';
import { phoneCapability } from '@/native/phone';
import { bridge, permissionGranted, allFilesGranted, batteryUnrestricted, requestRuntimePermissions, openSystemSettings, sdkVersion } from './android';
export { openSystemSettings } from './android';
export type CheckState = 'ready' | 'action' | 'unknown' | 'checking';
export const readiness = reactive({ phone: 'unknown' as CheckState, camera: 'unknown' as CheckState,
  microphone: 'unknown' as CheckState, files: 'unknown' as CheckState, recording: 'unknown' as CheckState, battery: 'unknown' as CheckState,
  plugin: 'unknown' as CheckState, error: '', requesting: false });
export const stateOf = (value: boolean | null): CheckState => value === null ? 'unknown' : value ? 'ready' : 'action';
const phonePermissions = ['CALL_PHONE', 'READ_PHONE_STATE', 'READ_CALL_LOG'];
let checking: Promise<void> | undefined;
let prompted = false;
let stopPhoneObserver: (() => void) | undefined;
function grouped(names: string[]) {
  const values = names.map(name => permissionGranted('android.permission.' + name));
  return values.includes(false) ? 'action' : values.includes(null) ? 'unknown' : 'ready';
}
export function refreshReadiness(): Promise<void> {
  if (checking) return checking;
  checking = (async () => {
    readiness.phone = grouped(phonePermissions);
    readiness.camera = stateOf(permissionGranted('android.permission.CAMERA'));
    readiness.microphone = stateOf(permissionGranted('android.permission.RECORD_AUDIO'));
    readiness.files = stateOf(allFilesGranted());
    readiness.battery = stateOf(batteryUnrestricted());
    readiness.plugin = phoneCapability.available() ? 'ready' : 'unknown';
    // Register globally after permissions, so visiting Customers never owns initialization.
    if (readiness.phone === 'ready' && readiness.microphone === 'ready' && !readiness.requesting && !stopPhoneObserver && phoneCapability.observe) {
      try { stopPhoneObserver = phoneCapability.observe(() => {}); } catch { readiness.plugin = 'unknown'; }
    }
    readiness.recording = 'checking';
    try { readiness.recording = stateOf(await phoneCapability.recordingConfigured()); }
    catch { readiness.recording = 'unknown'; }
  })().finally(() => { checking = undefined; });
  return checking;
}
export async function requestEssentialPermissions() {
  if (!bridge() || readiness.requesting) return;
  readiness.requesting = true; readiness.error = '';
  try {
    const names = [...phonePermissions, 'CAMERA', 'RECORD_AUDIO'];
    if (sdkVersion() < 30) names.push('READ_EXTERNAL_STORAGE');
    const missing = names.map(name => 'android.permission.' + name).filter(name => permissionGranted(name) === false);
    await requestRuntimePermissions(missing);
  } catch (e) { readiness.error = (e as Error).message; }
  finally { readiness.requesting = false; if (checking) await checking; await refreshReadiness(); }
}
export async function onApplicationShow() {
  if (!prompted && bridge()) { prompted = true; await requestEssentialPermissions(); }
  else await refreshReadiness();
}
export function configureRecording() { phoneCapability.openRecordingSettings(); }
export function configureFiles() { openSystemSettings('files'); }
