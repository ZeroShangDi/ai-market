// Shared by this plugin's runtime and page; never interprets arbitrary cron as a simpler rule.
export const frequencies = ['仅一次', '每天', '按间隔', '每周', '每月'];
export function compileSchedule(s) {
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.time || '');
  if (s.kind === 'interval') {
    const n = Number(s.interval);
    if (!Number.isInteger(n) || n < 1 || n > 10000 || !['minutes','hours'].includes(s.unit)) throw Error('请填写有效的执行间隔');
    return {run_at:null,cron:null,interval_seconds:n*(s.unit === 'hours' ? 3600 : 60)};
  }
  if (!time) throw Error('请选择执行时间');
  const minute = Number(time[2]), hour = Number(time[1]);
  if (s.kind === 'once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) throw Error('请选择执行日期');
    // Preserve the explicit offset selected for this rule, rather than the phone timezone.
    const offset = s.offset || '+08:00';
    if (!/^(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(offset)) throw Error('执行时区无效');
    const value = `${s.date}T${s.time}:00${offset}`;
    const date = new Date(`${s.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== s.date) throw Error('执行日期无效');
    return {run_at:value,cron:null,interval_seconds:null};
  }
  let dom = '*', dow = '*';
  if (s.kind === 'weekly') {
    if (!Array.isArray(s.weekdays) || !s.weekdays.length || s.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)) throw Error('请至少选择一个星期');
    dow = [...new Set(s.weekdays)].sort().join(',');
  } else if (s.kind === 'monthly') {
    if (!Number.isInteger(Number(s.monthday)) || Number(s.monthday)<1 || Number(s.monthday)>31) throw Error('请选择每月执行日期');
    dom = String(Number(s.monthday));
  } else if (s.kind !== 'daily') throw Error('请选择执行频率');
  return {run_at:null,cron:`${minute} ${hour} ${dom} * ${dow}`,interval_seconds:null};
}
export function readSchedule(rule) {
  if (rule.run_at) { const m = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d).*?(Z|[+-]\d\d:\d\d)$/.exec(rule.run_at); if(m)return {kind:'once',date:m[1],time:m[2],offset:m[3]}; }
  if (rule.interval_seconds) return {kind:'interval',interval:rule.interval_seconds % 3600 ? rule.interval_seconds / 60 : rule.interval_seconds / 3600,unit:rule.interval_seconds % 3600 ? 'minutes':'hours'};
  const m = /^(\d{1,2}) (\d{1,2}) (\*|\d{1,2}) \* (\*|[0-6](?:,[0-6])*)$/.exec(rule.cron || '');
  if (!m || +m[1]>59 || +m[2]>23 || (m[3] !== '*' && m[4] !== '*')) return {kind:'custom'};
  const time=`${m[2].padStart(2,'0')}:${m[1].padStart(2,'0')}`;
  return m[3] !== '*' ? {kind:'monthly',monthday:+m[3],time} : m[4] !== '*' ? {kind:'weekly',weekdays:m[4].split(',').map(Number),time} : {kind:'daily',time};
}
export function scheduleLabel(rule) {
  const s=readSchedule(rule);
  if(s.kind==='once')return `${s.date} ${s.time} · 仅一次`;
  if(s.kind==='interval')return `每 ${s.interval} ${s.unit==='hours'?'小时':'分钟'}`;
  if(s.kind==='daily')return `每天 ${s.time}`;
  if(s.kind==='weekly')return `每周${s.weekdays.map(n=>'日一二三四五六'[n]).join('、')} ${s.time}`;
  if(s.kind==='monthly')return `每月 ${s.monthday} 日 ${s.time}`;
  return '自定义时间规则';
}
