import type { CallPhoneApiLogPageParams, CallPhoneApiLogVO } from './index'

const rows: CallPhoneApiLogVO[] = [
  {
    id: 62041,
    traceId: 'trc-8c12d6a1',
    userId: 1001,
    applicationName: 'yudao-server',
    requestMethod: 'POST',
    requestUrl: '/admin-api/callphone/call-dispatch/create?customerId=1002',
    operateModule: '外呼派发',
    operateName: '创建派发任务',
    beginTime: '2026-10-05 10:42:18',
    duration: 184,
    resultCode: 0,
    resultMsg: '成功'
  },
  {
    id: 62037,
    traceId: 'trc-21ef93bc',
    userId: 1001,
    applicationName: 'yudao-server',
    requestMethod: 'GET',
    requestUrl: '/admin-api/callphone/customer/page?pageNo=1',
    operateModule: '客户',
    operateName: '客户分页',
    beginTime: '2026-10-05 10:38:06',
    duration: 96,
    resultCode: 0,
    resultMsg: '成功'
  },
  {
    id: 62022,
    traceId: 'trc-b71400f0',
    userId: 1001,
    applicationName: 'yudao-server',
    requestMethod: 'POST',
    requestUrl: '/admin-api/callphone/customer/save',
    operateModule: '客户',
    operateName: '保存客户',
    beginTime: '2026-10-05 09:55:31',
    duration: 2350,
    resultCode: 0,
    resultMsg: '成功'
  },
  {
    id: 62010,
    traceId: 'trc-4f3d20ad',
    userId: 1001,
    applicationName: 'yudao-server',
    requestMethod: 'GET',
    requestUrl: '/admin-api/callphone/device/list',
    operateModule: '设备配对',
    operateName: '设备列表',
    beginTime: '2026-10-05 09:14:43',
    duration: 42,
    resultCode: 1,
    resultMsg: '设备服务暂不可用'
  },
  {
    id: 61988,
    traceId: 'trc-74190af2',
    userId: 1002,
    applicationName: 'yudao-server',
    requestMethod: 'POST',
    requestUrl: '/admin-api/callphone/follow-up-task/save',
    operateModule: '客户跟进',
    operateName: '保存跟进事项',
    beginTime: '2026-10-04 16:28:19',
    duration: 611,
    resultCode: 0,
    resultMsg: '成功'
  }
]

export function getPreviewCallPhoneApiLogPage(params: CallPhoneApiLogPageParams) {
  const filtered = rows.filter((row) => {
    const failure =
      params.resultCode === 0
        ? row.resultCode === 0
        : params.resultCode === 1
          ? row.resultCode !== 0
          : true
    const inRange =
      !params.beginTime?.length ||
      (row.beginTime >= params.beginTime[0] && row.beginTime <= params.beginTime[1])
    return failure && inRange
  })
  const start = (params.pageNo - 1) * params.pageSize
  return { list: filtered.slice(start, start + params.pageSize), total: filtered.length }
}
