// Only final delivery belongs in the conversation; tool traces stay in Work.
export function finalDelivery(id, value) {
  const work = value?.work ?? value;
  if (!['completed', 'failed', 'stopped', 'interrupted', 'blocked'].includes(work?.status)) return null;
  const summary = work.result?.summary;
  if (typeof summary !== 'string' || !summary.trim()) return null;
  return {id: 'work-result:' + id, workSessionId: id, role: 'assistant',
    files: (work.result?.artifacts||[]).filter(a=>(work.result?.artifactIds||[]).includes(a.artifactId)).map(a=>({id:a.artifactId,title:a.title||'工作文件'})),
    text: summary, source: 'work', workStatus: work.status};
}
export function mergeDeliveries(history, deliveries, now = Date.now()) {
  let changed = false;
  for (const delivery of deliveries) {
    const previous = history.messages.find(m => m.id === delivery.id);
    if (previous) {
      if (previous.text !== delivery.text || previous.workStatus !== delivery.workStatus || JSON.stringify(previous.files) !== JSON.stringify(delivery.files)) {
        Object.assign(previous, delivery); changed = true;
      }
    } else { history.messages.push({...delivery, at: now}); changed = true; }
  }
  return changed;
}
export function singleFlight() {
  const pending = new Map();
  return function run(key, read) {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(read).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
}
