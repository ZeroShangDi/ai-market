import type { ResultCode } from '@/types/mobile'
export const resultLabels: Record<ResultCode, string> = { connected: '已接通', no_answer: '无人接听', busy: '忙线', rejected: '拒接', invalid_number: '号码无效', other: '其他' }
export function duration(seconds?: number) { if (!seconds) return '—'; return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
export function when(iso?: string) { if (!iso) return ''; const date = new Date(iso); if (Number.isNaN(date.getTime())) return ''; const today = new Date(); const label = date.toDateString() === today.toDateString() ? '今天' : new Date(today.getTime() - 86400000).toDateString() === date.toDateString() ? '昨天' : `${date.getMonth() + 1}/${date.getDate()}`; return `${label} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
export function toast(title: string) { uni.showToast({ title, icon: 'none', duration: 2500 }) }
