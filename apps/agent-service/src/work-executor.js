import { mkdir, readFile, cp, readdir, realpath, lstat, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, digest } from './validation.js';
import { collectSources } from './web-chat.js';
import { providerConfig } from './provider.js';
import { loadCapabilityPlugins, discoverCapabilityPlugins, pluginConnection } from './work-plugins.js';
import { workspacePath, workspaceSize, contained } from './work-files.js';

const bundledSkills = fileURLToPath(new URL('../resources/work-skills', import.meta.url));
const readTools = new Set(['Read', 'Glob', 'Grep', 'Skill', 'ToolSearch', 'TaskOutput', 'TaskGet', 'TaskList', 'TodoWrite']);
const controlTools = new Set(['Agent', 'Task', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode', 'ExitPlanMode', 'WebSearch', 'WebFetch']);
const toolResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const hookDecision = (decision, reason, updatedInput) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason, ...(updatedInput ? { updatedInput } : {}) } });

// Bubblewrap must not create SDK placeholders underneath an already read-only
// .claude/.git mount. Seed only fixed, inert configuration paths before launch.
export async function prepareProtectedWorkspace(cwd) {
  const directories = ['.claude', '.claude/commands', '.claude/skills', '.claude/agents', '.claude/hooks', '.claude/workflows', '.git', '.git/hooks', '.git/info'];
  for (const relative of directories) {
    const target = join(cwd, relative);
    try { const stat = await lstat(target); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid protected workspace directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(target, { mode: 0o700 }); }
  }
  for (const relative of ['.claude/settings.json', '.claude/settings.local.json', '.claude/scheduled_tasks.json', '.git/config', '.git/info/attributes', 'CLAUDE.md']) {
    const target = join(cwd, relative);
    try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Invalid protected workspace file'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(target, relative.endsWith('.json') ? '{}' : '', { flag: 'wx', mode: 0o600 }); }
  }
}

export async function loadWorkConfig(path) {
  if (!path) return { plugins: [], mcpServers: {}, toolRisk: {}, networkDomains: [] };
  const value = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid WORK_MANAGED_CONFIG');
  if (value.skillsDir && (typeof value.skillsDir !== 'string' || !value.skillsDir.startsWith('/'))) throw new Error('Invalid skills directory');
  for (const [name, risk] of Object.entries(value.toolRisk || {})) if (!/^mcp__\w+__[\w-]+$/.test(name) || ![1, 2, 3].includes(risk)) throw new Error('Invalid MCP risk policy');
  if (!Array.isArray(value.plugins || []) || (value.plugins || []).some(path => typeof path !== 'string' || !path.startsWith('/'))) throw new Error('Plugins require absolute managed paths');
  if (!Array.isArray(value.networkDomains || []) || (value.networkDomains || []).some(domain => !/^(?:\*\.)?[a-z0-9.-]+$/.test(domain))) throw new Error('Invalid sandbox network domains');
  if (value.mcpServers?.work) throw new Error('Reserved work MCP server');
  return { plugins: [], mcpServers: {}, toolRisk: {}, networkDomains: [], ...value };
}

