import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pipecat.processors.aggregators import async_tool_messages
from pipecat.processors.aggregators.llm_context import LLMContext
from voice_service.providers import VoiceLLMService
from voice_service.plugins.work_control import WorkControl


def deferred_context():
    return LLMContext(messages=[
        {'role': 'user', 'content': '查一下任务'},
        {'role': 'assistant', 'tool_calls': [{'id': 'call_test', 'type': 'function',
            'function': {'name': 'read_work', 'arguments': '{}'}}]},
        async_tool_messages.build_started_message('call_test'),
        {'role': 'user', 'content': '查到了吗'},
        async_tool_messages.build_final_result_message('call_test', '{"status":"completed"}'),
    ])


class VoiceLLMTests(unittest.IsolatedAsyncioTestCase):
    async def test_deferred_result_and_followup_use_supported_wire_roles_without_changing_authorization(self):
        context = deferred_context()
        original = copy.deepcopy(context.get_messages())
        service = VoiceLLMService(api_key='synthetic', base_url='https://api.deepseek.com/v1',
            settings=VoiceLLMService.Settings(model='synthetic'))
        try:
            with patch.object(service._client.chat.completions, 'create', new_callable=AsyncMock) as create:
                await service.get_chat_completions(context)
                wire = create.call_args.kwargs['messages']
                self.assertNotIn('developer', [m['role'] for m in wire])
                self.assertEqual(wire[-1]['content'], original[-1]['content'])
                self.assertEqual(context.get_messages(), original)
                plugin = WorkControl({}, context, SimpleNamespace())
                self.assertEqual(plugin.require_user('查到了吗')[1], '查到了吗')
                with self.assertRaises(ValueError):
                    plugin.require_user(original[-1]['content'])
                context.add_message({'role': 'user', 'content': '现在还能聊天吗'})
                await service.get_chat_completions(context)
                self.assertNotIn('developer', [m['role'] for m in create.call_args.kwargs['messages']])
                self.assertEqual(plugin.user_turn()[1], '现在还能聊天吗')
        finally:
            await service._client.close()
            await service.cleanup()

    async def test_other_providers_keep_developer_role(self):
        context = deferred_context()
        service = VoiceLLMService(api_key='synthetic', base_url='https://example.test/v1',
            settings=VoiceLLMService.Settings(model='synthetic'))
        try:
            with patch.object(service._client.chat.completions, 'create', new_callable=AsyncMock) as create:
                await service.get_chat_completions(context)
                self.assertEqual(create.call_args.kwargs['messages'][-1]['role'], 'developer')
        finally:
            await service._client.close()
            await service.cleanup()
