"""OpenAI Agents SDK adapter; tool policy is shared with Claude mode."""
import asyncio
import json
from contextlib import suppress
from copy import deepcopy
from ._sdk_tools import invoke_tool, history_messages
from ._recovery import binding, restore, checkpoint, balanced_items


class OpenAIExecutor:
    """Stream SDK output and retain full completed model/tool items for continuation."""
    def __init__(self, options):
        from .main import WorkError
        try:
            import agents
        except ImportError:
            raise WorkError('SDK_UNAVAILABLE') from None
        if set(options) - {'model', 'instructions', 'max_turns', 'api_key', 'base_url', 'api'}:
            raise WorkError('INVALID_SDK_OPTIONS')
        from ._connection import validate_connection
        validate_connection(options)
        if options.get('api', 'responses') not in ('responses', 'chat_completions'):
            raise WorkError('INVALID_SDK_OPTIONS')
        if options.get('api') == 'chat_completions' and (not isinstance(options.get('model'), str) or not options['model'].strip()):
            raise WorkError('INVALID_SDK_OPTIONS')
        self._sdk, self._options = agents, dict(options)

    async def run(self, context):
        """Use real Agent/Runner APIs and wrap every host tool before invocation."""
        sdk = self._sdk
        signature = binding('openai', self._options, context.plugins)
        saved = restore(context, 'openai', signature)
        inputs = saved['items'] + history_messages(context)[-1:] if saved else history_messages(context)
        await context.checkpoint(checkpoint('openai', signature, items=inputs))
        tools = []
        tool_lock = asyncio.Lock()
        for name, tool in context.plugins.items():
            async def invoke(wrapper, raw, name=name, tool=tool):
                async with tool_lock:
                    return await invoke_tool(name, tool, json.loads(raw), context)
            tools.append(sdk.FunctionTool(name=name, description=tool.description,
                                          params_json_schema=deepcopy(tool.schema),
                                          on_invoke_tool=invoke, strict_json_schema=False))
        options = self._options
        client = None
        model = options.get('model')
        if 'api_key' in options or options.get('api') == 'chat_completions':
            from openai import AsyncOpenAI
            # Fresh per-run client is closed on success, failure and cancellation.
            # Explicit key also pins the default URL, ignoring ambient overrides.
            connection = {'base_url': options.get('base_url', 'https://api.openai.com/v1')}
            if 'api_key' in options:
                connection['api_key'] = options['api_key']
            client = AsyncOpenAI(**connection)
            model_type = sdk.OpenAIChatCompletionsModel if options.get('api') == 'chat_completions' else sdk.OpenAIResponsesModel
            model = model_type(model=model, openai_client=client)
        agent = sdk.Agent(name='Work', instructions=options.get('instructions', 'Complete the requested work using the provided tools.'),
                          model=model, tools=tools)
        result = None
        try:
            await context.emit('sdk:openai:started')
            # Disable exporting prompt/tool traces by default. No global SDK state is
            # changed, so independent instances retain separate runtime configuration.
            result = sdk.Runner.run_streamed(agent, input=inputs,
                                             max_turns=options.get('max_turns', 20),
                                             run_config=sdk.RunConfig(tracing_disabled=True))
            async for event in result.stream_events():
                if context.cancelled.is_set():
                    raise asyncio.CancelledError
                if event.type == 'raw_response_event' and event.data.type == 'response.output_text.delta':
                    await context.delta(event.data.delta)
                elif event.type == 'run_item_stream_event':
                    # SDK items include tool inputs/results, unlike final-text history.
                    # Save only balanced boundaries; pending actions are never replayed.
                    items = result.to_input_list()
                    if balanced_items(items):
                        await context.checkpoint(checkpoint('openai', signature, items=items))
            await context.checkpoint(checkpoint('openai', signature, items=result.to_input_list()))
            if context.cancelled.is_set():
                raise asyncio.CancelledError
            if not isinstance(result.final_output, str):
                from .main import WorkError
                raise WorkError('INVALID_EXECUTOR_OUTPUT')
            return {'content': result.final_output}
        finally:
            if result is not None:
                result.cancel()
                # The SDK owns background tasks. Drain its cancellation sentinel
                # before releasing the per-run HTTP client.
                with suppress(Exception):
                    async for _ in result.stream_events():
                        pass
            if client is not None:
                await client.close()

    async def cancel(self, session_id, run_id):
        """Local Runner cancellation cannot attest remote requests have stopped."""
        return False
