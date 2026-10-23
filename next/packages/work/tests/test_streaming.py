"""Durable cursor replay and explicit continuation, including process restart."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from src.main import create_work, WorkError
from test_work import Adapter, Store, wait_state


class StreamingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1] / '.tmp'
        root.mkdir(exist_ok=True)
        directory = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(directory.cleanup)
        self.store = Store(directory.name)

    async def test_live_delta_disconnect_replay_and_final(self):
        release, emitted = asyncio.Event(), asyncio.Event()
        async def action(ctx):
            await ctx.delta('first')
            emitted.set()
            await release.wait()
            await ctx.delta(' second')
            return {'content': 'first second'}
        work = create_work(executor=Adapter(action), store=self.store)
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        stream = work.stream_events(sid, rid)
        first = await anext(stream)
        await emitted.wait()
        delta = await anext(stream)
        self.assertEqual(delta['type'], 'text_delta')
        self.assertEqual((await work.get_session(sid))['runs'][0]['content'], 'first')
        await stream.aclose()
        release.set()
        await wait_state(work, sid, 'succeeded')
        restored = create_work(executor=Adapter(action), store=self.store)
        events = [e async for e in restored.stream_events(sid, rid, after=delta['sequence'])]
        self.assertEqual([e['type'] for e in events], ['text_delta', 'status'])
        self.assertEqual(events[-1]['data']['content'], 'first second')
        self.assertGreater(events[0]['sequence'], first['sequence'])

    async def test_cancel_keeps_partial_and_rejects_late_delta(self):
        ready, held = asyncio.Event(), []
        async def action(ctx):
            held.append(ctx)
            await ctx.delta('partial')
            ready.set()
            await asyncio.Event().wait()
        work = create_work(executor=Adapter(action))
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        await ready.wait()
        result = await work.cancel_run(sid, rid)
        self.assertEqual(result['content'], 'partial')
        with self.assertRaisesRegex(WorkError, 'STALE_RUN'):
            await held[0].delta('late')
        events = [e async for e in work.stream_events(sid, rid)]
        self.assertEqual(events[-1]['data']['status'], 'cancelled')

    async def test_checkpoint_restart_explicit_resume_and_reset(self):
        seen = []
        async def action(ctx):
            seen.append(ctx.recovery)
            await ctx.checkpoint({'private': 'tool-history'})
            return {'content': 'done'}
        work = create_work(executor=Adapter(action), store=self.store)
        sid = (await work.create_session())['id']
        await work.submit(sid, 'q')
        await wait_state(work, sid, 'succeeded')
        rows = await self.store.load_all()
        rows[0]['runs'][0]['status'] = 'running'
        await self.store.save(rows[0])
        restored = create_work(executor=Adapter(action), store=self.store)
        view = await restored.get_session(sid)
        self.assertNotIn('tool-history', json.dumps(view))
        self.assertEqual(len(seen), 1)
        self.assertEqual(view['runs'][0]['status'], 'interrupted')
        await restored.submit(sid, 'continue after checking effects')
        await wait_state(restored, sid, 'succeeded')
        self.assertEqual(seen[-1], {'private': 'tool-history'})
        await restored.submit(sid, 'new context', resume=False)
        await wait_state(restored, sid, 'succeeded')
        self.assertIsNone(seen[-1])

    async def test_cursor_eviction_invalid_cursor_and_terminal_replay(self):
        async def action(ctx):
            for _ in range(4):
                await ctx.delta('a')
            return {'content': 'aaaa'}
        work = create_work(executor=Adapter(action), max_items=2)
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        view = await wait_state(work, sid, 'succeeded')
        with self.assertRaisesRegex(WorkError, 'CURSOR_EXPIRED'):
            await anext(work.stream_events(sid, rid))
        with self.assertRaisesRegex(WorkError, 'INVALID_CURSOR'):
            await anext(work.stream_events(sid, rid, after=1000))
        events = [e async for e in work.stream_events(sid, rid, after=view['event_sequence'])]
        self.assertEqual(events, [])

    async def test_failed_persistence_not_delivered(self):
        ready, release = asyncio.Event(), asyncio.Event()
        async def action(ctx):
            ready.set()
            await release.wait()
            self.store.fail = True
            await ctx.delta('uncommitted')
            return {'content': 'bad'}
        work = create_work(executor=Adapter(action), store=self.store)
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        stream = work.stream_events(sid, rid)
        await anext(stream)
        pending = asyncio.create_task(anext(stream))
        await ready.wait()
        release.set()
        with self.assertRaisesRegex(WorkError, 'STORAGE_FAILED'):
            await asyncio.wait_for(pending, 2)
        view = await wait_state(work, sid, 'interrupted')
        self.assertEqual(view['runs'][0]['content'], '')
        self.assertNotIn('uncommitted', json.dumps(await self.store.load_all()))

    async def test_two_observers_do_not_steal_events(self):
        release = asyncio.Event()
        async def action(ctx):
            await release.wait()
            await ctx.delta('x')
            return {'content': 'x'}
        work = create_work(executor=Adapter(action))
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        async def collect():
            return [e async for e in work.stream_events(sid, rid)]
        one, two = asyncio.create_task(collect()), asyncio.create_task(collect())
        release.set()
        first, second = await asyncio.gather(one, two)
        self.assertEqual(first, second)
        self.assertEqual([e['sequence'] for e in first], [1, 2, 3])

    async def test_observer_paused_at_yield_does_not_miss_notification(self):
        step, emitted, finish = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def action(ctx):
            await step.wait()
            await ctx.delta('x')
            emitted.set()
            await finish.wait()
            return {'content': 'x'}
        work = create_work(executor=Adapter(action))
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        slow = work.stream_events(sid, rid)
        await anext(slow)
        step.set()
        await emitted.wait()
        fast = work.stream_events(sid, rid, after=1)
        self.assertEqual((await anext(fast))['type'], 'text_delta')
        self.assertEqual((await asyncio.wait_for(anext(slow), 1))['type'], 'text_delta')
        await slow.aclose()
        await fast.aclose()
        finish.set()
        await wait_state(work, sid, 'succeeded')
