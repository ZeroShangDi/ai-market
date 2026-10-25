<template>
  <view class="page">
    <MobileHeader :title="definition?.name || '插件'" back-icon-name="chevron-left" back-fallback="/pages/apps/index" />
    <scroll-view scroll-y class="content">
      <view v-if="error" class="error">{{ error }}</view>
      <template v-if="definition">
        <template v-if="editing">
          <view v-for="field in definition.fields" :key="field.key" class="field">
            <text>{{ field.label }}</text>
            <textarea v-if="field.type !== 'text'" v-model="form[field.key]" :maxlength="field.key === 'prompt' ? 5000 : 6000" auto-height />
            <input v-else v-model="form[field.key]" :placeholder="field.placeholder || ''" :maxlength="2000" />
          </view>
          <button :disabled="busy" @tap="save">保存</button><button :disabled="busy" @tap="editing = false">取消</button>
        </template>
        <template v-else>
          <button :disabled="busy" @tap="edit()">新建</button>
          <view v-for="rule in rules" :key="rule.id" class="rule">
            <view class="heading"><text>{{ rule.title }}</text><text class="status">{{ rule.enabled ? '已启用' : '已暂停' }}</text></view>
            <view class="actions">
              <text @tap="edit(rule)">修改</text><text @tap="action(rule, rule.enabled ? 'pause' : 'resume')">{{ rule.enabled ? '暂停' : '恢复' }}</text>
              <text @tap="records(rule)">记录</text><text v-if="definition.endpoint" @tap="copyEndpoint(rule)">复制接收地址</text><text @tap="remove(rule)">删除</text>
            </view>
          </view>
          <view v-if="!rules.length && !busy" class="empty">暂无规则</view>
          <view v-if="runs !== null" class="runs">
            <view class="heading"><text>触发记录</text><text @tap="runs = null">收起</text></view>
            <view v-for="run in runs" :key="run.id" class="run" @tap="openRun(run)">
              <text>{{ run.created_at }}</text><text>{{ status(run.status) }}</text><text v-if="run.conversation_id">查看工作 ›</text>
            </view><text v-if="!runs.length">暂无触发</text>
          </view>
        </template>
      </template>
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import MobileHeader from '@/components/MobileHeader.vue';
import pageDefinition from './page.json';
import { request, onSessionChange, onDeviceChange } from '@/api/http';
import { previewRequestId } from '@/services/ai-chat-preview';
import { ensureSession } from '@/services/session';
import { toast } from '@/ui/format';
const plugin = ref('scheduled_tasks'), definition = computed<{name:string;endpoint:boolean;fields:{key:string;label:string;type:string;placeholder?:string;default?:string}[]}>(() => pageDefinition);
const rules = ref<any[]>([]), runs = ref<any[] | null>(null), editing = ref(false), busy = ref(false), error = ref('');
const form = reactive<Record<string,string>>({}); let editId = '', createKey = '', epoch = 0;
const reset = () => { epoch++; rules.value = []; runs.value = null; editing.value = false; error.value = ''; Object.keys(form).forEach(k => delete form[k]); };
const unsubs = [onSessionChange(reset), onDeviceChange(reset)]; onUnload(() => { reset(); unsubs.forEach(fn => fn()); });
const call = (op: string, data: any = {}) => request<any>('POST', `/api/v1/mobile/work/sessions/extensions/${plugin.value}/${op}`, data);
async function load() { const generation=epoch; const result = await call('list'); if(generation===epoch) rules.value = result.items; }
async function execute(fn: () => Promise<void>) {
  if(busy.value)return; const generation=epoch; busy.value=true; error.value='';
  try { await fn(); } catch(e:any) { if(generation===epoch) error.value=e.message || '操作失败，请刷新状态'; }
  finally { busy.value=false; }
}
onLoad(async options => { if(definition.value && await ensureSession()) await execute(load); });
function edit(rule?:any) {
  if(busy.value)return; editId=rule?.id || ''; createKey=previewRequestId();
  for(const field of definition.value?.fields || []) {
    const value=rule?.[field.key]; form[field.key]=value == null ? ('default' in field ? String(field.default) : '') : field.type==='json'?JSON.stringify(value,null,2):String(value);
  }
  editing.value=true; runs.value=null;
}
async function save() { await execute(async () => {
  const generation=epoch, data:any={};
  for(const field of definition.value?.fields || []) {
    const value=form[field.key]?.trim();
    if(value) data[field.key]=field.type==='json'?JSON.parse(value):value;
    else if(editId && field.key==='run_at') data[field.key]=null;
  }
  const result=await call(editId?'update':'create',{...data,...(editId?{id:editId}:{request_id:createKey})});
  if(generation!==epoch)return;
  if(result.synced===false)toast('已保存，调度同步待重试');
  editing.value=false;await load();
}); }
async function action(rule:any, op:string) { await execute(async()=>{ await call(op,{id:rule.id});await load(); }); }
function remove(rule:any) { uni.showModal({title:'删除规则',content:rule.title,success:r=>{if(r.confirm)void action(rule,'delete');}}); }
async function records(rule:any) { await execute(async()=>{const generation=epoch;const result=await call('runs',{id:rule.id});if(generation===epoch)runs.value=result.items;}); }
async function copyEndpoint(rule:any) { await execute(async()=>{const generation=epoch;const result=await call('endpoint',{id:rule.id});if(generation===epoch)uni.setClipboardData({data:result.url});}); }
function openRun(run:any) { if(run.conversation_id)uni.navigateTo({url:`/pages/ai-chat/index?conversation=${encodeURIComponent(run.conversation_id)}`}); }
function status(value:string) { return ({queued:'排队中',dispatching:'提交中',submitted:'工作已提交',delivered:'通知已送达',failed:'触发失败'} as Record<string,string>)[value] || value; }
</script>
<style scoped>
.page{height:100vh;display:flex;flex-direction:column;background:#fff}.content{flex:1;min-height:0;box-sizing:border-box;padding:20px}.field{margin:18px 0;font-size:14px}.field input,.field textarea{background:#f5f7fa;padding:12px;margin-top:8px;border-radius:10px;box-sizing:border-box;width:100%}.rule,.runs{padding:20px 0;border-bottom:1px solid #edf0f5}.heading,.actions{display:flex;justify-content:space-between;gap:12px}.status{color:#8791a4;font-size:12px}.actions{margin-top:16px;flex-wrap:wrap;color:#294fdb;font-size:13px}.error{color:#bf3737;margin-bottom:14px}.empty{padding:40px;text-align:center;color:#8791a4}.run{display:flex;flex-direction:column;gap:8px;padding:14px 0;font-size:13px}button{margin:10px 0;font-size:14px}
</style>
