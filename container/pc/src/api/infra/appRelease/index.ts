import request from "@/config/axios";
export interface ReleaseApplication {
  id?: number;
  name: string;
  appId: string;
  packageName: string;
  publicKey: string;
  artifactBaseUrl: string;
}
export const applications = () =>
  request.get<ReleaseApplication[]>({ url: "/infra/app-release/applications" });
export const save = (data: ReleaseApplication) =>
  request.post<number>({ url: "/infra/app-release/application/save", data });
export const list = (params: any) =>
  request.get<{ list: any[]; total: number }>({
    url: "/infra/app-release/list",
    params,
  });
export const target = (params: any) =>
  request.get<{ sequence: number; versionCode: number }>({
    url: "/infra/app-release/target",
    params,
  });
export const upload = (
  applicationId: number,
  versionCode: number,
  data: File,
) =>
  request.post({
    url: "/infra/app-release/artifact",
    params: { applicationId, versionCode },
    data,
    headersType: "application/octet-stream",
    timeout: 600000,
  });
export const importManifest = (
  applicationId: number,
  envelope: { payload: string; signature: string },
) =>
  request.post<number>({
    url: "/infra/app-release/import",
    data: { applicationId, ...envelope },
  });
export const publish = (id: number) =>
  request.post({ url: "/infra/app-release/publish", params: { id } });

export const get = (id: number) =>
  request.get<{ manifest: string }>({
    url: "/infra/app-release/get",
    params: { id },
  });
