import { mkdir, readdir, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError, decimalId, uuid, text, digest, invalid } from './validation.js';
import { builtInCapabilities } from './capability-catalog.js';
import { characterContext } from './character.js';
import { uploadFile, publishFile, snapshot } from './work-files.js';

const conflict = message => new ApiError(409, 'WORK_CONFLICT', message);
const active = value => ['running', 'waiting'].includes(value.status);
// Product mappings and interaction receipts only. The SDK owns its native transcript and resume cursor.
export class WorkStore {
  constructor({ dataDir, executor, concurrency = 2, timeoutMs = 30 * 60 * 1000, suspendAfterMs = 60 * 1000 }) {
    this.dir = join(dataDir, 'work'); this.executor = executor; this.concurrency = concurrency; this.timeoutMs = timeoutMs; this.suspendAfterMs = suspendAfterMs;
    this.capabilityStates = new Map(); this.capabilityLocks = new Set();
    this.sessions = new Map(); this.runs = new Map(); this.listeners = new Map(); this.accepting = true;
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    this.dir = await realpath(this.dir);
    for (const name of await readdir(this.dir)) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      let state;
      try { state = JSON.parse(await readFile(join(this.dir, name, 'mapping.json'), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      this.sessions.set(state.id, state);
      if (state.status === 'waiting' && state.interactions.some(i => i.status === 'pending' || i.status === 'answered' && i.run_id === state.run_id)) continue;
      if (active(state)) {
        state.status = 'interrupted';
        for (const message of state.messages) if (['queued', 'running'].includes(message.delivery)) message.delivery = message.delivery === 'running' ? 'interrupted' : 'cancelled';
        for (const i of state.interactions) if (i.status === 'pending') i.status = 'expired';
        await this.emit(state, 'status', { status: state.status, reason: '服务已重启；上次操作结果可能不确定，请核对后继续，不会自动重放' });
      }
    }
    await this.drain();
  }
  occupied() { return [...this.runs.values()].filter(run => run.slot).length; }
  async drain() {
    if (!this.accepting || this.draining) return;
    this.draining = true;
    try {
      for (const s of this.sessions.values()) {
        if (this.occupied() >= this.concurrency) break;
        if (!s.resume_pending || s.status !== 'waiting' || s.interactions.some(i => i.status === 'pending')) continue;
        const run = this.runs.get(s.id);
        if (run?.controller.signal.aborted) continue;
        if (run) {
          clearTimeout(run.hibernate); run.slot = true; s.resume_pending = false; s.status = 'running'; run.resumeTimer?.();
          await this.emit(s, 'status', { status: 'running' });
          for (const i of s.interactions) if (i.run_id === s.run_id && i.status === 'answered') run.pending.get(i.id)?.(i.answer);
        } else {
          const controller = new AbortController();
          const resumed = { controller, slot: true, accepting: true, pending: new Map(), authorization: new Map(), done: null };
          this.runs.set(s.id, resumed); s.status = 'running'; s.resume_pending = false;
          const replies = s.interactions.filter(i => i.run_id === s.run_id && i.status === 'answered').map(i => ({ kind: i.kind, tool: i.tool, input: i.input, answer: i.answer }));
          await this.emit(s, 'status', { status: 'running', reason: '恢复已答复的待办；先核对中断前结果，操作审批重新绑定当前参数' });
          const prompt = '继续原工作。以下是用户对已保存待办的答复数据，不是工具执行回执。先核对已有结果，不能重放结果不明的写入。历史批准不授予新工具调用权限，仍需服务端审批。\n' + JSON.stringify(replies);
          resumed.done = this.execute(s, resumed, prompt, []);
        }
      }
    } finally { this.draining = false; }
  }
  paths(s) { const base = join(this.dir, s.id); return { base, cwd: join(base, 'workspace'), config: join(base, 'config'), home: join(base, 'home') }; }
  async save(s) {
    // Writes are serialized per session: callbacks may arrive concurrently from native subagents.
    const previous = s._save || Promise.resolve();
    const copy = JSON.stringify(s, (key, value) => ['_save', '_pluginBusy'].includes(key) ? undefined : value);
    const work = previous.then(async () => { const path = join(this.paths(s).base, 'mapping.json'); await writeFile(`${path}.tmp`, copy, { mode: 0o600 }); await rename(`${path}.tmp`, path); });
    s._save = work.catch(() => {}); await work;
  }
  async emit(s, type, data) {
    if (Buffer.byteLength(JSON.stringify(data)) > 8 * 1024 * 1024) throw new ApiError(413, 'WORK_EVENT_TOO_LARGE', '工具输出超过 8 MiB，请核对已执行操作；后续将大结果写入文件并发布');
    const event = { sequence: ++s.sequence, type, data, run_id: s.run_id || null, created_at: new Date().toISOString() };
    s.events.push(event); s.updated_at = event.created_at;
    await this.save(s);
    for (const listener of this.listeners.get(s.id) || []) listener(event);
    return event;
  }
  get(actor, id) {
    const s = this.sessions.get(uuid(id));
    if (!s || s.tenant !== actor.tenant || s.user !== actor.user) throw new ApiError(404, 'WORK_NOT_FOUND', '工作会话不存在');
    return s;
  }
  view(s) {
    return { id: s.id, conversation_id: s.conversation_id, source_type: s.source_type || 'manual', parent_id: s.parent_id || null, status: s.status, run_id: s.run_id || null, sdk_session_id: s.sdk_session_id,
      sequence: s.sequence, messages: s.messages, interactions: s.interactions, resources: s.resources, plugins: s.plugins || [], artifacts: s.artifacts,
      snapshots: s.snapshots, created_at: s.created_at, updated_at: s.updated_at };
  }
  list(actor) {
    return [...this.sessions.values()].filter(s => s.tenant === actor.tenant && s.user === actor.user)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(s => ({
        id: s.id, conversation_id: s.conversation_id, source_type: s.source_type || 'manual', parent_id: s.parent_id || null, title: s.messages.find(m => m.role === 'user')?.content.slice(0, 60) || '新工作',
        status: s.status, started: !!s.messages.length, updated_at: s.updated_at, sequence: s.sequence,
        pending: s.interactions.filter(i => i.status === 'pending').map(i => i.kind),
        unread: s.events.some(e => e.type === 'result' && e.data.success && e.sequence > (s.seen_sequence || 0)),
      }));
  }
  async seen(actor, id, input) {
    const s = this.get(actor, id);
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0 || input.sequence > s.sequence) invalid('查看位置无效');
    s.seen_sequence = Math.max(s.seen_sequence || 0, input.sequence); await this.save(s); return { seen_sequence: s.seen_sequence };
  }
  async create(actor, input) {
    if (!this.accepting) throw conflict('服务正在关闭');
    const conversation = decimalId(input?.conversation_id, 'conversation_id');
    const found = [...this.sessions.values()].find(s => s.tenant === actor.tenant && s.user === actor.user && s.conversation_id === conversation);
    if (found) return this.view(found);
    const source = input.source_type || 'manual';
    if (!['manual', 'voice', 'schedule', 'event'].includes(source)) invalid('来源类型无效');
    const parent = input.parent_id == null ? null : decimalId(input.parent_id, 'parent_id');
    const now = new Date().toISOString();
    const s = { id: randomUUID(), tenant: actor.tenant, user: actor.user, conversation_id: conversation, source_type: source, parent_id: parent, status: 'idle', sdk_session_id: null,
      sequence: 0, events: [], messages: [], interactions: [], resources: [], artifacts: [], snapshots: [], receipts: {}, created_at: now, updated_at: now };
    this.sessions.set(s.id, s);
    try {
      for (const path of Object.values(this.paths(s))) await mkdir(path, { recursive: true, mode: 0o700 });
      await this.save(s);
    }
    catch (e) { this.sessions.delete(s.id); throw e; }
    return this.view(s);
  }
  actorKey(actor) { if (!/^(0|[1-9][0-9]{0,18})$/.test(actor.tenant)) invalid('租户无效'); return `${actor.tenant}-${decimalId(actor.user, 'user')}`; }
  async capabilityState(actor) {
    const key = this.actorKey(actor);
    if (!this.capabilityStates.has(key)) {
      let state = { items: [] };
      try { state = JSON.parse(await readFile(join(this.dir, 'capabilities', `${key}.json`), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      this.capabilityStates.set(key, state);
    }
    return this.capabilityStates.get(key);
  }
  async capabilityCatalog(actor) {
    return await this.executor.plugins?.({ base: this.dir, identity: actor }) || [];
  }
  async capabilities(actor) {
    const available = await this.capabilityCatalog(actor), state = await this.capabilityState(actor);
    return { items: [...await builtInCapabilities(), ...available.map(({ manifest }) => {
      const saved = state.items.find(p => p.id === manifest.id) || (manifest.builtin ? { enabled:true, account:'当前账号' } : undefined);
      return { id: manifest.id, builtin: !!manifest.builtin, selectable: true, catalogType: manifest.catalogType || 'plugins', name: manifest.name || manifest.id, description: manifest.description || '',
        skills: (manifest.skills || []).map(skill => ({ ...skill, enabled: !(saved?.disabledSkills || []).includes(skill.name) })),
        tools: Object.entries(manifest.tools || {}).map(([id, tool]) => ({ id, label: tool.label })),
        connection: { label: manifest.connection?.label, actionLabel: manifest.connection?.actionLabel, description: manifest.connection?.description },
        installed: !!saved, enabled: !!saved?.enabled, connected: !!saved?.account, account: saved?.account || '' };
    })] };
  }
  async configureCapability(actor, input) {
    const key = this.actorKey(actor);
    if (this.capabilityLocks.has(key)) throw conflict('能力配置正在更新');
    if (!input || !['install', 'enable', 'disable', 'uninstall', 'connect', 'disconnect', 'enable_skill', 'disable_skill'].includes(input.action)) invalid('能力操作无效');
    this.capabilityLocks.add(key);
    try {
      const plugin = (await this.capabilityCatalog(actor)).find(p => p.manifest.id === input.plugin_id);
      if (!plugin) invalid('插件不可用');
      const state = await this.capabilityState(actor), next = structuredClone(state);
      let saved = next.items.find(p => p.id === input.plugin_id);
      if (plugin.manifest.builtin && input.action === 'uninstall') invalid('内置插件不能卸载');
      if (plugin.manifest.builtin && !saved) { saved = {id:input.plugin_id,enabled:true,account:'当前账号',disabledSkills:[]}; next.items.push(saved); }
      if (input.action === 'install') { if (!saved) next.items.push({ id: input.plugin_id, enabled: true, disabledSkills: [] }); }
      else {
        if (!saved) invalid('请先安装插件');
        if (input.action === 'uninstall') next.items = next.items.filter(p => p !== saved);
        if (input.action === 'enable') saved.enabled = true;
        if (input.action === 'disable') saved.enabled = false;
        if (input.action === 'disconnect') delete saved.account;
        if (['enable_skill', 'disable_skill'].includes(input.action)) {
          if (!plugin.manifest.skills?.some(s => s.name === input.skill)) invalid('技能不存在');
          saved.disabledSkills = (saved.disabledSkills || []).filter(s => s !== input.skill);
          if (input.action === 'disable_skill') saved.disabledSkills.push(input.skill);
        }
        if (input.action === 'connect') {
          try { saved.account = (await this.executor.connectPlugin(plugin, actor)).account; }
          catch { throw new ApiError(403, 'PLUGIN_CONNECTION_FAILED', '连接未通过，请检查系统配置与当前账号权限'); }
        }
      }
      const dir = join(this.dir, 'capabilities'); await mkdir(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `${key}.json`); await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); await rename(file + '.tmp', file);
      this.capabilityStates.set(key, next);
      return this.capabilities(actor);
    } finally { this.capabilityLocks.delete(key); }
  }
  async plugins(actor, id) {
    const s = this.get(actor, id), catalog = await this.capabilities(actor);
    return { items: catalog.items.filter(p => !p.builtin || p.selectable).map(p => ({ ...p, added: !!s.plugins?.some(v => v.id === p.id && v.added) })) };
  }
  async configurePlugin(actor, id, input) {
    const s = this.get(actor, id);
    if (active(s) || s.status === 'closed' || s._pluginBusy) throw conflict('请等待当前操作结束');
    if (!input || !['add', 'remove'].includes(input.action)) invalid('请在能力中心管理插件与账号');
    s._pluginBusy = true;
    try {
      const plugin = (await this.capabilities(actor)).items.find(p => p.id === input.plugin_id);
      if (input.action === 'add' && (!plugin?.installed || !plugin.enabled || !plugin.connected)) invalid('请先到能力中心启用插件并连接账号');
      if (active(s) || s.status === 'closed') throw conflict('会话状态已变化');
      s.plugins = [...(s.plugins || []).filter(p => p.id !== input.plugin_id), ...(input.action === 'add' ? [{ id: plugin.id, name: plugin.name, added: true }] : [])];
      await this.emit(s, 'plugins_changed', { items: s.plugins }); return this.view(s);
    } finally { delete s._pluginBusy; }
  }
  async requireCapabilities(actor, ids, tool, input) {
    if (!ids.length) return;
    const items = (await this.capabilities(actor)).items;
    if (tool === 'Skill' && items.some(p => p.skills.some(s => !s.enabled && input?.skill === `${p.id}:${s.id || s.name}`))) throw conflict('此技能已停用');
    if (ids.some(id => !items.some(p => p.id === id && p.installed && p.enabled && p.connected))) throw conflict('会话能力已停用或断开，请移除或到能力中心重新连接');
  }
  async send(actor, id, input) {
    const s = this.get(actor, id), key = uuid(input?.request_id), prompt = text(input?.prompt, 12000, '工作指令');
    const resourceIds = input.resource_ids || [];
    if (!Array.isArray(resourceIds) || resourceIds.length > 20 || resourceIds.some(id => !s.resources.some(r => r.id === id))) invalid('关联资源无效');
    const character = input.character || s.character || '';
    const hash = digest({ prompt, resourceIds, ...(character ? {character} : {}) });
    if (s.receipts[key]) { if (s.receipts[key] !== hash) throw conflict('相同请求标识不能用于不同指令'); return this.view(s); }
    if (s.character && character !== s.character) throw conflict('已有任务不能切换角色，请新建任务');
    const persona = s.persona || (character ? await characterContext(character) : '');
    // Loading a role yields; recheck role binding and the receipt before admission.
    if (s.character && character !== s.character) throw conflict('已有任务不能切换角色，请新建任务');
    if (s.receipts[key]) { if (s.receipts[key] !== hash) throw conflict('相同请求标识不能用于不同指令'); return this.view(s); }
    if (!this.accepting || s._pluginBusy || s.status === 'closed') throw conflict('工作会话忙碌或已关闭，请刷新');
    if (active(s) || this.runs.has(s.id)) {
      const run = this.runs.get(s.id);
      if (input.enqueue !== true || !run?.accepting || run.controller.signal.aborted) throw conflict('当前执行正在结束，请稍后发送');
      if (s.messages.filter(message => message.delivery === 'queued').length >= 10) throw conflict('最多排队 10 条消息，请等待处理');
      s.receipts[key] = hash;
      s.messages.push({ id: key, role: 'user', content: prompt, resource_ids: resourceIds, delivery: 'queued', created_at: new Date().toISOString() });
      await this.emit(s, 'message_queued', { id: key });
      return this.view(s);
    }
    if (this.occupied() >= this.concurrency) throw new ApiError(429, 'RATE_LIMITED', '工作执行较多，请稍后再试');
    s.character = character; s.persona = persona;
    s.run_id = key; s.status = 'running'; s.receipts[key] = hash;
    s.messages.push({ id: key, role: 'user', content: prompt, resource_ids: resourceIds, delivery: 'running', created_at: new Date().toISOString() });
    const controller = new AbortController();
    const run = { controller, slot: true, accepting: true, pending: new Map(), done: null, authorization: new Map() }; this.runs.set(s.id, run);
    try { await this.emit(s, 'status', { status: 'running' }); }
    catch (e) { this.runs.delete(s.id); s.status = 'interrupted'; throw e; }
    run.done = this.execute(s, run, prompt, resourceIds);
    return this.view(s);
  }
  async execute(s, run, prompt, ids) {
    let timer, remaining = this.timeoutMs, started;
    run.resumeTimer = () => { started = Date.now(); timer = setTimeout(() => run.controller.abort(), Math.max(1, remaining)); timer.unref?.(); };
    run.pauseTimer = () => { clearTimeout(timer); remaining -= Date.now() - started; };
    run.resumeTimer();
    try {
      const ensureCurrent = () => { if (run.controller.signal.aborted || this.runs.get(s.id) !== run) throw conflict('当前执行已失效'); };
      const actor = { tenant: s.tenant, user: s.user }, pluginIds = (s.plugins || []).filter(p => p.added).map(p => p.id);
      await this.requireCapabilities(actor, pluginIds);
      let handled = false;
      const finishTurn = async result => {
        ensureCurrent(); handled = true;
        const message = s.messages.find(message => message.id === s.run_id);
        if (message) message.delivery = result.success ? 'completed' : 'failed';
        s.messages.push({ id: randomUUID(), role: 'assistant', content: result.text || '', created_at: new Date().toISOString(), run_id: s.run_id });
        const next = result.success && s.messages.find(message => message.delivery === 'queued');
        // Close admission before yielding: a late submission must not be lost at the result boundary.
        if (!next) {
          run.accepting = false;
          for (const message of s.messages) if (message.delivery === 'queued') message.delivery = 'cancelled';
        }
        s.status = next ? 'running' : result.success ? 'idle' : 'failed';
        await this.emit(s, 'result', { ...result, status: s.status });
        ensureCurrent();
        if (!next) return null;
        await this.requireCapabilities(actor, pluginIds);
        next.delivery = 'running'; s.run_id = next.id; run.authorization.clear();
        await this.emit(s, 'status', { status: 'running' });
        handled = false;
        return { prompt: next.content, currentResourceIds: next.resource_ids || [],
          resources: s.resources.filter(r => s.messages.some(m => m.role === 'user' && !['queued', 'cancelled'].includes(m.delivery) && m.resource_ids?.includes(r.id))) };
      };
      const result = await this.executor.run({ conversationId:s.conversation_id, persona: s.persona || '', onTurnResult: finishTurn, validatePlugins: (tool, input) => this.requireCapabilities(actor, pluginIds, tool, input), ...this.paths(s), sessionId: s.sdk_session_id, pluginIds: (s.plugins || []).filter(p => p.added).map(p => p.id), prompt, identity: { tenant: s.tenant, user: s.user },
        currentResourceIds: ids, resources: s.resources.filter(r => s.messages.some(message => message.role === 'user' && !['queued', 'cancelled'].includes(message.delivery) && message.resource_ids?.includes(r.id))), signal: run.controller.signal,
        onSession: async id => { ensureCurrent(); if (s.sdk_session_id && s.sdk_session_id !== id) throw conflict('原生会话映射不一致，请核对后继续'); s.sdk_session_id = id; await this.save(s); },
        onEvent: (type, data) => { ensureCurrent(); return this.emit(s, type, data); },
        ask: (kind, tool, input, toolUseId, signal) => this.ask(s, run, kind, tool, input, toolUseId, signal),
        backup: async () => { ensureCurrent(); const item = await snapshot(this.paths(s).cwd, join(this.paths(s).base, 'snapshots')); ensureCurrent(); s.snapshots.push(item); await this.emit(s, 'snapshot', item); },
        publish: async path => { ensureCurrent(); const item = await publishFile(this.paths(s).cwd, join(this.paths(s).base, 'artifacts'), path); ensureCurrent(); item.run_id = s.run_id; s.artifacts.push(item); await this.emit(s, 'artifact', item); return item; },
      });
      if (run.controller.signal.aborted) throw new Error('interrupted');
      if (!handled) await finishTurn(result);
    } catch (e) {
      if (s.status === 'waiting' && !run.controller.signal.aborted && s.interactions.some(i => i.status === 'pending')) run.preserveWait = true;
      if (run.preserveWait) return;
      run.accepting = false;
      for (const message of s.messages) if (['queued', 'running'].includes(message.delivery)) message.delivery = message.delivery === 'running' ? 'interrupted' : 'cancelled';
      s.status = run.controller.signal.aborted ? 'interrupted' : 'failed';
      await this.emit(s, 'error', { status: s.status, code: e instanceof ApiError ? e.code : 'WORK_EXECUTION_FAILED', message: e instanceof ApiError ? e.message : '执行中断或未完成，请核对操作记录后继续' });
    } finally {
      clearTimeout(timer); clearTimeout(run.hibernate); run.accepting = false;
      if (run.preserveWait) {
        for (const resolve of run.pending.values()) resolve(null);
        this.runs.delete(s.id); await this.save(s); await this.drain();
        return;
      }
      for (const message of s.messages) if (['queued', 'running'].includes(message.delivery)) message.delivery = message.delivery === 'running' ? 'interrupted' : 'cancelled';
      for (const i of s.interactions) if (i.status === 'pending') {
        i.status = 'expired';
        await this.emit(s, 'interaction_expired', { id: i.id, status: i.status });
      }
      for (const resolve of run.pending.values()) resolve(null);
      this.runs.delete(s.id); await this.save(s); await this.drain();
    }
  }
  async ask(s, run, kind, tool, input, toolUseId, signal) {
    if (run.controller.signal.aborted || signal?.aborted) return null;
    const binding = digest({ run: s.run_id, tool, input, toolUseId });
    if (run.authorization.has(binding)) return run.authorization.get(binding);
    const interaction = { id: randomUUID(), kind, tool, input: structuredClone(input), binding, status: 'pending', run_id: s.run_id, created_at: new Date().toISOString() };
    s.interactions.push(interaction); s.status = 'waiting';
    if (run.slot) {
      run.slot = false; run.pauseTimer?.();
      run.hibernate = setTimeout(() => { if (s.status === 'waiting' && !run.controller.signal.aborted) { run.preserveWait = true; run.controller.abort(); } }, this.suspendAfterMs);
      run.hibernate.unref?.();
    }
    let resolveAnswer;
    const answer = new Promise(resolve => { resolveAnswer = resolve; }); run.pending.set(interaction.id, resolveAnswer);
    const abort = () => resolveAnswer(null); run.controller.signal.addEventListener('abort', abort, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await this.emit(s, 'interaction', interaction);
      await this.drain();
      const value = await answer;
      if (interaction.status === 'pending' && !run.preserveWait) {
        interaction.status = 'expired';
        if (s.status === 'waiting' && !s.interactions.some(i => i.status === 'pending')) { s.resume_pending = true; await this.drain(); }
        await this.emit(s, 'interaction_expired', { id: interaction.id, status: interaction.status });
      }
      run.authorization.set(binding, value); return value;
    } finally { run.controller.signal.removeEventListener('abort', abort); signal?.removeEventListener('abort', abort); run.pending.delete(interaction.id); }
  }
  async answer(actor, id, interactionId, value) {
    const s = this.get(actor, id), i = s.interactions.find(i => i.id === uuid(interactionId));
    if (!i || typeof value?.binding !== 'string' || i.binding !== value.binding) throw conflict('交互已失效或操作参数已变化');
    const answer = i.kind === 'question' ? { answers: value.answers } : { approved: value.approved };
    if (i.kind === 'question') {
      if (!answer.answers || typeof answer.answers !== 'object' || Array.isArray(answer.answers) || JSON.stringify(answer.answers).length > 16000) invalid('需要问题答复');
      for (const q of i.input.questions || []) if (typeof answer.answers[q.question] !== 'string' || !answer.answers[q.question].trim()) invalid('请回答所有问题');
    } else if (typeof answer.approved !== 'boolean') invalid('需要明确同意或拒绝');
    if (i.status === 'answered') { if (digest(i.answer) === digest(answer)) return this.view(s); throw conflict('该交互已答复，不能更改'); }
    const run = this.runs.get(s.id);
    if (i.status !== 'pending' || i.run_id !== s.run_id || s.status !== 'waiting' || run && (!run.pending.has(i.id) || run.controller.signal.aborted)) throw conflict('交互已失效，请重新核验');
    i.status = 'answered'; i.answer = answer;
    s.resume_pending = !s.interactions.some(i => i.status === 'pending');
    await this.emit(s, 'interaction_answered', { id: i.id, status: i.status });
    await this.drain(); return this.view(s);
  }
  async stop(actor, id, close = false) {
    const s = this.get(actor, id), run = this.runs.get(s.id);
    if (s.status === 'running' && !run) throw conflict('资源正在写入，请稍后再操作');
    s.resume_pending = false;
    if (!run) for (const message of s.messages) if (['queued', 'running'].includes(message.delivery)) message.delivery = message.delivery === 'running' ? 'interrupted' : 'cancelled';
    for (const i of s.interactions) if (i.status === 'pending') i.status = 'expired';
    if (run) run.preserveWait = false;
    run?.controller.abort();
    if (run?.done) await run.done;
    s.status = close ? 'closed' : s.status === 'closed' ? 'closed' : 'interrupted';
    await this.emit(s, 'status', { status: s.status }); return this.view(s);
  }
  async upload(actor, id, input) {
    const s = this.get(actor, id); if (active(s) || s.status === 'closed') throw conflict('请等待当前执行结束再添加资源');
    // Reserve synchronously to exclude simultaneous send/upload writes.
    s.status = 'running';
    try { const item = await uploadFile(this.paths(s).cwd, input); s.resources.push(item); await this.emit(s, 'resource', item); return item; }
    finally { s.status = 'idle'; await this.save(s); }
  }
  async artifact(actor, id, artifactId) {
    const s = this.get(actor, id), item = s.artifacts.find(i => i.id === uuid(artifactId));
    if (!item) throw new ApiError(404, 'WORK_NOT_FOUND', '产物不存在');
    return { ...item, content_base64: (await readFile(join(this.paths(s).base, 'artifacts', item.id))).toString('base64') };
  }
  events(actor, id, after = 0) {
    const s = this.get(actor, id); if (!Number.isSafeInteger(after) || after < 0 || after > s.sequence) invalid('事件游标无效');
    const items = []; let size = 0;
    for (const event of s.events) {
      if (event.sequence <= after) continue;
      const bytes = Buffer.byteLength(JSON.stringify(event)); if (items.length && size + bytes > 10 * 1024 * 1024) break;
      items.push(event); size += bytes; if (items.length >= 100) break;
    }
    return { items, sequence: s.sequence, status: s.status };
  }
  subscribe(actor, id, after, listener) {
    const s = this.get(actor, id); this.events(actor, id, after);
    const listeners = this.listeners.get(s.id) || new Set(); this.listeners.set(s.id, listeners);
    listeners.add(listener);
    for (const event of s.events) if (event.sequence > after) listener(event);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(s.id); };
  }
  async close() { this.accepting = false; for (const [id, run] of this.runs) { run.preserveWait = this.sessions.get(id).status === 'waiting'; run.controller.abort(); } await Promise.allSettled([...this.runs.values()].map(r => r.done)); }
}
