"""Real SDK DTOs/tool registration with offline transport substitutes."""
import asyncio
import importlib.util
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from src.main import create_work, WorkTool, WorkError
from test_work import wait_state, verify

SDK_AVAILABLE = bool(importlib.util.find_spec('agents') and importlib.util.find_spec('claude_agent_sdk'))


def streamed(runner):
    """Use offline transport while preserving the synchronous streamed factory."""
    def start(agent, **kwargs):
        class Result:
            final_output = None
            done = False
            async def stream_events(self):
                if self.done:
                    return
                self.done = True
                value = await runner(agent, **kwargs)
                self.final_output = value.final_output
                yield SimpleNamespace(type='raw_response_event', data=SimpleNamespace(
                    type='response.output_text.delta', delta=self.final_output))
            def to_input_list(self):
                return kwargs['input'] + ([{'role': 'assistant', 'content': self.final_output}]
                                          if self.final_output is not None else [])
            def cancel(self):
                self.done = True
        return Result()
    return start


class ModeTests(unittest.TestCase):
    def test_invalid_mode_and_conflicting_executor(self):
        with self.assertRaisesRegex(WorkError, 'INVALID_MODE'):
            create_work(mode='wrong')
        with self.assertRaisesRegex(WorkError, 'INVALID_MODE'):
            create_work(mode='openai', executor=object())


