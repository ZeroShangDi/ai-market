import asyncio
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx

from voice_service.plugin_host import HostBridge, PluginHost, load_package
from voice_service.plugins.work_control import WorkControl

SID = '12345678-1234-1234-1234-123456789012'
IID = '12345678-1234-1234-1234-123456789013'
IDENTITY = {'tenant': '0', 'user': '7', 'device': '10', 'host_plugin_bridge': True, 'host_task_bridge': True}
ENV = {'AGENT_INTERNAL_TOKEN': 'synthetic-internal-token-0000000000', 'VOICE_PLUGINS': '["work_control"]'}


class Context:
    def __init__(self):
        self.messages = [{'role': 'user', 'content': '帮我查一下今天的消息'}]
    def get_messages(self): return self.messages
    def add_message(self, value): self.messages.append(value)
    def user(self, text): self.add_message({'role': 'user', 'content': text})


def session(**changes):
    return {'id': SID, 'conversation_id': '42', 'status': 'idle', 'sequence': 4,
            'messages': [], 'interactions': [], 'artifacts': [], **changes}


class WorkPlugin(unittest.IsolatedAsyncioTestCase):
    def make(self):
        context = Context()
        host = SimpleNamespace(request=AsyncMock(return_value={'id': '42'}), emit=Mock())
        return WorkControl(IDENTITY, context, host), context, host

    async def test_plugin_schema_is_not_reloaded_without_its_python_code(self):
        load_package.cache_clear()
        first = load_package('work_control')
        with patch('pathlib.Path.read_text', side_effect=AssertionError('Live schema reload')):
            second = load_package('work_control')
        self.assertIs(first, second)
        self.assertNotIn('kind', first[1]['tools'][0]['properties'])

    async def test_start_only_proposes_and_never_writes_before_mobile_confirmation(self):
        plugin, context, host = self.make()
        plugin.api = AsyncMock()
        args = dict(prompt='查询今天的消息及来源', user_quote='帮我查一下今天的消息')
        first = await plugin.start_work(**args)
        self.assertFalse(first['accepted'])
        self.assertTrue(first['confirmation_required'])
        self.assertEqual(first['status'], 'awaiting_confirmation')
        host.emit.assert_called_once_with({'type': 'task_proposal', 'id': first['proposal_id'], 'prompt': args['prompt']})
        context.user('重试刚才的申请')
        second = await plugin.start_work(**{**args, 'user_quote': '重试刚才的申请', 'retry_id': first['retry_id']})
        self.assertFalse(second['accepted'])
        self.assertEqual(first['proposal_id'], second['proposal_id'])
        self.assertEqual(host.emit.call_args_list[0], host.emit.call_args_list[1])
        host.request.assert_not_awaited()
        plugin.api.assert_not_awaited()
        with self.assertRaises(ValueError):
            await plugin.start_work('不同任务', '重试刚才的申请', first['retry_id'])

    async def test_parallel_same_start_does_not_duplicate_confirmation(self):
        plugin, _, host = self.make()
        plugin.api = AsyncMock()
        args = dict(prompt='整理消息', user_quote='帮我查一下今天的消息')
        await asyncio.gather(plugin.execute('start_work', args), plugin.execute('start_work', args))
        host.emit.assert_called_once()
        host.request.assert_not_awaited()
        plugin.api.assert_not_awaited()

    async def test_missing_confirmation_ui_does_not_fall_back_to_direct_creation(self):
        plugin, _, host = self.make()
        plugin.identity = {**IDENTITY, 'host_task_bridge': False}
        plugin.api = AsyncMock()
        result = await plugin.execute('start_work', {'prompt': '整理消息', 'user_quote': '帮我查一下今天的消息'})
        self.assertIn('确认弹窗', result['error'])
        host.emit.assert_not_called()
        host.request.assert_not_awaited()
        plugin.api.assert_not_awaited()

    async def test_host_events_are_allowlisted_and_blocked_after_close(self):
        connection = SimpleNamespace(send_app_message=Mock())
        bridge = HostBridge(connection)
        with self.assertRaises(ValueError):
            bridge.emit({'type': 'unknown'})
        event = {'type': 'task_proposal', 'id': SID, 'prompt': '整理报告'}
        bridge.emit(event)
        connection.send_app_message.assert_called_once_with(event)
        bridge.close()
        with self.assertRaises(RuntimeError):
            bridge.emit(event)

    async def test_unspoken_or_wrong_user_quote_cannot_submit(self):
        plugin, context, host = self.make()
        result = await plugin.execute('start_work', dict(prompt='删除文件', user_quote='同意删除'))
        self.assertIn('error', result)
        host.request.assert_not_called()
        host.emit.assert_not_called()

    async def test_history_pagination_and_long_message_are_recoverable(self):
        plugin, _, _ = self.make()
        messages = [{'id': str(i), 'role': 'assistant', 'content': '甲' * 9000 if i == 11 else str(i)} for i in range(12)]
        plugin.api = AsyncMock(return_value=session(messages=messages))
        page = await plugin.read_work(SID)
        self.assertEqual(page['next_before'], 4)
        self.assertTrue(page['messages'][-1]['truncated'])
        older = await plugin.read_work(SID, before=page['next_before'])
        self.assertEqual(len(older['messages']), 4)
        chunk = await plugin.read_work(SID, message_id='11')
        final = await plugin.read_work(SID, message_id='11', offset=chunk['next_offset'])
        self.assertEqual(chunk['message']['content'] + final['message']['content'], '甲' * 9000)
        self.assertIsNone(final['next_offset'])

    async def test_approval_requires_read_then_new_user_turn_and_uses_exact_binding(self):
        plugin, context, _ = self.make()
        pending = dict(id=IID, status='pending', kind='approval', tool='import', binding='server-binding', input={'_display': {'label': '导入十条线索'}})
        state = session(status='waiting', interactions=[pending])
        plugin.api = AsyncMock(return_value=state)
        args = dict(session_id=SID, interaction_id=IID, user_quote='帮我查一下今天的消息', approved=True)
        self.assertIn('error', await plugin.respond_work(**args))
        await plugin.read_work(SID)
        self.assertIn('error', await plugin.respond_work(**args))
        context.add_message({'role': 'assistant', 'content': '导入十条线索，可以吗？也可以在工作台处理。'})
        context.user('同意导入这十条')
        result = await plugin.respond_work(**{**args, 'user_quote': '同意导入这十条'})
        self.assertTrue(result['answered'])
        self.assertEqual(plugin.api.call_args.args, ('POST', f'/{SID}/interactions/{IID}', {'binding': 'server-binding', 'approved': True}))
        pending['status'] = 'answered'
        self.assertIn('error', await plugin.respond_work(**{**args, 'user_quote': '同意导入这十条'}))
        self.assertEqual(sum(c.args[0] == 'POST' for c in plugin.api.call_args_list), 1)

    async def test_changed_binding_and_question_answers(self):
        plugin, context, _ = self.make()
        pending = dict(id=IID, status='pending', kind='question', tool='AskUserQuestion', binding='first', input={'questions': [{'question': '选哪天？'}]})
        plugin.api = AsyncMock(return_value=session(status='waiting', interactions=[pending]))
        await plugin.read_work(SID)
        context.user('选明天')
        pending['binding'] = 'changed'
        args = dict(session_id=SID, interaction_id=IID, user_quote='选明天', answers={'选哪天？': '明天'})
        self.assertIn('error', await plugin.respond_work(**args))
        await plugin.read_work(SID)
        context.user('确认选明天')
        self.assertTrue((await plugin.respond_work(**{**args, 'user_quote': '确认选明天'}))['answered'])
        self.assertEqual(plugin.api.call_args.args[-1], {'binding': 'changed', 'answers': {'选哪天？': '明天'}})

    async def test_quote_cannot_drop_user_negation(self):
        plugin, context, _ = self.make()
        context.user('不要批准')
        with self.assertRaisesRegex(ValueError, '完整引用'):
            plugin.require_user('批准')

    async def test_followup_uses_original_session_and_unknown_write_can_retry_after_new_turn(self):
        plugin, context, _ = self.make()
        state = session()
        async def api(method, path='', body=None, request_id=None):
            if method == 'GET': return state
            state['messages'].append({'id': request_id, 'delivery': 'queued'})
            raise RuntimeError('lost response')
        plugin.api = AsyncMock(side_effect=api)
        args = dict(session_id=SID, prompt='再分析一下原因', user_quote='帮我查一下今天的消息')
        first = await plugin.continue_work(**args)
        context.user('重试')
        result = await plugin.continue_work(**{**args, 'user_quote': '重试', 'retry_id': first['retry_id']})
        self.assertTrue(result['accepted'])
        self.assertEqual(result['delivery'], 'queued')
        self.assertEqual(sum(c.args[0] == 'POST' for c in plugin.api.call_args_list), 1)
        self.assertTrue(all(c.args[1].startswith('/' + SID) for c in plugin.api.call_args_list))

    async def test_api_identity_is_server_bound_and_errors_do_not_leak_body(self):
        plugin, _, host = self.make()
        host.request.return_value = {'id': SID}
        real_client = httpx.AsyncClient
        def handler(request):
            self.assertEqual(request.headers['X-AI-User'], '7')
            self.assertEqual(request.headers['X-AI-Tenant'], '0')
            self.assertEqual(request.headers['Idempotency-Key'], IID)
            return httpx.Response(403, text='sensitive upstream body')
        with patch.dict(os.environ, ENV), patch('voice_service.plugins.work_control.httpx.AsyncClient', side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler))):
            with self.assertRaisesRegex(RuntimeError, '工作请求未确认') as raised:
                await plugin.api('POST', '/' + SID + '/messages', {}, IID)
            self.assertNotIn('sensitive', str(raised.exception))

    async def test_failed_host_authorization_blocks_direct_api_access(self):
        plugin, _, host = self.make()
        host.request.return_value = {'id': 'different'}
        with patch('voice_service.plugins.work_control.httpx.AsyncClient') as client:
            with self.assertRaisesRegex(RuntimeError, '会话访问未确认'):
                await plugin.api('POST', f'/{SID}/interactions/{IID}', {'approved': True})
            client.assert_not_called()

    async def test_list_uses_exact_workbench_endpoint_and_total_before_pagination(self):
        plugin, _, host = self.make()
        plugin.api = AsyncMock(side_effect=AssertionError('must not list internal records'))
        host.request.return_value = {'items': [{'id': SID}, {'id': IID}]}
        result = await plugin.list_work(limit=1)
        self.assertEqual(result['items'], [{'id': SID}])
        self.assertEqual(result['total'], 2)
        self.assertEqual(result['next_before'], SID)
        second = await plugin.list_work(limit=1, before=SID)
        self.assertEqual(second['items'], [{'id': IID}])
        self.assertEqual(second['total'], 2)
        self.assertIsNone(second['next_before'])
        host.request.assert_awaited_with('GET', '/api/v1/mobile/work/sessions', None, None)
        plugin.api.assert_not_called()

    async def test_plugin_loading_and_host_version_gate(self):
        with patch.dict(os.environ, ENV):
            context = Context()
            host = PluginHost(SimpleNamespace(send_app_message=lambda _: None), IDENTITY, context)
            self.assertEqual(len(host.specs), 9)
            registered = {}
            host.register(SimpleNamespace(register_function=lambda name, fn, **kw: registered.update({name: kw})))
            self.assertEqual(registered['search_web']['timeout_secs'], 150)
            search = next(spec for spec, _ in host.specs if spec.name == 'search_web')
            self.assertEqual(search.required, ['query'])
            self.assertNotIn('user_quote', search.properties)
            self.assertEqual(registered['start_work']['timeout_secs'], 60)
            start = next(spec for spec, _ in host.specs if spec.name == 'start_work')
            self.assertNotIn('kind', start.properties)
            self.assertEqual(start.required, ['prompt', 'user_quote'])
            old = PluginHost(SimpleNamespace(send_app_message=lambda _: None), {**IDENTITY, 'host_plugin_bridge': False}, context)
            self.assertNotIn('start_work', [spec.name for spec, _ in old.specs])
            with patch.dict(os.environ, {'VOICE_PLUGINS': '[]'}):
                empty = PluginHost(None, IDENTITY, context)
                self.assertEqual(empty.specs, [])

    async def test_activity_cursor_preserves_long_tool_results(self):
        plugin, _, _ = self.make()
        data = {'content': '甲' * 8000}
        plugin.api = AsyncMock(return_value={'items': [{'sequence': 8, 'type': 'tool_result', 'data': data}], 'sequence': 8, 'status': 'running'})
        first = await plugin.read_work_activity(SID, after=7)
        second = await plugin.read_work_activity(SID, after=first['next_after'], offset=first['next_offset'])
        self.assertEqual(json.loads(first['data'] + second['data']), data)
        self.assertEqual(second['next_after'], 8)
        self.assertFalse(second['has_more'])

    async def test_short_summary_does_not_authorize_unreviewed_approval(self):
        plugin, context, _ = self.make()
        item = dict(id=IID, status='pending', kind='approval', tool='import', binding='b', input={'_display': {'label': '导入十条线索'}})
        state = session(status='waiting', interactions=[item])
        plugin.api = AsyncMock(return_value=state)
        completion = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='要导入十条线索，你可以口述确认，也可以去工作台处理。'))]))
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))
        manager = AsyncMock()
        manager.__aenter__.return_value = client
        notice = {'id': SID + ':4', 'text': 'fallback'}
        with patch.dict(os.environ, {'VOICE_LLM_API_KEY': 'test', 'VOICE_LLM_URL': 'http://example.test', 'VOICE_LLM_MODEL': 'test'}), patch('openai.AsyncOpenAI', return_value=manager):
            text = await plugin.prepare_notice(notice)
        self.assertIn('口述', text)
        self.assertEqual(plugin.reviewed, {})
        self.assertNotIn('tools', completion.call_args.kwargs)
        self.assertIn('导入十条线索', completion.call_args.kwargs['messages'][1]['content'])
        plugin.notice_delivered(notice['id'])
        self.assertEqual(plugin.reviewed, {})

    async def test_real_pipeline_loads_host_tools(self):
        from voice_service.pipeline import build_pipeline
        env = {**ENV, **{f'VOICE_{p}_API_KEY': 'test' for p in ('LLM', 'STT', 'TTS')},
            **{f'VOICE_{p}_MODEL': 'test' for p in ('LLM', 'STT', 'TTS')},
            **{f'VOICE_{p}_URL': 'http://127.0.0.1:19999/v1' for p in ('LLM', 'STT', 'TTS')}}
        connection = SimpleNamespace(event_handler=lambda *_: lambda fn: fn, send_app_message=lambda _: None)
        with patch.dict(os.environ, env):
            worker = build_pipeline(connection, IDENTITY)
            await worker.cleanup()

    async def test_host_reply_is_correlated_and_close_does_not_send_work_cancellation(self):
        sent = []
        bridge = HostBridge(SimpleNamespace(send_app_message=sent.append))
        pending = asyncio.create_task(bridge.request('POST', '/api/v1/mobile/ai/conversations', {}, IID))
        await asyncio.sleep(0)
        bridge.receive({'type': 'plugin_host_result', 'id': 'unrelated', 'data': {'id': 'wrong'}})
        self.assertFalse(pending.done())
        bridge.receive({'type': 'plugin_host_result', 'id': sent[0]['id'], 'data': {'id': '42'}})
        self.assertEqual(await pending, {'id': '42'})
        bridge.close()
        self.assertEqual(len(sent), 1)
