import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from voice_service.plugins.work_control import WorkControl

class PublicWebTests(unittest.IsolatedAsyncioTestCase):
    async def lookup(self, events, grant=True):
        context = SimpleNamespace(get_messages=lambda: [{'role':'user','content':'查一下今天公开新闻'}])
        host = SimpleNamespace(request=AsyncMock(return_value={'authorized':grant}))
        plugin = WorkControl({'tenant':'0','user':'7','device':'10'}, context, host)
        seen=[]
        def handler(request):
            seen.append(request)
            return httpx.Response(200,text=''.join('data: '+json.dumps(e)+'\n\n' for e in events))
        real=httpx.AsyncClient
        with patch.dict(os.environ,{'AGENT_INTERNAL_TOKEN':'x'*32}), patch('voice_service.plugins.work_control.web.httpx.AsyncClient',side_effect=lambda **kw: real(transport=httpx.MockTransport(handler))):
            result=await plugin.search_web('公开新闻','查一下今天公开新闻')
        return result,seen

    async def test_completed_search_requires_sources_and_sends_only_query(self):
        result,seen=await self.lookup([{'type':'chunk','text':'结论'}, {'type':'sources','items':[{'title':'官方','url':'https://example.org'}]}, {'type':'done'}])
        self.assertTrue(result['searched'])
        self.assertEqual(result['sources'][0]['title'],'官方')
        self.assertEqual(seen[0].headers['X-AI-User'],'7')
        self.assertEqual(json.loads(seen[0].content)['turns'][-1]['content'],'公开新闻')
        self.assertNotIn('查一下今天',seen[0].content.decode())

    async def test_no_sources_error_or_disconnect_cannot_claim_success(self):
        for events in [[{'type':'chunk','text':'guess'},{'type':'done'}], [{'type':'error','message':'private server body'}], [{'type':'chunk','text':'partial'}]]:
            result,_=await self.lookup(events)
            self.assertFalse(result['searched']); self.assertNotIn('private',str(result))

    async def test_failed_identity_does_not_search(self):
        result,seen=await self.lookup([],False)
        self.assertIn('error',result);self.assertEqual(seen,[])
