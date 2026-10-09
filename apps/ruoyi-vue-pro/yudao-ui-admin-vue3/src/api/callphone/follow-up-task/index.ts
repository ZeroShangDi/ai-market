import request from '@/config/axios'

export interface FollowUpTaskVO {
  id: string
  customerId: string
  customerName: string
  phoneDisplay: string
  title: string
  content?: string
  dueAt: string
  status: 'pending' | 'overdue' | 'completed' | 'cancelled'
  sourceCallRecordId?: string
  completedAt?: string
}

export interface FollowUpTaskPageParams {
  pageNo: number
  pageSize: number
  status?: FollowUpTaskVO['status']
}

export const getFollowUpTaskPage = (params: FollowUpTaskPageParams) =>
  request.get({ url: '/callphone/follow-up-task/page', params }) as Promise<{
    list: FollowUpTaskVO[]
    total: number
    pendingCount: number
    overdueCount: number
    completedCount: number
    cancelledCount: number
  }>

export const saveFollowUpTask = (data: Partial<FollowUpTaskVO>) =>
  request.post({ url: '/callphone/follow-up-task/save', data })

export const completeFollowUpTask = (id: string) =>
  request.post({ url: '/callphone/follow-up-task/complete', params: { id } })

export const cancelFollowUpTask = (id: string) =>
  request.post({ url: '/callphone/follow-up-task/cancel', params: { id } })