export function createWorkExecutor({ provider = process.env.AGENT_PROVIDER || 'anthropic', apiKey = process.env.ANTHROPIC_API_KEY,
  deepseekApiKey = process.env.DEEPSEEK_API_KEY, model = process.env.AGENT_MODEL, managedConfig = process.env.WORK_MANAGED_CONFIG,
  loadSdk = () => import('@anthropic-ai/claude-agent-sdk'), loadZod = () => import('zod'), maxTurns = 40, capabilityPlugins } = {}) {
  return {
    plugins: ctx => discoverCapabilityPlugins({ ctx, entries: capabilityPlugins }),
    connectPlugin: pluginConnection,
    async run(ctx) {
    const selected = providerConfig({ provider, apiKey, deepseekApiKey, model });
    const [sdk, { z }, managed] = await Promise.all([loadSdk(), loadZod(), loadWorkConfig(managedConfig)]);
    const { cwd, config, home, base, signal } = ctx;
    const capabilities = await loadCapabilityPlugins({ sdk, z, ctx, entries: capabilityPlugins });
    for (const id of Object.keys(capabilities.servers)) if (managed.mcpServers[id]) throw new Error('Duplicate plugin MCP server');
    const pluginPaths = [...new Set([...managed.plugins, ...capabilities.paths])];
    await prepareProtectedWorkspace(cwd);
    const protectedConfig = managedConfig ? [resolve(managedConfig), await realpath(resolve(managedConfig))] : [];
    await mkdir(join(config, 'skills'), { recursive: true, mode: 0o700 });
    // Copy only operator-managed skills, never user uploads or personal ~/.claude settings.
    for (const root of [bundledSkills, ...(managed.skillsDir ? [resolve(managed.skillsDir)] : [])]) {
      for (const name of await readdir(root)) await cp(join(root, name), join(config, 'skills', name), { recursive: true, force: true, dereference: true });
    }
    const credentialNames = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'DEEPSEEK_API_KEY', 'AGENT_INTERNAL_TOKEN'];
    const env = { PATH: process.env.PATH, HOME: home, TMPDIR: join(base, 'runtime'), CLAUDE_CONFIG_DIR: config, ...selected.env,
      DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' };
    await mkdir(env.TMPDIR, { recursive: true, mode: 0o700 });
    const sandbox = { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false,
      enableWeakerNestedSandbox: false,
      network: { allowedDomains: managed.networkDomains, allowAllUnixSockets: false, allowLocalBinding: false },
      filesystem: { allowWrite: [cwd], denyWrite: [config, home, join(cwd, '.claude'), join(cwd, 'CLAUDE.md'), join(cwd, '.git'), ...pluginPaths],
        // /dev/fd is a /proc alias, not a directory that bubblewrap can mask.
        denyRead: [dirname(dirname(base)), process.cwd(), process.env.HOME || '/root', '/proc', '/sys', '/run/secrets', '/var/run/secrets', ...protectedConfig],
        allowRead: [cwd, join(config, 'skills'), ...pluginPaths] },
      credentials: { envVars: credentialNames.map(name => ({ name, mode: 'deny' })), files: protectedConfig.map(path => ({ path, mode: 'deny' })) } };
    const registered = sdk.createSdkMcpServer({ name: 'work', version: '1.0.0', alwaysLoad: true, tools: [
      sdk.tool('workspace_info', 'Read the authorized workspace and available resources. No business credentials are available to native commands.', {}, async () => toolResult({ cwd, resources: ctx.resources, native_files: true }), { annotations: { readOnlyHint: true } }),
      sdk.tool('present_files', 'Publish finished workspace files as authenticated downloadable artifacts. Use for every user deliverable; no Markdown conversion is required.', { paths: z.array(z.string()).min(1).max(10) }, async ({ paths }) => {
        const artifacts = []; for (const path of paths) artifacts.push(await ctx.publish(path)); return toolResult({ artifacts });
      }, { annotations: { readOnlyHint: false, destructiveHint: false } }),
    ] });
    const decisions = new Map();
    async function question(tool, input, id) {
      const answer = await ctx.ask('question', tool, input, id);
      return answer ? { behavior: 'allow', updatedInput: { ...input, answers: answer.answers } } : { behavior: 'deny', message: '用户已取消提问' };
    }
    async function authorize(tool, input, id) {
      if (signal.aborted) return { behavior: 'deny', message: '工作已打断' };
      try { await ctx.validatePlugins?.(tool, input); } catch (e) { return { behavior: 'deny', message: e.message }; }
      const key = digest({ tool, input, id });
      if (decisions.has(key)) return decisions.get(key);
      const promise = (async () => {
        if (tool === 'AskUserQuestion') return question(tool, input, id);
        let risk = 3;
        try {
          if (readTools.has(tool) || ['Write', 'Edit', 'NotebookEdit'].includes(tool)) {
            const path = input.file_path || input.notebook_path || input.path || '.';
            const managedRoot = [join(config, 'skills'), ...pluginPaths].find(root => contained(root, resolve(cwd, path)));
            const target = await workspacePath(readTools.has(tool) && managedRoot ? managedRoot : cwd, path, { write: !readTools.has(tool) });
            if (tool === 'Glob') await workspacePath(cwd, join(target, input.pattern || '*'), { write: true });
            await workspaceSize(cwd);
            if (!readTools.has(tool)) await ctx.backup();
            risk = 1;
          } else if (tool === 'Bash') {
            if (input.dangerouslyDisableSandbox || input.run_in_background) return { behavior: 'deny', message: '仅允许受隔离的前台命令' };
            await ctx.backup();
            // No network, business credentials or writes outside a restorable workspace.
            // Network-capable arbitrary commands require review; this is not a confirmed business side effect.
            risk = managed.networkDomains.length ? 2 : 1;
          } else if (capabilities.tools[tool]) risk = capabilities.tools[tool].risk;
          else if (capabilities.availableIds.some(id => tool.startsWith(`mcp__${id}__`))) return { behavior: 'deny', message: '此插件未添加到当前会话' };
          else if (tool.startsWith('mcp__work__')) risk = 1;
          else if (tool.startsWith('mcp__')) risk = managed.toolRisk[tool] || 3;
          else if (controlTools.has(tool)) {
            if (input.run_in_background || input.isolation) return { behavior: 'deny', message: '本阶段子任务必须在当前工作区内前台完成' };
            risk = ['Agent', 'Task'].includes(tool) ? 2 : 1;
          } else return { behavior: 'deny', message: '此原生工具尚未接入 Work 的执行边界' };
        } catch (e) { return { behavior: 'deny', message: e instanceof ApiError ? e.message : '无法核验文件边界或保存恢复点' }; }
        await ctx.onEvent('audit', { tool_use_id: id, tool, label: capabilities.tools[tool]?.label, risk, input });
        if (risk > 1) {
          const definition = capabilities.tools[tool];
          let fields = [];
          if (definition) {
            try { fields = await definition.approval(input); }
            catch { return { behavior: 'deny', message: '操作预览已变化或无法核验，请重新检查' }; }
          }
          const answer = await ctx.ask('approval', tool, { ...input, _display: definition ? { label: definition.label, fields } : undefined, _risk: risk }, id);
          if (!answer?.approved || signal.aborted) return { behavior: 'deny', message: '用户拒绝、取消或批准失效' };
        }
        try { await ctx.validatePlugins?.(tool, input); } catch (e) { return { behavior: 'deny', message: e.message }; }
        return { behavior: 'allow', updatedInput: input };
      })();
      decisions.set(key, promise); return promise;
    }
    const controller = new AbortController();
    const options = { cwd, env, model: selected.model, abortController: controller, maxTurns,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '你是工作助理。先完成授权的工作，再简短汇报结果、产物和需要确认的事项。不要把过程说明当成功。仅访问当前工作区；文件原样处理，产物调用 work.present_files。业务操作只能使用受管理的 MCP，绝不寻找业务凭据。缺资料使用 AskUserQuestion。服务恢复后的未核实操作先检查结果，不得盲目重放。' },
      tools: { type: 'preset', preset: 'claude_code' }, settingSources: ['user'],
      // These features need a separate product lifecycle/identity model. Communication must use MCP.
      disallowedTools: ['CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup', 'Workflow', 'EnterWorktree', 'ExitWorktree', 'SendMessage', 'ReportFindings'],
      // Locked settings passed by the service override the isolated user profile.
      settings: { sandbox, disableAllHooks: false, autoMemoryEnabled: false }, sandbox,
      permissionMode: 'default', persistSession: true, includePartialMessages: true, includeHookEvents: true,
      ...(ctx.sessionId ? { resume: ctx.sessionId } : {}),
      plugins: pluginPaths.map(path => ({ type: 'local', path })),
      strictMcpConfig: true, mcpServers: { ...Object.fromEntries(Object.entries(managed.mcpServers).map(([name, server]) => [name,
        ['http', 'sse'].includes(server.type) ? { ...server, headers: { ...server.headers, 'X-AI-Tenant': ctx.identity?.tenant || '', 'X-AI-User': ctx.identity?.user || '' } }
          : { ...server, env: { ...server.env, WORK_TENANT_ID: ctx.identity?.tenant || '', WORK_USER_ID: ctx.identity?.user || '' } }])), work: registered, ...capabilities.servers },
      canUseTool: (tool, input, meta) => authorize(tool, input, meta.toolUseID),
      hooks: { PreToolUse: [{ hooks: [async event => {
        if (event.tool_name === 'AskUserQuestion') return hookDecision('ask', '需要用户答复');
        const decision = await authorize(event.tool_name, event.tool_input, event.tool_use_id);
        return hookDecision(decision.behavior, decision.message || '服务端执行边界已核验', decision.updatedInput);
      }] }] },
    };
    let finishInput;
    const inputDone = new Promise(resolve => { finishInput = resolve; });
    async function* promptStream() {
      yield { type: 'user', message: { role: 'user', content: `${ctx.prompt}${ctx.resources.length ? `\n关联的原始资源：${JSON.stringify(ctx.resources.map(({ id, name, path }) => ({ id, name, path })))}` : ''}` }, parent_tool_use_id: null, session_id: ctx.sessionId || '' };
      await inputDone;
    }
    let query;
    const streams = new Map(), webTools = new Map(), sources = new Map();
    const abort = () => { controller.abort(); finishInput(); query?.close?.(); };
    signal.addEventListener('abort', abort, { once: true });
    let final; let lastText = '';
    try {
      if (signal.aborted) throw new Error('interrupted');
      query = sdk.query({ prompt: promptStream(), options });
      for await (const message of query) {
        if (signal.aborted) throw new Error('interrupted');
        if (message.type === 'system' && message.subtype === 'init') {
          await ctx.onSession(message.session_id);
          await ctx.onEvent('capabilities', { tools: message.tools, skills: message.slash_commands, plugins: message.plugins?.map(p => ({ name: p.name })), mcp_servers: message.mcp_servers, model: message.model });
        } else if (message.type === 'stream_event') {
          const e = message.event;
          const parent = message.parent_tool_use_id || '';
          if (e.type === 'message_start') streams.set(parent, { id: e.message.id, blocks: new Map() });
          const stream = streams.get(parent);
          if (e.type === 'content_block_start') {
            stream?.blocks.set(e.index, e.content_block.id);
            if (e.content_block.type === 'tool_use') await ctx.onEvent('tool_start', { id: e.content_block.id, name: e.content_block.name, label: capabilities.tools[e.content_block.name]?.label, index: e.index, message_id: stream?.id, parent_tool_use_id: message.parent_tool_use_id });
          } else if (e.type === 'content_block_delta') {
            if (e.delta.type === 'text_delta') await ctx.onEvent('text_delta', { delta: e.delta.text, message_id: stream?.id, parent_tool_use_id: message.parent_tool_use_id });
            if (e.delta.type === 'input_json_delta') await ctx.onEvent('tool_delta', { id: stream?.blocks.get(e.index), message_id: stream?.id, index: e.index, delta: e.delta.partial_json, parent_tool_use_id: message.parent_tool_use_id });
          }
        } else if (message.type === 'assistant' || message.type === 'user') {
          const blocks = Array.isArray(message.message?.content) ? message.message.content : [];
          for (const block of blocks) {
            if (block.type === 'tool_use' && ['WebSearch', 'WebFetch'].includes(block.name)) webTools.set(block.id, { name: block.name, url: block.input?.url });
            if (block.type === 'tool_use') await ctx.onEvent('tool_call', { id: block.id, name: block.name, label: capabilities.tools[block.name]?.label, input: block.input, parent_tool_use_id: message.parent_tool_use_id });
            if (block.type === 'tool_result' && !block.is_error && webTools.has(block.tool_use_id)) {
              const tool = webTools.get(block.tool_use_id);
              collectSources(tool.name === 'WebFetch' ? { url: tool.url } : block.content, sources);
              await ctx.onEvent('sources', { items: [...sources.values()] });
            }
            if (block.type === 'tool_result') await ctx.onEvent('tool_result', { id: block.tool_use_id, content: block.content, is_error: !!block.is_error, parent_tool_use_id: message.parent_tool_use_id });
          }
          if (message.type === 'assistant') { lastText = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n'); await ctx.onEvent('assistant', { id: message.uuid, content: lastText, parent_tool_use_id: message.parent_tool_use_id }); }
        } else if (message.type === 'result') {
          final = { success: message.subtype === 'success' && !message.is_error, text: message.result || lastText, subtype: message.subtype, usage: message.usage };
          finishInput(); break;
        } else if (['tool_progress', 'system', 'task_started', 'task_notification'].includes(message.type)) {
          await ctx.onEvent('progress', { type: message.type, subtype: message.subtype, tool_use_id: message.tool_use_id, tool_name: message.tool_name, status: message.status });
        }
      }
      if (!final) throw new ApiError(502, 'WORK_RESULT_MISSING', '执行未返回最终结果，请核对后继续');
      return final;
    } finally { signal.removeEventListener('abort', abort); finishInput(); query?.close?.(); }
  } };
}
