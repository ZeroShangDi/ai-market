"""Claude Agent SDK adapter with explicit host tools and no implicit built-ins."""
import asyncio
import json
from copy import deepcopy
from ._sdk_tools import invoke_tool, history_messages
from ._recovery import binding, restore, checkpoint


class ClaudeExecutor:
    """One client per turn; persist the native session reference for explicit continuation."""
    def __init__(self, options):
        from .main import WorkError
        try:
            import claude_agent_sdk
        except ImportError:
            raise WorkError('SDK_UNAVAILABLE') from None
        if set(options) - {'model', 'instructions', 'max_turns', 'cwd', 'cli_path', 'api_key', 'base_url', 'auth_type'}:
            raise WorkError('INVALID_SDK_OPTIONS')
        from ._connection import validate_connection
        validate_connection(options)
        if options.get('auth_type', 'api_key') not in ('api_key', 'auth_token'):
            raise WorkError('INVALID_SDK_OPTIONS')
        self._sdk, self._options = claude_agent_sdk, dict(options)

    async def run(self, context):
        """Execute through ClaudeSDKClient; MCP handlers enforce package approval."""
        from .main import WorkError
        sdk = self._sdk
        signature = binding('claude', self._options, context.plugins)
        saved = restore(context, 'claude', signature)
        registered = []
        tool_lock = asyncio.Lock()
        for name, tool in context.plugins.items():
            async def invoke(arguments, name=name, tool=tool):
                async with tool_lock:
                    output = await invoke_tool(name, tool, arguments, context)
                return {'content': [{'type': 'text', 'text': output}]}
            registered.append(sdk.tool(name, tool.description, deepcopy(tool.schema))(invoke))
        names = ['mcp__work__' + name for name in context.plugins]

        async def permission(name, arguments, permission_context):
            # Approval occurs in our handler; native and unexpected tools cannot
            # bypass it even if returned by a model or inherited configuration.
            if name in names:
                return sdk.PermissionResultAllow(updated_input=arguments)
            return sdk.PermissionResultDeny(message='Tool is not registered by the host')

        async def pre_tool(data, tool_use_id, hook_context):
            if data.get('tool_name') not in names:
                return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                                               'permissionDecision': 'deny',
                                               'permissionDecisionReason': 'Tool is not registered by the host'}}
            return {}

        options = self._options
        kwargs = dict(include_partial_messages=True, tools=[], allowed_tools=[], setting_sources=[], permission_mode='default',
                      can_use_tool=permission,
                      hooks={'PreToolUse': [sdk.HookMatcher(hooks=[pre_tool])]},
                      mcp_servers={'work': sdk.create_sdk_mcp_server(name='work', version='1.0.0', tools=registered)},
                      system_prompt=options.get('instructions', 'Complete the requested work using the provided tools.'),
                      max_turns=options.get('max_turns', 20))
        for key in ('model', 'cwd', 'cli_path'):
            if key in options:
                kwargs[key] = options[key]
        # Restrict MCP sources to these handlers; external skills are represented
        # through host tools instead of loading project/home settings implicitly.
        kwargs['strict_mcp_config'] = True
        if 'api_key' in options:
            # CLI overlays this environment on its subprocess only. Clear the
            # competing credential and pin all fallback models for this instance.
            env = {'ANTHROPIC_API_KEY': '', 'ANTHROPIC_AUTH_TOKEN': '',
                   'CLAUDE_CODE_OAUTH_TOKEN': '',
                   'CLAUDE_CODE_USE_BEDROCK': '0', 'CLAUDE_CODE_USE_VERTEX': '0',
                   'CLAUDE_CODE_USE_FOUNDRY': '0',
                   'ANTHROPIC_BASE_URL': options.get('base_url', 'https://api.anthropic.com')}
            credential = 'ANTHROPIC_AUTH_TOKEN' if options.get('auth_type') == 'auth_token' else 'ANTHROPIC_API_KEY'
            env[credential] = options['api_key']
            for variable in ('ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
                             'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
                             'ANTHROPIC_SMALL_FAST_MODEL'):
                env[variable] = options['model']
            kwargs['env'] = env
        if saved:
            kwargs['resume'] = saved['session_id']
        client = sdk.ClaudeSDKClient(options=sdk.ClaudeAgentOptions(**kwargs))
        await context.emit('sdk:claude:started')
        # Native resume already contains earlier messages and tool history.
        messages = history_messages(context)
        prompt = json.dumps({'conversation': messages[-1:] if saved else messages}, ensure_ascii=False)
        async with client:
            try:
                await client.query(prompt)
                native_id = saved['session_id'] if saved else None
                async for message in client.receive_response():
                    observed_id = (message.data.get('session_id') if isinstance(message, sdk.SystemMessage)
                                   else getattr(message, 'session_id', None))
                    if isinstance(observed_id, str) and observed_id and observed_id != native_id:
                        native_id = observed_id
                        await context.checkpoint(checkpoint('claude', signature, session_id=native_id))
                    if isinstance(message, sdk.StreamEvent):
                        event = message.event
                        delta = event.get('delta', {})
                        if event.get('type') == 'content_block_delta' and delta.get('type') == 'text_delta':
                            await context.delta(delta['text'])
                    if context.cancelled.is_set():
                        raise asyncio.CancelledError
                    if isinstance(message, sdk.ResultMessage):
                        if (message.is_error or message.subtype != 'success'
                                or getattr(message, 'terminal_reason', None) not in (None, 'completed')):
                            raise WorkError('EXECUTOR_FAILED')
                        if not isinstance(message.result, str):
                            raise WorkError('INVALID_EXECUTOR_OUTPUT')
                        return {'content': message.result}
            except asyncio.CancelledError:
                try:
                    await asyncio.wait_for(client.interrupt(), 5)
                except Exception:
                    pass
                raise
        raise WorkError('INVALID_EXECUTOR_OUTPUT')

    async def cancel(self, session_id, run_id):
        """Interrupt/disconnect is not an acknowledgement of all remote effects."""
        return False
