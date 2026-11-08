<script setup lang="ts">
import * as Api from "@/api/infra/appRelease";
import type { UploadFile } from "element-plus";
import { dateFormatter } from "@/utils/formatTime";
defineOptions({ name: "InfraAppRelease" });
const message = useMessage();
const apps = ref<Api.ReleaseApplication[]>([]),
  selected = ref<number>();
const current = computed(() =>
  apps.value.find((app) => app.id === selected.value),
);
const rows = ref<any[]>([]),
  total = ref(0),
  loading = ref(false),
  busy = ref(false);
const query = reactive({
  pageNo: 1,
  pageSize: 20,
  channel: "",
  architecture: "",
});
const appDialog = ref(false),
  appForm = ref(),
  edit = reactive<Api.ReleaseApplication>({
    name: "",
    appId: "",
    packageName: "",
    publicKey: "",
    artifactBaseUrl: "",
  });
const rules = {
  name: [{ required: true, message: "请输入应用名称" }],
  appId: [{ required: true, message: "请输入应用标识" }],
  packageName: [{ required: true, message: "请输入Android包名" }],
  publicKey: [{ required: true, message: "请输入发布公钥" }],
  artifactBaseUrl: [{ required: true, message: "请输入下载根地址" }],
};
async function loadApps() {
  apps.value = await Api.applications();
  if (!apps.value.some((app) => app.id === selected.value))
    selected.value = apps.value[0]?.id;
  await load();
}
async function load() {
  if (!selected.value) {
    rows.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const page = await Api.list({ applicationId: selected.value, ...query });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}
function openApp(app?: Api.ReleaseApplication) {
  Object.assign(
    edit,
    app ?? {
      id: undefined,
      name: "",
      appId: "",
      packageName: "",
      publicKey: "",
      artifactBaseUrl: location.origin + "/api/v1/app-updates",
    },
  );
  appDialog.value = true;
  nextTick(() => appForm.value?.clearValidate());
}
async function saveApp() {
  if (!(await appForm.value.validate().catch(() => false))) return;
  busy.value = true;
  try {
    const id = await Api.save({
      ...edit,
      publicKey: edit.publicKey.replace(/\s/g, ""),
    });
    selected.value = id;
    appDialog.value = false;
    await loadApps();
    message.success("应用已保存");
  } finally {
    busy.value = false;
  }
}
const templateDialog = ref(false),
  withdraw = ref(false),
  binary = ref<File>(),
  uploadRef = ref();
const draft = reactive({
  architecture: "arm64-v8a",
  channel: "stable",
  versionCode: 1,
  versionName: "",
  minBaseVersionCode: 0,
  notes: "",
  days: 14,
});
function openTemplate(isWithdrawal = false) {
  withdraw.value = isWithdrawal;
  binary.value = undefined;
  templateDialog.value = true;
  nextTick(() => uploadRef.value?.clearFiles());
}
function chooseFile(file: UploadFile) {
  binary.value = file.raw;
}
function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function makeTemplate() {
  if (!current.value?.id) return;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(draft.channel))
    return message.error("渠道格式无效");
  const notes = draft.notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    !withdraw.value &&
    (!binary.value ||
      !draft.versionName ||
      notes.length < 1 ||
      notes.length > 3 ||
      notes.some((line) => line.length > 32) ||
      notes.join("").length > 90)
  )
    return message.error("请选择安装包，并填写1至3条、每条32字内的更新摘要");
  busy.value = true;
  try {
    const state = await Api.target({
      applicationId: current.value.id,
      architecture: draft.architecture,
      channel: draft.channel,
    });
    if (!withdraw.value && draft.versionCode <= state.versionCode)
      return message.error("版本号需要高于该目标的历史版本");
    const artifact = withdraw.value
      ? null
      : await Api.upload(current.value.id, draft.versionCode, binary.value!);
    const now = new Date(),
      sequence = state.sequence + 1;
    const metadata = {
      schemaVersion: 2,
      sequence,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + draft.days * 86400000).toISOString(),
      target: {
        appId: current.value.appId,
        packageName: current.value.packageName,
        platform: "android",
        architecture: draft.architecture,
        channel: draft.channel,
      },
      release: withdraw.value
        ? null
        : {
            id: crypto.randomUUID(),
            appId: current.value.appId,
            platform: "android",
            architecture: draft.architecture,
            channel: draft.channel,
            versionCode: draft.versionCode,
            versionName: draft.versionName,
            publishedAt: now.toISOString(),
            notes: notes.join("\n"),
            mandatory: false,
            minBaseVersionCode: draft.minBaseVersionCode,
            artifact,
          },
    };
    downloadJson(
      metadata,
      `${current.value.appId}-${draft.channel}-${sequence}.unsigned.json`,
    );
    templateDialog.value = false;
    message.success("模板已下载，请离线签名后导入");
  } finally {
    busy.value = false;
  }
}
async function importFile(file: UploadFile) {
  if (!file.raw || !selected.value) return;
  if (file.raw.size > 150000) return message.error("签名清单不能超过150KB");
  busy.value = true;
  try {
    const envelope = JSON.parse(await file.raw.text());
    await Api.importManifest(selected.value, envelope);
    message.success("清单已校验并保存为草稿");
    await load();
  } catch {
    message.error("清单导入失败，请检查格式、签名、目标和有效期");
  } finally {
    busy.value = false;
  }
}
async function renew(row: any) {
  if (!current.value?.id) return;
  busy.value = true;
  try {
    const entry = await Api.get(row.id);
    const metadata = JSON.parse(JSON.parse(entry.manifest).payload);
    const state = await Api.target({
      applicationId: current.value.id,
      architecture: row.architecture,
      channel: row.channel,
    });
    metadata.sequence = state.sequence + 1;
    metadata.issuedAt = new Date().toISOString();
    metadata.expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
    downloadJson(
      metadata,
      `${current.value.appId}-${row.channel}-${metadata.sequence}.renew.unsigned.json`,
    );
    message.success("续期模板已下载，请离线签名后导入");
  } finally {
    busy.value = false;
  }
}
async function publish(row: any) {
  try {
    await message.confirm(
      row.versionCode
        ? "确认发布该已签名版本？"
        : "确认发布已签名撤回清单，停止该目标的更新推送？",
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    await Api.publish(row.id);
    message.success("发布成功");
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(loadApps);
</script>
<template>
  <ContentWrap>
    <el-form inline class="-mb-15px">
      <el-form-item label="应用"
        ><el-select
          v-model="selected"
          class="!w-280px"
          placeholder="请选择应用"
          @change="
            query.pageNo = 1;
            load();
          "
          ><el-option
            v-for="app in apps"
            :key="app.id"
            :value="app.id!"
            :label="app.name" /></el-select
      ></el-form-item>
      <el-form-item
        ><el-button
          v-hasPermi="['infra:app-release:save']"
          type="primary"
          plain
          @click="openApp()"
          ><Icon icon="ep:plus" class="mr-5px" />新增应用</el-button
        ><el-button
          v-if="current"
          v-hasPermi="['infra:app-release:save']"
          @click="openApp(current)"
          >应用设置</el-button
        ></el-form-item
      >
    </el-form>
  </ContentWrap>
  <ContentWrap v-if="current">
    <el-descriptions :column="3" border
      ><el-descriptions-item label="应用标识">{{
        current.appId
      }}</el-descriptions-item
      ><el-descriptions-item label="Android包名">{{
        current.packageName
      }}</el-descriptions-item
      ><el-descriptions-item label="发布方式"
        >离线签名</el-descriptions-item
      ></el-descriptions
    >
    <el-form inline class="mt-15px -mb-15px">
      <el-form-item label="渠道"
        ><el-input
          v-model="query.channel"
          placeholder="全部渠道"
          clearable
          class="!w-160px"
      /></el-form-item>
      <el-form-item label="架构"
        ><el-select
          v-model="query.architecture"
          clearable
          placeholder="全部架构"
          class="!w-170px"
          ><el-option
            v-for="abi in ['arm64-v8a', 'armeabi-v7a', 'x86_64']"
            :key="abi"
            :label="abi"
            :value="abi" /></el-select
      ></el-form-item>
      <el-form-item
        ><el-button
          @click="
            query.pageNo = 1;
            load();
          "
          ><Icon icon="ep:search" class="mr-5px" />搜索</el-button
        ><el-button
          v-hasPermi="['infra:app-release:upload']"
          type="primary"
          plain
          @click="openTemplate(false)"
          >上传安装包</el-button
        >
        <el-upload
          v-hasPermi="['infra:app-release:import']"
          class="inline-flex mx-10px"
          accept=".json,application/json"
          :show-file-list="false"
          :auto-upload="false"
          :on-change="importFile"
          ><el-button type="success" plain :loading="busy"
            >导入签名清单</el-button
          ></el-upload
        >
        <el-button
          v-hasPermi="['infra:app-release:publish']"
          type="warning"
          plain
          @click="openTemplate(true)"
          >撤回目标版本</el-button
        >
        <el-tooltip
          content="上传后下载模板，在离线环境签名，再导入校验并发布。撤回也需要新的签名清单。"
          placement="top"
          ><Icon icon="ep:question-filled" class="ml-10px"
        /></el-tooltip>
      </el-form-item>
    </el-form>
  </ContentWrap>
  <ContentWrap>
    <el-table
      v-loading="loading || busy"
      :data="rows"
      stripe
      :show-overflow-tooltip="true"
    >
      <el-table-column
        label="序号"
        prop="sequence"
        width="90"
      /><el-table-column label="版本" min-width="130"
        ><template #default="{ row }"
          >{{ row.versionName || "停止提供更新"
          }}<span v-if="row.versionCode"
            >（{{ row.versionCode }}）</span
          ></template
        ></el-table-column
      >
      <el-table-column
        label="渠道"
        prop="channel"
        width="100"
      /><el-table-column label="架构" prop="architecture" width="130" />
      <el-table-column label="状态" width="110"
        ><template #default="{ row }"
          ><el-tag
            :type="
              row.state === 'PUBLISHED'
                ? 'success'
                : row.state === 'DRAFT'
                  ? 'warning'
                  : 'info'
            "
            >{{
              (
                {
                  DRAFT: "草稿",
                  PUBLISHED: "已发布",
                  SUPERSEDED: "已替代",
                } as any
              )[row.state]
            }}</el-tag
          ></template
        ></el-table-column
      >
      <el-table-column
        label="更新摘要"
        prop="notes"
        min-width="180"
      /><el-table-column
        label="清单有效期"
        prop="expiresAt"
        :formatter="dateFormatter"
        width="180"
      /><el-table-column label="发布人" prop="publisher" width="90" />
      <el-table-column label="操作" width="130" fixed="right"
        ><template #default="{ row }"
          ><el-button
            v-if="row.state === 'DRAFT'"
            v-hasPermi="['infra:app-release:publish']"
            type="primary"
            link
            @click="publish(row)"
            >发布</el-button
          ><el-button
            v-if="row.state === 'PUBLISHED'"
            v-hasPermi="['infra:app-release:publish']"
            link
            type="primary"
            @click="renew(row)"
            >续期模板</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <Pagination
      v-model:page="query.pageNo"
      v-model:limit="query.pageSize"
      :total="total"
      @pagination="load"
    />
  </ContentWrap>
  <Dialog
    v-model="appDialog"
    :title="edit.id ? '应用设置' : '新增应用'"
    width="720px"
  >
    <el-form ref="appForm" :model="edit" :rules="rules" label-width="130px">
      <el-form-item label="应用名称" prop="name"
        ><el-input
          v-model="edit.name"
          placeholder="请输入应用名称"
          maxlength="100"
      /></el-form-item>
      <el-form-item label="应用标识" prop="appId"
        ><el-input
          v-model="edit.appId"
          placeholder="请输入客户端内置的应用标识"
          :disabled="!!edit.id"
      /></el-form-item>
      <el-form-item label="Android包名" prop="packageName"
        ><el-input
          v-model="edit.packageName"
          placeholder="如 com.example.application"
          :disabled="!!edit.id"
      /></el-form-item>
      <el-form-item label="发布公钥" prop="publicKey"
        ><el-input
          v-model="edit.publicKey"
          type="textarea"
          :rows="4"
          placeholder="SPKI DER Base64公钥；不要填写私钥"
      /></el-form-item>
      <el-form-item label="下载根地址" prop="artifactBaseUrl"
        ><el-input
          v-model="edit.artifactBaseUrl"
          placeholder="https://下载域名/api/v1/app-updates"
      /></el-form-item> </el-form
    ><template #footer
      ><el-button type="primary" :loading="busy" @click="saveApp"
        >保存</el-button
      ><el-button @click="appDialog = false">取消</el-button></template
    >
  </Dialog>
  <Dialog
    v-model="templateDialog"
    :title="withdraw ? '生成撤回清单' : '上传安装包并生成清单'"
    width="680px"
  >
    <el-form label-width="130px">
      <el-form-item label="架构"
        ><el-select v-model="draft.architecture"
          ><el-option
            v-for="abi in ['arm64-v8a', 'armeabi-v7a', 'x86_64']"
            :key="abi"
            :value="abi"
            :label="abi" /></el-select
      ></el-form-item>
      <el-form-item label="渠道"
        ><el-input
          v-model="draft.channel"
          placeholder="如 stable、beta"
          maxlength="32"
      /></el-form-item>
      <template v-if="!withdraw">
        <el-form-item label="版本号"
          ><el-input-number
            v-model="draft.versionCode"
            :min="1"
            :max="2100000000"
            :precision="0"
        /></el-form-item>
        <el-form-item label="版本名称"
          ><el-input
            v-model="draft.versionName"
            placeholder="与安装包中的versionName一致"
            maxlength="64"
        /></el-form-item>
        <el-form-item label="最低基座版本"
          ><el-input-number
            v-model="draft.minBaseVersionCode"
            :min="0"
            :max="2100000000"
            :precision="0"
        /></el-form-item>
        <el-form-item label="更新摘要"
          ><el-input
            v-model="draft.notes"
            type="textarea"
            :rows="3"
            placeholder="每行一条，1至3条，每条最多32字"
            maxlength="92"
        /></el-form-item>
        <el-form-item label="安装包"
          ><el-upload
            ref="uploadRef"
            accept=".apk"
            :limit="1"
            :auto-upload="false"
            :on-change="chooseFile"
            ><el-button>选择APK</el-button></el-upload
          ></el-form-item
        >
      </template>
      <el-form-item label="清单有效天数"
        ><el-input-number
          v-model="draft.days"
          :min="1"
          :max="30"
          :precision="0"
      /></el-form-item> </el-form
    ><template #footer
      ><el-button type="primary" :loading="busy" @click="makeTemplate">{{
        withdraw ? "下载撤回模板" : "上传并下载模板"
      }}</el-button
      ><el-button @click="templateDialog = false">取消</el-button></template
    >
  </Dialog>
</template>
