"""A host-owned file adapter exercises real persistence without a database dependency."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from src.main import create_chat, ChatError


class FileStore:
    def __init__(self, root):
        self.root = Path(root)
        self.fail = False

    async def load_all(self):
        return [json.loads(p.read_text()) for p in self.root.glob('*.json')]

    async def save(self, conversation):
        if self.fail:
            raise OSError('private storage information')
        target = self.root / (conversation['id'] + '.json')
        pending = target.with_suffix('.pending')
        pending.write_text(json.dumps(conversation))
        pending.replace(target)

    async def delete(self, conversation_id):
        (self.root / (conversation_id + '.json')).unlink(missing_ok=True)


async def generate(request):
    yield 'saved reply'


class StorageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1] / '.tmp'
        root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.directory.cleanup)
        self.store = FileStore(self.directory.name)

    async def test_restore_history_retry_and_delete(self):
        first = create_chat(generator=generate, store=self.store)
        sid = (await first.create_conversation())['id']
        _ = [e async for e in await first.send_message(sid, 'question')]
        second = create_chat(generator=generate, store=FileStore(self.directory.name))
        snapshot = await second.get_conversation(sid)
        self.assertEqual(snapshot['messages'][-1]['content'], 'saved reply')
        self.assertEqual((await second.list_conversations())[0]['id'], sid)
        _ = [e async for e in await second.send_message(sid, retry=True)]
        self.assertEqual(len((await second.get_conversation(sid))['messages']), 2)
        await second.delete_conversation(sid)
        third = create_chat(generator=generate, store=self.store)
        self.assertEqual(await third.list_conversations(), [])

    async def test_interrupted_restore_never_replays(self):
        await self.store.save(dict(id='saved', title='t', messages=[{'role': 'assistant', 'content': 'partial'}],
                                   generation=dict(id='g', status='running', error_code=None)))
        async def forbidden(request):
            self.fail('must not restart generator')
            yield ''
        chat = create_chat(generator=forbidden, store=self.store)
        self.assertEqual((await chat.get_conversation('saved'))['generation']['status'], 'interrupted')
        self.assertEqual((await self.store.load_all())[0]['generation']['status'], 'interrupted')
        self.assertEqual((await chat.cancel_generation('saved', 'g'))['status'], 'interrupted')

    async def test_storage_failure_before_send_and_at_completion(self):
        chat = create_chat(generator=generate, store=self.store)
        sid = (await chat.create_conversation())['id']
        self.store.fail = True
        with self.assertRaisesRegex(ChatError, 'STORAGE_FAILED'):
            await chat.send_message(sid, 'not accepted')
        self.assertEqual((await chat.get_conversation(sid))['messages'], [])
        self.store.fail = False
        async def failing(request):
            self.store.fail = True
            yield 'not durable'
        other = create_chat(generator=failing, store=self.store)
        events = [e async for e in await other.send_message(sid, 'q')]
        self.assertEqual(events[-1]['type'], 'failed')
        self.assertEqual(events[-1]['error_code'], 'STORAGE_FAILED')

    async def test_cancelled_partial_is_persisted(self):
        async def waiting(request):
            yield 'partial'
            await asyncio.Event().wait()
        chat = create_chat(generator=waiting, store=self.store)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'q')
        await stream.__anext__()
        await stream.__anext__()
        await stream.aclose()
        restored = create_chat(generator=generate, store=self.store)
        snapshot = await restored.get_conversation(sid)
        self.assertEqual(snapshot['generation']['status'], 'cancelled')
        self.assertEqual(snapshot['messages'][-1]['content'], 'partial')

    async def test_cancel_waits_for_terminal_commit(self):
        entered, release = asyncio.Event(), asyncio.Event()
        original = self.store.save
        async def save(row):
            if row['generation'] and row['generation']['status'] == 'completed':
                entered.set()
                await release.wait()
            await original(row)
        self.store.save = save
        chat = create_chat(generator=generate, store=self.store)
        sid = (await chat.create_conversation())['id']
        stream = await chat.send_message(sid, 'q')
        await entered.wait()
        gid = (await chat.get_conversation(sid))['generation']['id']
        stopping = asyncio.create_task(chat.cancel_generation(sid, gid))
        await asyncio.sleep(0)
        self.assertFalse(stopping.done())
        release.set()
        self.assertEqual((await stopping)['status'], 'completed')
        events = [e async for e in stream]
        self.assertEqual(events[-1]['type'], 'completed')
        self.assertEqual((await self.store.load_all())[0]['generation']['status'], 'completed')

    async def test_uncertain_commit_freezes_all_mutations(self):
        chat = create_chat(generator=generate, store=self.store)
        sid = (await chat.create_conversation())['id']
        original = self.store.save
        async def save(row):
            await original(row)
            raise OSError('committed but acknowledgement lost')
        self.store.save = save
        with self.assertRaisesRegex(ChatError, 'STORAGE_FAILED'):
            await chat.send_message(sid, 'first')
        self.store.save = original
        for command in (chat.send_message(sid, 'second'), chat.create_conversation(), chat.delete_conversation(sid)):
            with self.assertRaisesRegex(ChatError, 'STORAGE_FAILED'):
                await command
        self.assertEqual((await chat.get_conversation(sid))['storage_error'], 'STORAGE_FAILED')
        rows = await self.store.load_all()
        self.assertEqual(rows[0]['messages'][0]['content'], 'first')
        restored = create_chat(generator=generate, store=self.store)
        self.assertEqual((await restored.get_conversation(sid))['generation']['status'], 'interrupted')
