import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from src.main import create_work, WorkError


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.fail = False

    async def load_all(self):
        return [json.loads(p.read_text()) for p in self.root.glob('*.json')]

    async def save(self, value):
        if self.fail:
            raise OSError('private storage info')
        path = self.root / (value['id'] + '.json')
        temporary = path.with_suffix('.pending')
        temporary.write_text(json.dumps(value))
        temporary.replace(path)


class Adapter:
    def __init__(self, action, confirmed=True):
        self.action, self.confirmed = action, confirmed
        self.started = asyncio.Event()
        self.closed = asyncio.Event()
        self.calls = 0

    async def run(self, context):
        self.calls += 1
        self.started.set()
        try:
            return await self.action(context)
        finally:
            self.closed.set()

    async def cancel(self, sid, rid):
        return self.confirmed


async def verify(value):
    return value['response_ref'] == 'authenticated'


async def wait_state(work, sid, status):
    async def poll():
        while True:
            view = await work.get_session(sid)
            if view['runs'][-1]['status'] == status:
                return view
            await asyncio.sleep(.001)
    return await asyncio.wait_for(poll(), 2)


class WorkTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1] / '.tmp'
        root.mkdir(exist_ok=True)
        directory = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(directory.cleanup)
        self.store = Store(directory.name)

    async def test_background_continuation_and_injection(self):
        capability = object()
        async def action(ctx):
            self.assertIs(ctx.plugins['tool'], capability)
            self.assertEqual(ctx.config['model'], 'external')
            await ctx.emit('working')
            return {'content': str(len(ctx.history))}
        work = create_work(executor=Adapter(action), plugins={'tool': capability}, config={'model': 'external'})
        sid = (await work.create_session())['id']
        receipt = await work.submit(sid, 'first')
        self.assertEqual(receipt['status'], 'running')
        first = await wait_state(work, sid, 'succeeded')
        self.assertEqual(first['runs'][0]['content'], '0')
        await work.submit(sid, 'continue')
        last = await wait_state(work, sid, 'succeeded')
        self.assertEqual(last['runs'][1]['content'], '1')
        last['runs'].clear()
        self.assertEqual(len((await work.get_session(sid))['runs']), 2)
        self.assertEqual(len(await work.list_sessions()), 1)

    async def test_approval_verified_binding_and_duplicate(self):
        observed = []
        async def action(ctx):
            answer = await ctx.ask('approval', {'tool_id': 'send', 'input': {'target': 'x'}})
            observed.append(answer)
            return {'content': 'done'}
        work = create_work(executor=Adapter(action), verify_response=verify)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        snapshot = await wait_state(work, sid, 'waiting')
        item = snapshot['interactions'][0]
        with self.assertRaisesRegex(WorkError, 'RESPONSE_REJECTED'):
            await work.respond_interaction(sid, run['id'], item['id'], {'approved': True}, response_ref='forged')
        self.assertEqual(observed, [])
        await work.respond_interaction(sid, run['id'], item['id'], {'approved': False}, response_ref='authenticated')
        await wait_state(work, sid, 'succeeded')
        self.assertEqual(observed, [{'approved': False}])
        await work.respond_interaction(sid, run['id'], item['id'], {'approved': False}, response_ref='authenticated')
        with self.assertRaisesRegex(WorkError, 'ANSWER_CONFLICT'):
            await work.respond_interaction(sid, run['id'], item['id'], {'approved': True}, response_ref='authenticated')

    async def test_question_expiry_and_cancel_waiting(self):
        async def action(ctx):
            await ctx.ask('question', {'question': 'which?'})
            return {'content': 'done'}
        work = create_work(executor=Adapter(action), verify_response=verify, interaction_timeout=.01)
        sid = (await work.create_session())['id']
        await work.submit(sid, 'q')
        view = await wait_state(work, sid, 'failed')
        self.assertEqual(view['runs'][0]['error_code'], 'INTERACTION_EXPIRED')
        self.assertEqual(view['interactions'][0]['status'], 'expired')
        other = create_work(executor=Adapter(action), verify_response=verify)
        sid = (await other.create_session())['id']
        run = await other.submit(sid, 'q')
        view = await wait_state(other, sid, 'waiting')
        await other.cancel_run(sid, run['id'])
        self.assertEqual((await other.get_session(sid))['interactions'][0]['status'], 'expired')
        with self.assertRaises(WorkError):
            await other.respond_interaction(sid, run['id'], view['interactions'][0]['id'], {'text': 'yes'}, response_ref='authenticated')

    async def test_busy_stale_cancel_and_close(self):
        async def action(ctx):
            await asyncio.Event().wait()
        adapter = Adapter(action)
        work = create_work(executor=adapter)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        await adapter.started.wait()
        with self.assertRaisesRegex(WorkError, 'WORK_BUSY'):
            await work.submit(sid, 'second')
        with self.assertRaisesRegex(WorkError, 'STALE_RUN'):
            await work.cancel_run(sid, 'wrong')
        closed = await work.close_session(sid)
        self.assertEqual(closed['status'], 'closed')
        self.assertEqual(closed['runs'][0]['status'], 'cancelled')
        self.assertTrue(adapter.closed.is_set())
        await work.close_session(sid)
        with self.assertRaisesRegex(WorkError, 'SESSION_CLOSED'):
            await work.submit(sid, 'new')

    async def test_immediate_cancel(self):
        async def action(ctx):
            self.fail('cancelled before start')
        adapter = Adapter(action)
        work = create_work(executor=adapter)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        self.assertEqual((await work.cancel_run(sid, run['id']))['status'], 'cancelled')
        self.assertEqual(adapter.calls, 0)

    async def test_unknown_stop_and_deadline(self):
        async def action(ctx):
            await asyncio.Event().wait()
        for confirmed, expected in [(False, 'interrupted'), (True, 'failed')]:
            work = create_work(executor=Adapter(action, confirmed), timeout=.01)
            sid = (await work.create_session())['id']
            await work.submit(sid, 'q')
            view = await wait_state(work, sid, expected)
            self.assertEqual(view['runs'][0]['error_code'], 'DEADLINE_EXCEEDED')

    async def test_artifact_publication(self):
        async def publisher(sid, rid, source):
            self.assertEqual(source, {'resource_id': 'external-file'})
            return {'id': 'artifact', 'name': 'report'}
        async def action(ctx):
            await ctx.publish({'resource_id': 'external-file'})
            return {'content': 'ready'}
        work = create_work(executor=Adapter(action), publish_artifact=publisher)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        view = await wait_state(work, sid, 'succeeded')
        self.assertEqual(view['artifacts'][0]['run_id'], run['id'])
        unsupported = create_work(executor=Adapter(action))
        sid = (await unsupported.create_session())['id']
        await unsupported.submit(sid, 'q')
        view = await wait_state(unsupported, sid, 'failed')
        self.assertEqual(view['runs'][0]['error_code'], 'CAPABILITY_UNSUPPORTED')

    async def test_persistence_and_interrupted_recovery(self):
        async def action(ctx):
            return {'content': 'persisted'}
        work = create_work(executor=Adapter(action), store=self.store)
        sid = (await work.create_session())['id']
        await work.submit(sid, 'q')
        await wait_state(work, sid, 'succeeded')
        restored = create_work(executor=Adapter(action), store=self.store)
        view = await restored.get_session(sid)
        self.assertEqual(view['runs'][0]['content'], 'persisted')
        view.pop('storage_error')
        view['runs'][0]['status'] = 'waiting'
        view['interactions'] = [{'id': 'pending', 'run_id': view['runs'][0]['id'], 'status': 'pending'}]
        await self.store.save(view)
        adapter = Adapter(action)
        restarted = create_work(executor=adapter, store=self.store)
        view = await restarted.get_session(sid)
        self.assertEqual(view['runs'][0]['status'], 'interrupted')
        self.assertEqual(view['interactions'][0]['status'], 'expired')
        self.assertEqual(adapter.calls, 0)

    async def test_storage_failure_blocks_execution(self):
        async def action(ctx):
            return {'content': 'done'}
        adapter = Adapter(action)
        work = create_work(executor=adapter, store=self.store)
        sid = (await work.create_session())['id']
        self.store.fail = True
        with self.assertRaisesRegex(WorkError, 'STORAGE_FAILED'):
            await work.submit(sid, 'q')
        self.assertEqual(adapter.calls, 0)
        self.assertEqual((await work.get_session(sid))['runs'], [])

    async def test_late_callback_and_identity_isolation(self):
        held = []
        async def action(ctx):
            held.append(ctx)
            return {'content': 'done'}
        work = create_work(executor=Adapter(action))
        sid = (await work.create_session())['id']
        await work.submit(sid, 'q')
        await wait_state(work, sid, 'succeeded')
        with self.assertRaisesRegex(WorkError, 'STALE_RUN'):
            await held[0].emit('late')
        other = create_work(executor=Adapter(action))
        with self.assertRaisesRegex(WorkError, 'NOT_FOUND'):
            await other.get_session(sid)

    async def test_answer_verification_racing_cancellation(self):
        verifying, release = asyncio.Event(), asyncio.Event()
        async def verifier(value):
            verifying.set()
            await release.wait()
            return True
        async def action(ctx):
            await ctx.ask('approval', {'tool': 'write', 'input': {'x': 1}})
            self.fail('cancelled approval must not execute')
        work = create_work(executor=Adapter(action), verify_response=verifier)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        view = await wait_state(work, sid, 'waiting')
        response = asyncio.create_task(work.respond_interaction(sid, run['id'], view['interactions'][0]['id'],
                                                               {'approved': True}, response_ref='proof'))
        await verifying.wait()
        await work.cancel_run(sid, run['id'])
        release.set()
        with self.assertRaises(WorkError):
            await response

    async def test_final_storage_failure_never_reports_success(self):
        async def action(ctx):
            self.store.fail = True
            return {'content': 'done'}
        work = create_work(executor=Adapter(action), store=self.store)
        sid = (await work.create_session())['id']
        await work.submit(sid, 'q')
        view = await wait_state(work, sid, 'interrupted')
        self.assertEqual(view['runs'][0]['error_code'], 'STORAGE_FAILED')
        self.assertEqual(view['storage_error'], 'STORAGE_FAILED')

    async def test_final_commit_wins_over_late_cancel(self):
        entered, release = asyncio.Event(), asyncio.Event()
        store = self.store
        original_save = store.save
        async def delayed_save(value):
            if value['runs'] and value['runs'][-1]['status'] == 'succeeded':
                entered.set()
                await release.wait()
            await original_save(value)
        store.save = delayed_save
        async def action(ctx):
            return {'content': 'done'}
        work = create_work(executor=Adapter(action), store=store)
        sid = (await work.create_session())['id']
        run = await work.submit(sid, 'q')
        await entered.wait()
        cancellation = asyncio.create_task(work.cancel_run(sid, run['id']))
        release.set()
        self.assertEqual((await cancellation)['status'], 'succeeded')

    async def test_cancel_during_failure_cleanup_never_succeeds(self):
        entered, release = asyncio.Event(), asyncio.Event()
        class Failing:
            async def run(self, ctx):
                raise ValueError('failure')
            async def cancel(self, sid, rid):
                entered.set()
                await release.wait()
                return False
        work = create_work(executor=Failing(), store=self.store)
        sid = (await work.create_session())['id']
        rid = (await work.submit(sid, 'q'))['id']
        await entered.wait()
        stopping = asyncio.create_task(work.cancel_run(sid, rid))
        await asyncio.sleep(0)
        self.assertFalse(stopping.done())
        release.set()
        result = await stopping
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(result['error_code'], 'EXECUTOR_FAILED')
        self.assertEqual((await self.store.load_all())[0]['runs'][0]['status'], 'interrupted')
        events = [e async for e in work.stream_events(sid, rid)]
        self.assertEqual(events[-1]['data']['status'], 'interrupted')
