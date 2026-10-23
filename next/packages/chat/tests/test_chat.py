import asyncio
import unittest
from src.main import create_chat, ChatError


class ChatTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_and_injection(self):
        capability = object()
        async def generate(request):
            self.assertIs(request.plugins['search'], capability)
            self.assertTrue(request.config['network'])
            self.assertEqual(request.messages[-1]['content'], 'hello')
            yield '你'
            yield '好'
        chat = create_chat(generator=generate, plugins={'search': capability})
        session = await chat.create_conversation()
        events = [e async for e in await chat.send_message(session['id'], 'hello', options={'network': True})]
        self.assertEqual(events[-1]['content'], '你好')
        self.assertEqual(events[-1]['type'], 'completed')
        snapshot = await chat.get_conversation(session['id'])
        snapshot['messages'].clear()
        self.assertEqual(len((await chat.get_conversation(session['id']))['messages']), 2)

    async def test_retry_and_busy(self):
        release = asyncio.Event()
        async def generate(request):
            await release.wait()
            yield 'reply'
        chat = create_chat(generator=generate)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'question')
        with self.assertRaisesRegex(ChatError, 'CHAT_BUSY'):
            await chat.send_message(sid, 'second')
        release.set()
        _ = [e async for e in stream]
        _ = [e async for e in await chat.send_message(sid, retry=True)]
        self.assertEqual(len((await chat.get_conversation(sid))['messages']), 2)

    async def test_cancel_blocked_provider_and_stale_id(self):
        closed = asyncio.Event()
        async def generate(request):
            try:
                yield 'partial'
                await asyncio.Event().wait()
            finally:
                closed.set()
        chat = create_chat(generator=generate)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'q')
        await anext_compat(stream)
        await anext_compat(stream)
        gid = (await chat.get_conversation(sid))['generation']['id']
        with self.assertRaisesRegex(ChatError, 'STALE_GENERATION'):
            await chat.cancel_generation(sid, 'old')
        result = await chat.cancel_generation(sid, gid)
        self.assertEqual(result['status'], 'cancelled')
        self.assertTrue(closed.is_set())
        self.assertEqual([e async for e in stream][-1]['content'], 'partial')

    async def test_immediate_close_and_delete(self):
        async def generate(request):
            yield 'text'
        chat = create_chat(generator=generate)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'q')
        await stream.aclose()
        self.assertEqual((await chat.get_conversation(sid))['generation']['status'], 'cancelled')
        await chat.delete_conversation(sid)
        await chat.delete_conversation(sid)
        self.assertEqual(await chat.list_conversations(), [])

    async def test_error_timeout_and_output_limit(self):
        async def bad(request):
            raise ValueError('secret')
            yield ''
        async def slow(request):
            await asyncio.sleep(1)
            yield ''
        async def large(request):
            yield 'too large'
        for generator, expected in [(bad, 'PROVIDER_FAILED'), (slow, 'DEADLINE_EXCEEDED'), (large, 'LIMIT_EXCEEDED')]:
            chat = create_chat(generator=generator, timeout=.01, max_chars=4)
            sid = (await chat.create_conversation())['id']
            events = [e async for e in await chat.send_message(sid, 'q')]
            self.assertEqual(events[-1]['error_code'], expected)

    async def test_backpressure_cancel_and_isolation(self):
        async def generate(request):
            for _ in range(1000):
                yield 'x'
        chat = create_chat(generator=generate, queue_size=1)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'q')
        await asyncio.sleep(.01)
        snapshot = await chat.get_conversation(sid)
        self.assertLess(len(snapshot['messages'][-1]['content']), 10)
        await asyncio.wait_for(stream.aclose(), 1)
        other = create_chat(generator=generate)
        with self.assertRaisesRegex(ChatError, 'NOT_FOUND'):
            await other.get_conversation(sid)


async def anext_compat(stream):
    return await stream.__anext__()
