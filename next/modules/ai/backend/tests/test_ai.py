"""Composition tests use real package public APIs and deterministic external adapters."""
import asyncio
import importlib.util
import json
import sys
import unittest
from array import array
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
for name, directory in [('ai', ROOT/'modules/ai/backend/src'), *[(n, ROOT/'packages'/n/'src') for n in ('chat','work','voice')]]:
    spec = importlib.util.spec_from_file_location(name, directory/'__init__.py', submodule_search_locations=[str(directory)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)

from ai.main import create_ai, AIError, MemoryMetadata
from voice.main import Voice, ProviderConfig, VoiceInfo, Limits


async def allow(*args):
    return True

async def generate(request):
    yield '你好。'
    yield '完成'

async def until(fn):
    async def poll():
        while not await fn():
            await asyncio.sleep(.001)
    await asyncio.wait_for(poll(), 2)

class Store:
    def __init__(self):
        self.rows = {}
    async def load_all(self):
        return json.loads(json.dumps(list(self.rows.values())))
    async def save(self, row):
        self.rows[row['id']] = json.loads(json.dumps(row))
    async def delete(self, cid):
        self.rows.pop(cid, None)

class Executor:
    async def run(self, ctx):
        return {'content':'工作结果'}
    async def cancel(self, *args):
        return True

class Provider:
    config = ProviderConfig('http://localhost/tts','test',asr_url='http://localhost/asr',voices=(VoiceInfo('default','默认'),))
    def __init__(self):
        self.texts = []
    async def transcribe(self, pcm, language):
        return '识别结果'
    async def synthesize(self, text, config):
        self.texts.append(text)
        return b'\1\0' * 100

class Audio:
    echo_cancellation = True
    def __init__(self):
        self.closed, self.played = 0, []
    def open_capture(self, on_frame, on_error):
        self.frame, self.error = on_frame, on_error
        owner = self
        class Capture:
            def close(self):
                owner.closed += 1
        return Capture()
    async def play(self, pcm, rate, volume, started):
        started()
        self.played.append(pcm)
    def speak(self):
        for _ in range(5):
            self.frame(array('h', [3000]*320).tobytes())
        for _ in range(26):
            self.frame(bytes(640))

class AITests(unittest.IsolatedAsyncioTestCase):
    async def make(self, **kwargs):
        args = dict(scope='user-a',authorize=allow,services={'memory':True,'chat':{'generator':generate}})
        args.update(kwargs)
        obj = await create_ai(**args)
        self.addAsyncCleanup(obj.dispose)
        return obj

    async def done_chat(self, obj, cid):
        async def done():
            view = await obj.get_conversation(cid)
            return view['generation'] and view['generation']['status'] != 'running'
        await until(done)
        await asyncio.sleep(.01)

    async def test_text_without_subscription_and_history(self):
        obj = await self.make()
        cid = (await obj.create_conversation())['id']
        await obj.send_message(cid,'原文')
        await self.done_chat(obj,cid)
        view = await obj.get_conversation(cid)
        self.assertEqual([m['content'] for m in view['messages']],['原文','你好。完成'])
        self.assertEqual((await obj.get_state())['active_replies'],[])

    async def test_context_roles_network_and_unchanged_history(self):
        seen = []
        async def gen(req):
            seen.append(req)
            yield 'ok'
        async def prep(cid,text,role,cancelled):
            return {'summary':'外部知识'}
        obj = await self.make(services={'memory':True,'chat':{'generator':gen,'capabilities':{'context':True,'roles':True,'network':True}}},
            config={'roles':{'default':{'chat_config':{'style':'简洁'}}}},prepare_turn=prep)
        cid = (await obj.create_conversation())['id']
        await obj.configure(cid,network_enabled=True)
        await obj.send_message(cid,'原文')
        await self.done_chat(obj,cid)
        self.assertEqual(seen[0].config,{'summary':'外部知识','network_enabled':True,'style':'简洁'})
        self.assertEqual(seen[0].messages[0]['content'],'原文')

    async def test_permission_denied_and_strict_true(self):
        async def deny(*args): return 1
        obj = await self.make(authorize=deny)
        with self.assertRaisesRegex(AIError,'PERMISSION_DENIED'):
            await obj.create_conversation()
        self.assertEqual((await obj.dispose())['unconfirmed'],[])

    async def test_capability_and_plugin_conflicts(self):
        obj = await self.make()
        cid = (await obj.create_conversation())['id']
        with self.assertRaisesRegex(AIError,'CAPABILITY_UNSUPPORTED'):
            await obj.configure(cid,network_enabled=True)
        with self.assertRaisesRegex(AIError,'INVALID_PLUGIN'):
            await self.make(services={'memory':True,'chat':{'generator':generate,'plugins':{'x':1}}},plugins={'chat':{'x':2}})

    async def test_observer_isolation_and_unsubscribe(self):
        obj = await self.make()
        events=[]
        obj.subscribe(lambda e: 1/0)
        unsubscribe=obj.subscribe(events.append)
        unsubscribe()
        cid=(await obj.create_conversation())['id']
        await obj.send_message(cid,'x')
        await self.done_chat(obj,cid)
        self.assertEqual(len(events),1)
        events[0]['data']['capabilities']['chat']=False
        self.assertTrue((await obj.get_state())['capabilities']['chat'])

    async def test_busy_exact_cancellation_dispose(self):
        entered=asyncio.Event()
        async def slow(req):
            entered.set()
            yield '部分'
            await asyncio.Event().wait()
        obj=await self.make(services={'memory':True,'chat':{'generator':slow}})
        cid=(await obj.create_conversation())['id']
        receipt=await obj.send_message(cid,'x')
        await entered.wait()
        with self.assertRaisesRegex(AIError,'CHAT_BUSY'):
            await obj.send_message(cid,'y')
        await obj.cancel_reply(cid,receipt['generation_id'])
        self.assertEqual((await obj.get_conversation(cid))['generation']['status'],'cancelled')
        self.assertEqual(await obj.dispose(),await obj.dispose())
        with self.assertRaisesRegex(AIError,'DISPOSED'):
            await obj.create_conversation()

    async def test_metadata_partial_commit_freezes_and_exposes_id(self):
        class Broken(MemoryMetadata):
            async def save_conversation_config(self,*args): raise OSError('SECRET')
        obj=await self.make(services={'memory':True,'storage':Broken(),'chat':{'generator':generate}})
        with self.assertRaises(AIError) as caught:
            await obj.create_conversation()
        error=caught.exception
        self.assertEqual(error.code,'OUTCOME_UNKNOWN')
        self.assertEqual((await obj.list_conversations())[0]['id'],error.refs['conversation_id'])
        with self.assertRaisesRegex(AIError,'OUTCOME_UNKNOWN'):
            await obj.create_conversation()

    async def test_restore_metadata_work_links_and_no_replay(self):
        chatstore,workstore,meta=Store(),Store(),MemoryMetadata()
        services={'storage':meta,'chat':{'generator':generate,'store':chatstore},'work':{'executor':Executor(),'store':workstore}}
        obj=await self.make(services=services)
        cid=(await obj.create_conversation())['id']
        wid=(await obj.create_work(conversation_id=cid))['work_id']
        await obj.submit_work(wid,'任务')
        async def done(): return (await obj.get_work(wid))['runs'][-1]['status']=='succeeded'
        await until(done)
        await obj.dispose()
        other=await self.make(services=services)
        self.assertEqual((await other.get_conversation(cid))['work_summaries'][0]['work_id'],wid)
        self.assertEqual((await other.get_work(wid))['runs'][-1]['content'],'工作结果')
        await other.delete_conversation(cid)
        self.assertIsNone((await other.get_work(wid))['conversation_id'])

    async def test_work_only(self):
        obj=await self.make(services={'memory':True,'work':{'executor':Executor()}})
        wid=(await obj.create_work())['work_id']
        await obj.submit_work(wid,'test')
        self.assertFalse((await obj.get_state())['capabilities']['chat'])

    async def test_prepare_failure_never_calls_generator(self):
        async def prep(*args): raise ValueError('secret')
        obj=await self.make(prepare_turn=prep,services={'memory':True,'chat':{'generator':generate,'capabilities':{'context':True}}})
        cid=(await obj.create_conversation())['id']
        with self.assertRaisesRegex(AIError,'EXTENSION_FAILED'):
            await obj.send_message(cid,'x')
        self.assertEqual((await obj.get_conversation(cid))['messages'],[])

    async def voice_obj(self, generator=generate, acquire=None,release=None):
        provider,audio=Provider(),Audio()
        voice=Voice(provider,audio,Limits())
        with patch('voice.main.create_voice',return_value=voice):
            obj=await self.make(services={'memory':True,'chat':{'generator':generator},'voice':{'provider':provider.config,'acquire':acquire,'release':release}})
        return obj,provider,audio

    async def test_continuous_voice_real_packages(self):
        obj,provider,audio=await self.voice_obj()
        state=await obj.start_voice()
        cid=state['conversation_id']
        audio.speak()
        async def played(): return len(audio.played)>=2
        await until(played)
        await self.done_chat(obj,cid)
        self.assertEqual(''.join(provider.texts),'你好。完成')
        await obj.stop_voice()
        self.assertEqual(audio.closed,1)
        await obj.start_voice()
        await obj.stop_voice()
        self.assertEqual(audio.closed,2)

    async def test_voice_permission_failure(self):
        async def acquire(): raise PermissionError('secret')
        async def release(): pass
        obj,provider,audio=await self.voice_obj(acquire=acquire,release=release)
        with self.assertRaises(AIError): await obj.start_voice()
        self.assertEqual(audio.closed,0)
        self.assertEqual(provider.texts,[])

    async def test_voice_barge_in_does_not_cancel_new_generation(self):
        calls=[]
        async def gen(req):
            calls.append(req)
            if len(calls)==1:
                yield '旧话。'
                await asyncio.Event().wait()
            else: yield '新话。'
        obj,provider,audio=await self.voice_obj(generator=gen)
        state=await obj.start_voice()
        audio.speak()
        async def first(): return len(calls)==1
        await until(first)
        audio.speak()
        async def second(): return len(calls)==2
        await until(second)
        await self.done_chat(obj,state['conversation_id'])
        self.assertTrue(calls[0].cancelled.is_set())
        self.assertEqual((await obj.get_conversation(state['conversation_id']))['messages'][-1]['content'],'新话。')

    async def test_work_interaction_verifier_is_required(self):
        class Waiting(Executor):
            async def run(self,ctx):
                answer=await ctx.ask('question',{'question':'继续？'})
                return {'content':answer['text']}
        async def verify(value): return value['response_ref']=='trusted'
        obj=await self.make(services={'memory':True,'work':{'executor':Waiting(),'verify_response':verify}})
        wid=(await obj.create_work())['work_id']
        run=await obj.submit_work(wid,'x')
        async def waiting(): return bool((await obj.get_work(wid))['interactions'])
        await until(waiting)
        item=(await obj.get_work(wid))['interactions'][0]
        with self.assertRaises(AIError):
            await obj.respond_interaction(wid,run['id'],item['id'],{'text':'yes'},response_ref='forged')
        await obj.respond_interaction(wid,run['id'],item['id'],{'text':'yes'},response_ref='trusted')
        async def done(): return (await obj.get_work(wid))['runs'][-1]['status']=='succeeded'
        await until(done)
        self.assertEqual((await obj.get_work(wid))['runs'][-1]['content'],'yes')

    async def test_work_cursor_expiry_uses_snapshot(self):
        class Fast(Executor):
            async def run(self,ctx):
                for _ in range(20): await ctx.delta('x')
                return {'content':'x'*20}
        obj=await self.make(services={'memory':True,'work':{'executor':Fast(),'max_items':1}})
        events=[]
        obj.subscribe(events.append)
        wid=(await obj.create_work())['work_id']
        await obj.submit_work(wid,'x')
        async def done(): return (await obj.get_work(wid))['runs'][-1]['status']=='succeeded'
        await until(done)
        await asyncio.sleep(.01)
        self.assertTrue(any(e['type']=='work_changed' and 'snapshot' in e['data'] for e in events))

    async def test_dispose_reports_unconfirmed_remote_stop(self):
        started=asyncio.Event()
        class Remote(Executor):
            async def run(self,ctx):
                started.set()
                await asyncio.Event().wait()
            async def cancel(self,*args): return False
        obj=await self.make(services={'memory':True,'work':{'executor':Remote()}})
        wid=(await obj.create_work())['work_id']
        run=await obj.submit_work(wid,'x')
        await started.wait()
        self.assertEqual((await obj.dispose())['unconfirmed'],[{'work_id':wid,'run_id':run['id']}])

    async def test_dispose_cancels_pending_context(self):
        entered,ended=asyncio.Event(),asyncio.Event()
        async def prepare(*args):
            entered.set()
            try: await asyncio.Event().wait()
            finally: ended.set()
        obj=await self.make(services={'memory':True,'chat':{'generator':generate,'capabilities':{'context':True}}},prepare_turn=prepare)
        cid=(await obj.create_conversation())['id']
        send=asyncio.create_task(obj.send_message(cid,'x'))
        await entered.wait()
        await obj.dispose()
        self.assertTrue(ended.is_set())
        self.assertTrue(send.cancelled())

    async def test_identity_instances_do_not_share_history(self):
        first=await self.make()
        second=await self.make(scope='user-b')
        cid=(await first.create_conversation())['id']
        with self.assertRaisesRegex(AIError,'NOT_FOUND'):
            await second.get_conversation(cid)
        self.assertNotEqual((await first.get_state())['instance_id'],(await second.get_state())['instance_id'])

    async def test_capture_failure_releases_host_terminal(self):
        releases=[]
        async def acquire(): pass
        async def release(): releases.append(True)
        obj,provider,audio=await self.voice_obj(acquire=acquire,release=release)
        await obj.start_voice()
        audio.error()
        async def released(): return bool(releases)
        await until(released)
        self.assertEqual(audio.closed,1)
        self.assertEqual((await obj.get_state())['voice']['capture'],'off')

    async def test_active_voice_config_and_idle_switch(self):
        obj,provider,audio=await self.voice_obj()
        state=await obj.start_voice()
        cid=state['conversation_id']
        with self.assertRaisesRegex(AIError,'CHAT_BUSY'):
            await obj.configure(cid,voice_id='default')
        await obj.configure(cid,muted=True)
        await asyncio.sleep(.01)
        self.assertEqual((await obj.get_state())['voice']['capture'],'muted')
        await obj.configure(cid,muted=False)
        await obj.configure(cid,volume=.3)
        await obj.stop_voice()
        await obj.configure(cid,voice_id='default')
        await obj.configure(cid,muted=True)
        self.assertEqual((await obj.start_voice(cid))['capture'],'muted')
        self.assertEqual((await obj.get_conversation(cid))['config']['volume'],.3)

    async def test_invalid_persisted_config_rejected(self):
        store=MemoryMetadata()
        await store.save_conversation_config('x',{'role_id':'missing'})
        with self.assertRaisesRegex(AIError,'INVALID_STORAGE'):
            await self.make(services={'memory':True,'storage':store,'chat':{'generator':generate}})

    async def test_deleting_voice_conversation_allows_default_restart(self):
        obj,provider,audio=await self.voice_obj()
        cid=(await obj.start_voice())['conversation_id']
        await obj.delete_conversation(cid)
        new=(await obj.start_voice())['conversation_id']
        self.assertNotEqual(cid,new)

    async def test_chat_storage_fault_is_visible_without_subscription(self):
        class Failing(Store):
            async def save(self,row):
                if row['messages'] and row['messages'][-1]['content']:
                    raise OSError('secret')
                await super().save(row)
        obj=await self.make(services={'memory':True,'chat':{'generator':generate,'store':Failing()}})
        cid=(await obj.create_conversation())['id']
        await obj.send_message(cid,'x')
        await self.done_chat(obj,cid)
        self.assertEqual((await obj.get_state())['error']['code'],'STORAGE_FAILED')
        with self.assertRaisesRegex(AIError,'OUTCOME_UNKNOWN'):
            await obj.configure(cid,network_enabled=False)

if __name__=='__main__': unittest.main()