@unittest.skipUnless(SDK_AVAILABLE, 'Install .[sdk] for SDK compatibility tests')
class SDKTests(unittest.IsolatedAsyncioTestCase):
    async def test_openai_real_types_tool_approval_and_history(self):
        import agents
        calls, inputs = [], []
        async def tool(arguments, context):
            calls.append(arguments)
            return {'answer': 42}
        async def runner(agent, input, max_turns, run_config):
            self.assertIsInstance(agent, agents.Agent)
            self.assertTrue(run_config.tracing_disabled)
            inputs.append(input)
            result = await agent.tools[0].on_invoke_tool(None, '{"value":3}')
            return SimpleNamespace(final_output=result)
        with patch.object(agents.Runner, 'run_streamed', side_effect=streamed(runner)):
            work = create_work(mode='openai', sdk_options={'model': 'host-model'}, verify_response=verify,
                               plugins={'lookup': WorkTool('Lookup', {'type': 'object', 'properties': {'value': {'type': 'integer'}}, 'required': ['value']}, tool)})
            sid = (await work.create_session())['id']
            run = await work.submit(sid, 'question')
            view = await wait_state(work, sid, 'waiting')
            self.assertEqual(calls, [])
            await work.respond_interaction(sid, run['id'], view['interactions'][0]['id'], {'approved': True}, response_ref='authenticated')
            result = await wait_state(work, sid, 'succeeded')
            self.assertEqual(json.loads(result['runs'][0]['content']), {'answer': 42})
            run = await work.submit(sid, 'follow up')
            view = await wait_state(work, sid, 'waiting')
            await work.respond_interaction(sid, run['id'], view['interactions'][-1]['id'], {'approved': False}, response_ref='authenticated')
            await wait_state(work, sid, 'succeeded')
            self.assertEqual(calls, [{'value': 3}])
            self.assertEqual([m['role'] for m in inputs[1]], ['user', 'assistant', 'user'])

    async def test_claude_real_options_tools_and_result(self):
        import claude_agent_sdk as sdk
        captured, clients = [], []
        original = sdk.create_sdk_mcp_server
        def server(**kwargs):
            captured.extend(kwargs['tools'])
            return original(**kwargs)
        class Client:
            def __init__(self, options):
                self.options, self.closed = options, False
                clients.append(self)
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                self.closed = True
            async def query(self, prompt):
                self.prompt = prompt
            async def receive_response(self):
                result = await captured[0].handler({'value': 5})
                yield sdk.ResultMessage(subtype='success', duration_ms=1, duration_api_ms=1, is_error=False,
                                        num_turns=1, session_id='sdk-private', result=result['content'][0]['text'])
            async def interrupt(self):
                pass
        async def tool(arguments, context):
            return {'value': arguments['value']}
        with patch.object(sdk, 'ClaudeSDKClient', Client), patch.object(sdk, 'create_sdk_mcp_server', side_effect=server):
            work = create_work(mode='claude', plugins={'lookup': WorkTool('Lookup', {'type': 'object'}, tool, False)})
            sid = (await work.create_session())['id']
            await work.submit(sid, 'question')
            view = await wait_state(work, sid, 'succeeded')
            self.assertEqual(json.loads(view['runs'][0]['content']), {'value': 5})
            self.assertTrue(clients[0].closed)
            self.assertEqual(clients[0].options.tools, [])
            self.assertEqual(clients[0].options.setting_sources, [])
            self.assertTrue(clients[0].options.strict_mcp_config)
            decision = await clients[0].options.can_use_tool('Bash', {}, None)
            self.assertIsInstance(decision, sdk.PermissionResultDeny)
            hook = clients[0].options.hooks['PreToolUse'][0].hooks[0]
            self.assertEqual((await hook({'tool_name': 'Bash'}, None, None))['hookSpecificOutput']['permissionDecision'], 'deny')

    async def test_sdk_error_and_cancel_are_not_false_success(self):
        import agents
        started = asyncio.Event()
        async def runner(*args, **kwargs):
            started.set()
            await asyncio.Event().wait()
        with patch.object(agents.Runner, 'run_streamed', side_effect=streamed(runner)):
            work = create_work(mode='openai')
            sid = (await work.create_session())['id']
            run = await work.submit(sid, 'q')
            await started.wait()
            result = await work.cancel_run(sid, run['id'])
            self.assertEqual(result['status'], 'interrupted')
            self.assertEqual(result['error_code'], 'STOP_UNCONFIRMED')

    async def test_claude_error_result_does_not_succeed(self):
        import claude_agent_sdk as sdk
        class Client:
            def __init__(self, options):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def query(self, prompt):
                pass
            async def receive_response(self):
                yield sdk.ResultMessage(subtype='error_max_turns', duration_ms=1, duration_api_ms=1,
                                        is_error=True, num_turns=1, session_id='private')
        with patch.object(sdk, 'ClaudeSDKClient', Client):
            work = create_work(mode='claude')
            sid = (await work.create_session())['id']
            await work.submit(sid, 'q')
            result = await wait_state(work, sid, 'interrupted')
            self.assertEqual(result['runs'][0]['error_code'], 'EXECUTOR_FAILED')

    async def test_invalid_tool_input_never_invokes_handler(self):
        import agents
        called = []
        async def tool(arguments, context):
            called.append(arguments)
        async def runner(agent, **kwargs):
            await agent.tools[0].on_invoke_tool(None, '{"value":"not an integer"}')
        with patch.object(agents.Runner, 'run_streamed', side_effect=streamed(runner)):
            work = create_work(mode='openai', plugins={'tool': WorkTool('Tool', {'type': 'object', 'properties': {'value': {'type': 'integer'}}}, tool, False)})
            sid = (await work.create_session())['id']
            await work.submit(sid, 'q')
            view = await wait_state(work, sid, 'interrupted')
            self.assertEqual(view['runs'][0]['error_code'], 'INVALID_TOOL_INPUT')
            self.assertEqual(called, [])

    async def test_mode_mismatch_on_storage_restore(self):
        class Store:
            async def load_all(self):
                return [{'id': 'old', 'mode': 'claude'}]
            async def save(self, session):
                raise AssertionError('must not mutate wrong-mode history')
        work = create_work(mode='openai', store=Store())
        with self.assertRaisesRegex(WorkError, 'EXECUTOR_MODE_MISMATCH'):
            await work.list_sessions()

    async def test_no_approval_callback_prevents_tool(self):
        import agents
        async def tool(arguments, context):
            self.fail('approval required')
        async def runner(agent, **kwargs):
            await agent.tools[0].on_invoke_tool(None, '{}')
        with patch.object(agents.Runner, 'run_streamed', side_effect=streamed(runner)):
            work = create_work(mode='openai', plugins={'tool': WorkTool('Tool', {'type': 'object'}, tool)})
            sid = (await work.create_session())['id']
            await work.submit(sid, 'q')
            view = await wait_state(work, sid, 'interrupted')
            self.assertEqual(view['runs'][0]['error_code'], 'CAPABILITY_UNSUPPORTED')

    async def test_real_openai_runner_with_offline_model(self):
        from agents import Model, ModelResponse, Usage
        from openai.types.responses import ResponseOutputMessage, ResponseOutputText
        class OfflineModel(Model):
            async def get_response(self, *args, **kwargs):
                return ModelResponse(output=[ResponseOutputMessage(
                    id='offline', role='assistant', status='completed', type='message',
                    content=[ResponseOutputText(type='output_text', text='offline result', annotations=[])]
                )], usage=Usage(), response_id='offline')
            async def stream_response(self, *args, **kwargs):
                from openai.types.responses import Response, ResponseCompletedEvent, ResponseTextDeltaEvent
                response = await self.get_response()
                yield ResponseTextDeltaEvent(type='response.output_text.delta', item_id='offline',
                    output_index=0, content_index=0, delta='offline result', sequence_number=1, logprobs=[])
                yield ResponseCompletedEvent(type='response.completed', sequence_number=2,
                    response=Response(id='offline', created_at=0, model='offline', object='response',
                        output=response.output, tool_choice='auto', tools=[], parallel_tool_calls=False))
        work = create_work(mode='openai', sdk_options={'model': OfflineModel()})
        sid = (await work.create_session())['id']
        await work.submit(sid, 'question')
        view = await wait_state(work, sid, 'succeeded')
        self.assertEqual(view['runs'][0]['content'], 'offline result')

    async def test_instance_keys_and_client_cleanup(self):
        import agents
        import openai
        clients = []
        class Client:
            def __init__(self, **kwargs):
                self.kwargs, self.closed = kwargs, False
                clients.append(self)
            async def close(self):
                self.closed = True
        async def runner(agent, **kwargs):
            return SimpleNamespace(final_output='ok')
        with patch.object(openai, 'AsyncOpenAI', Client), patch.object(agents.Runner, 'run_streamed', side_effect=streamed(runner)):
            for key, api in [('test-one', 'responses'), ('test-two', 'chat_completions')]:
                work = create_work(mode='openai', sdk_options={'api_key': key, 'base_url': 'https://example.test/v1', 'model': 'external', 'api': api})
                sid = (await work.create_session())['id']
                await work.submit(sid, 'q')
                view = await wait_state(work, sid, 'succeeded')
                self.assertNotIn(key, json.dumps(view))
        self.assertEqual([c.kwargs['api_key'] for c in clients], ['test-one', 'test-two'])
        self.assertTrue(all(c.closed for c in clients))

    async def test_claude_token_mapping_is_subprocess_only(self):
        import os
        import claude_agent_sdk as sdk
        captured = []
        class Client:
            def __init__(self, options):
                captured.append(options)
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def query(self, prompt):
                pass
            async def receive_response(self):
                yield sdk.ResultMessage(subtype='success', duration_ms=1, duration_api_ms=1, is_error=False,
                                        num_turns=1, session_id='private', result='ok')
        before = dict(os.environ)
        with patch.object(sdk, 'ClaudeSDKClient', Client):
            work = create_work(mode='claude', sdk_options={'api_key': 'test-token', 'base_url': 'https://example.test/anthropic', 'model': 'external', 'auth_type': 'auth_token'})
            sid = (await work.create_session())['id']
            await work.submit(sid, 'q')
            view = await wait_state(work, sid, 'succeeded')
        self.assertEqual(dict(os.environ), before)
        self.assertEqual(captured[0].env['ANTHROPIC_AUTH_TOKEN'], 'test-token')
        self.assertEqual(captured[0].env['ANTHROPIC_API_KEY'], '')
        self.assertEqual(captured[0].env['ANTHROPIC_DEFAULT_HAIKU_MODEL'], 'external')
        self.assertNotIn('test-token', json.dumps(view))

    async def test_connection_validation(self):
        for mode in ('openai', 'claude'):
            for options in ({'base_url': 'https://example.test'}, {'api_key': 'secret'},
                            {'api_key': 'secret', 'model': 'm', 'base_url': 'https://user:pass@example.test'}):
                with self.assertRaisesRegex(WorkError, 'INVALID_SDK_OPTIONS'):
                    create_work(mode=mode, sdk_options=options)

    async def test_real_openai_stream_restores_tool_items_after_restart(self):
        from agents import Model
        from openai.types.responses import (Response, ResponseCompletedEvent, ResponseTextDeltaEvent,
                                             ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText)
        import copy
        class Store:
            value = None
            async def save(self, value):
                self.value = copy.deepcopy(value)
            async def load_all(self):
                return [copy.deepcopy(self.value)] if self.value else []
        store, inputs, calls = Store(), [], []
        blocked = asyncio.Event()
        class OfflineModel(Model):
            async def get_response(self, *args, **kwargs):
                raise AssertionError('streaming required')
            async def stream_response(self, *args, **kwargs):
                inputs.append(copy.deepcopy(args[1]))
                if len(inputs) == 1:
                    output = [ResponseFunctionToolCall(type='function_call', name='lookup',
                              call_id='call-1', arguments='{}', id='tool-1', status='completed')]
                else:
                    yield ResponseTextDeltaEvent(type='response.output_text.delta', item_id='message',
                        output_index=0, content_index=0, delta='answer', sequence_number=1, logprobs=[])
                    if len(inputs) == 3:
                        blocked.set()
                        await asyncio.Event().wait()
                    output = [ResponseOutputMessage(type='message', id='message', role='assistant', status='completed',
                              content=[ResponseOutputText(type='output_text', text='answer', annotations=[])])]
                yield ResponseCompletedEvent(type='response.completed', sequence_number=2,
                    response=Response(id='offline', created_at=0, model='offline', object='response',
                        output=output, tool_choice='auto', tools=[], parallel_tool_calls=False))
        async def tool(arguments, context):
            calls.append('invoked')
            return {'fact': 42}
        def build():
            return create_work(mode='openai', store=store, sdk_options={'model': OfflineModel()},
                plugins={'lookup': WorkTool('Lookup', {'type': 'object'}, tool, False)})
        work = build()
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'question'))['id']
        events = [e async for e in work.stream_events(sid, rid)]
        self.assertIn('text_delta', [e['type'] for e in events])
        self.assertEqual(events[-1]['data']['status'], 'succeeded')
        restarted = build()
        resumed = await restarted.submit(sid, 'continue')
        await asyncio.wait_for(blocked.wait(), 2)
        interrupted = await restarted.cancel_run(sid, resumed['id'])
        self.assertEqual(interrupted['status'], 'interrupted')
        self.assertEqual(interrupted['content'], 'answer')
        final_owner = build()
        await final_owner.submit(sid, 'continue again')
        await wait_state(final_owner, sid, 'succeeded')
        self.assertEqual(calls, ['invoked'])
        self.assertTrue(any(i.get('type') == 'function_call_output' and '42' in i['output'] for i in inputs[-1]))
        self.assertEqual(inputs[-1][-1]['content'], 'continue again')

    async def test_claude_partial_and_native_resume_survive_restart(self):
        import copy
        import claude_agent_sdk as sdk
        class Store:
            value = None
            async def save(self, value):
                self.value = copy.deepcopy(value)
            async def load_all(self):
                return [copy.deepcopy(self.value)] if self.value else []
        store, clients = Store(), []
        class Client:
            def __init__(self, options):
                self.options = options
                clients.append(self)
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def query(self, prompt):
                self.prompt = json.loads(prompt)
            async def receive_response(self):
                yield sdk.SystemMessage(subtype='init', data={'session_id': 'native-session'})
                yield sdk.StreamEvent(uuid='event', session_id='native-session', event={
                    'type': 'content_block_delta', 'delta': {'type': 'text_delta', 'text': 'partial'}})
                yield sdk.ResultMessage(subtype='success', duration_ms=1, duration_api_ms=1,
                    is_error=False, num_turns=1, session_id='native-session', result='final')
        with patch.object(sdk, 'ClaudeSDKClient', Client):
            work = create_work(mode='claude', store=store)
            sid = (await work.create_session())['id']
            rid = (await work.submit(sid, 'first'))['id']
            events = [e async for e in work.stream_events(sid, rid)]
            self.assertEqual(next(e for e in events if e['type'] == 'text_delta')['data']['text'], 'partial')
            self.assertTrue(clients[0].options.include_partial_messages)
            store.value['runs'][-1]['status'] = 'running'
            restarted = create_work(mode='claude', store=store)
            self.assertEqual((await restarted.get_session(sid))['runs'][0]['status'], 'interrupted')
            self.assertEqual(len(clients), 1)
            await restarted.submit(sid, 'continue')
            await wait_state(restarted, sid, 'succeeded')
            self.assertEqual(clients[-1].options.resume, 'native-session')
            self.assertEqual(clients[-1].prompt['conversation'], [{'role': 'user', 'content': 'continue'}])
            incompatible = create_work(mode='claude', store=store, sdk_options={'model': 'different'})
            await incompatible.submit(sid, 'continue')
            view = await wait_state(incompatible, sid, 'interrupted')
            self.assertEqual(view['runs'][-1]['error_code'], 'RECOVERY_INCOMPATIBLE')
            self.assertEqual(len(clients), 2)
            await incompatible.submit(sid, 'start fresh', resume=False)
            await wait_state(incompatible, sid, 'succeeded')
            self.assertIsNone(clients[-1].options.resume)

    async def test_openai_unbalanced_checkpoint_is_not_saved(self):
        from src._recovery import balanced_items
        call = {'type': 'function_call', 'call_id': 'c'}
        output = {'type': 'function_call_output', 'call_id': 'c', 'output': 'done'}
        self.assertFalse(balanced_items([call]))
        self.assertTrue(balanced_items([call, output]))
