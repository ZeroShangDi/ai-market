export const frequencies: string[];
export function compileSchedule(value: Record<string, any>): {run_at:string|null;cron:string|null;interval_seconds:number|null};
export function readSchedule(rule: Record<string, any>): Record<string, any>;
export function scheduleLabel(rule: Record<string, any>): string;
