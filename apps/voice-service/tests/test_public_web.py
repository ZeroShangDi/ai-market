import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from voice_service.plugins.work_control import WorkControl

class PublicWebTests(unittest.IsolatedAsyncioTestCase):
    async def lookup(self, events, grant=True, content="查一下今天公开新闻"):
        context = SimpleNamespace(get_messages=lambda: [{'role':'user','content':content}])
        host = SimpleNamespace(request=AsyncMock(return_value={'authorized':grant}))
        plugin = WorkControl({'tenant':'0','user':'7','device':'10'}, context, host)
        seen=[]
        def handler(request):
            seen.append(request)
            if isinstance(events, Exception):
                raise events
            return httpx.Response(200,text=''.join('data: '+json.dumps(e)+'\n\n' for e in events))
        real=httpx.AsyncClient
        with patch.dict(os.environ,{'AGENT_INTERNAL_TOKEN':'x'*32}), patch('voice_service.plugins.work_control.web.httpx.AsyncClient',side_effect=lambda **kw: real(transport=httpx.MockTransport(handler))):
            result=await plugin.execute('search_web', {'query': '公开新闻'})
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

    async def test_authorization_timeout_is_explicit_and_does_not_search(self):
        context = SimpleNamespace(get_messages=lambda: [{'role':'user','content':'查一下'}])
        plugin = WorkControl({'tenant':'0','user':'7','device':'10'}, context,
            SimpleNamespace(request=AsyncMock(side_effect=TimeoutError('private details'))))
        with self.assertLogs('voice_service.plugins.work_control.web', level='WARNING') as logs:
            result = await plugin.search_web('公开关键词')
        self.assertFalse(result['searched'])
        self.assertIn('授权核验未完成', result['error'])
        self.assertIn('stage=authorization', str(logs.output))
        self.assertNotIn('private details', str(logs.output) + str(result))

    async def test_failure_diagnostics_do_not_include_query_or_upstream_body(self):
        with self.assertLogs('voice_service.plugins.work_control.web', level='WARNING') as logs:
            result, _ = await self.lookup([{'type':'error','code':'WEB_SEARCH_UNAVAILABLE','message':'private body'}])
        self.assertFalse(result['searched'])
        self.assertIn('upstream_code=WEB_SEARCH_UNAVAILABLE', str(logs.output))
        for sensitive in ['公开新闻', 'private body', 'x'*32]:
            self.assertNotIn(sensitive, str(logs.output))

    async def test_network_timeout_is_not_reported_as_missing_capability(self):
        result, _ = await self.lookup(httpx.ReadTimeout('private query'))
        self.assertFalse(result['searched'])
        self.assertIn('等待超时', result['error'])
        self.assertNotIn('private query', str(result))

    async def test_search_uses_current_turn_without_model_repeating_transcript(self):
        events = [{'type':'chunk','text':'结论'}, {'type':'sources','items':[{'title':'官方','url':'https://example.org'}]}, {'type':'done'}]
        for content in ['查一下， 今天公开新闻。', '嗯，帮我查一下今天公开新闻吧！']:
            with self.subTest(content=content):
                result, seen = await self.lookup(events, content=content)
                self.assertTrue(result['searched'])
                self.assertNotIn(content, seen[0].content.decode())

    async def test_missing_user_request_cannot_search_or_request_authorization(self):
        for messages in [[], [{'role':'assistant','content':'查一下'}], [{'role':'user','content':'  '}]]:
            host = SimpleNamespace(request=AsyncMock())
            plugin = WorkControl({}, SimpleNamespace(get_messages=lambda: messages), host)
            result = await plugin.execute('search_web', {'query':'公开新闻'})
            self.assertIn('error', result)
            host.request.assert_not_awaited()
