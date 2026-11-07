import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from voice_service.plugins.work_control.history import ConversationHistory

class Conversations(unittest.IsolatedAsyncioTestCase):
    async def test_manual_and_voice_conversations_share_identity_and_pagination(self):
        plugin=ConversationHistory()
        plugin.identity={'tenant':'1','user':'7','device':'10'}
        plugin.host=SimpleNamespace(request=AsyncMock(return_value={'authorized':True}))
        calls=[]
        def handler(request):
            calls.append(request)
            self.assertEqual(request.headers['X-AI-User'],'7')
            return httpx.Response(200,json={'data':{'items':[{'id':'42','title':'手动会话'},{'id':'43','title':'语音：测试'}],'next_cursor':'next'}})
        real=httpx.AsyncClient
        with patch.dict(os.environ,{'AI_INTERNAL_TOKEN':'x'*32}), patch('voice_service.plugins.work_control.history.httpx.AsyncClient',side_effect=lambda **kw:real(transport=httpx.MockTransport(handler))):
            result=await plugin.list_conversations(cursor='previous')
            self.assertEqual(len(result['items']),2)
            self.assertEqual(result['next_cursor'],'next')
            self.assertEqual(calls[0].url.params['cursor'],'previous')
            await plugin.read_conversation('42',cursor='99')
            self.assertEqual(plugin.host.request.call_args.args[1],'/api/v1/mobile/ai/conversations/42/messages?limit=1')
            self.assertEqual(calls[-1].url.params['cursor'],'99')
            plugin.host.request.return_value={'authorized':False}
            with self.assertRaises(ValueError):await plugin.read_conversation('42')
            self.assertEqual(len(calls),2)
            with self.assertRaises(ValueError):await plugin.read_conversation('../42')
