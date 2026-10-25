import asyncio
import base64
import hashlib
import hmac
import json
import os
import unittest
from unittest.mock import patch

import httpx

from voice_service.tickets import verify_ticket

SECRET = 'synthetic-voice-test-secret-00000000'
ENV = {**{f'VOICE_{p}_API_KEY': 'test-key' for p in ('LLM','STT','TTS')},
       **{f'VOICE_{p}_MODEL': 'test-model' for p in ('LLM','STT','TTS')},
       **{f'VOICE_{p}_URL': 'http://127.0.0.1:19999/v1' for p in ('LLM','STT','TTS')},
       'VOICE_TICKET_SECRET': SECRET}


def ticket(**overrides):
    claims = dict(aud='voice', tenant='0', user='7', device='10', exp=160,
                  nonce='12345678-1234-1234-1234-123456789012')
    claims.update(overrides)
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    signature = base64.urlsafe_b64encode(hmac.new(SECRET.encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return payload + '.' + signature


class Tickets(unittest.TestCase):
    def test_ticket_is_bound_signed_expiring_and_single_use(self):
        used = {}
        self.assertEqual(verify_ticket(ticket(),SECRET,used,100)['user'],'7')
        for value in (ticket(), ticket(exp=100), ticket(exp=161), ticket(aud='agent'), ticket(user='七'), ticket(device=10)):
            with self.assertRaises(ValueError): verify_ticket(value,SECRET,used,100)
        with self.assertRaises(ValueError): verify_ticket(ticket()+'x',SECRET,{},100)
        with self.assertRaises(ValueError): verify_ticket(ticket(),'short',{},100)


class SpeechSegments(unittest.TestCase):
    def test_voice_deepseek_disables_unhandled_reasoning_protocol(self):
        from voice_service.providers import voice_llm_extra
        with patch.dict(os.environ, {'VOICE_LLM_URL': 'https://api.deepseek.com/v1'}):
            self.assertEqual(voice_llm_extra(), {'extra_body': {'thinking': {'type': 'disabled'}}})
        with patch.dict(os.environ, {'VOICE_LLM_URL': 'https://example.test/v1'}):
            self.assertEqual(voice_llm_extra(), {})

    def test_long_input_preserves_words_and_skips_nonspoken_punctuation(self):
        from voice_service.providers import speech_segments
        text='甲'*241
        parts=list(speech_segments(text))
        self.assertEqual(''.join(parts),text)
        self.assertTrue(all(len(part)<=120 for part in parts))
        self.assertEqual(list(speech_segments('你好？！😀')),['你好？'])
        self.assertEqual(list(speech_segments('……😀！！')),[])


class Providers(unittest.IsolatedAsyncioTestCase):
    async def test_pcm_frames_align_samples(self):
        from voice_service.providers import StreamingPCMService
        from pipecat.frames.frames import TTSAudioRawFrame, ErrorFrame
        real_client = httpx.AsyncClient
        class Bytes(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'\x01'
                yield b'\x02\x03\x04'
        def handler(request):
            self.assertEqual(json.loads(request.content)['response_format'], 'pcm')
            return httpx.Response(200,headers={'content-type':'audio/pcm'},stream=Bytes())
        with patch.dict(os.environ,ENV), patch('voice_service.providers.httpx.AsyncClient', side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler))):
            service = StreamingPCMService()
            # sample_rate is set on Pipecat StartFrame in production.
            service._sample_rate = 24000
            frames = [frame async for frame in service.run_tts('你好','turn-1')]
            self.assertEqual(b''.join(f.audio for f in frames if isinstance(f,TTSAudioRawFrame)),b'\x01\x02\x03\x04')
            self.assertFalse(any(isinstance(f,ErrorFrame) for f in frames))
            await service.cleanup()

    async def test_busy_after_interruption_retries_without_replaying_audio(self):
        from voice_service.providers import StreamingPCMService
        from pipecat.frames.frames import TTSAudioRawFrame, ErrorFrame
        real_client = httpx.AsyncClient
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(429 if len(calls) == 1 else 200,
                headers={'content-type':'audio/pcm'}, content=b'\x01\x02')
        with patch.dict(os.environ,ENV), patch('voice_service.providers.httpx.AsyncClient',
                side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler))):
            service = StreamingPCMService(); service._sample_rate = 24000
            frames = [f async for f in service.run_tts('你好', 'turn')]
            self.assertEqual(len(calls), 2)
            self.assertEqual(b''.join(f.audio for f in frames if isinstance(f, TTSAudioRawFrame)), b'\x01\x02')
            self.assertFalse(any(isinstance(f, ErrorFrame) for f in frames))
            await service.cleanup()

    async def test_broken_stream_is_not_replayed_and_next_utterance_can_succeed(self):
        from voice_service.providers import StreamingPCMService
        from pipecat.frames.frames import TTSAudioRawFrame, ErrorFrame, TTSStoppedFrame
        real_client = httpx.AsyncClient
        calls = []
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'\x01\x02' * 2400
                raise httpx.ReadError('synthetic transport loss')
        def handler(request):
            calls.append(request)
            return httpx.Response(200, headers={'content-type':'audio/pcm'},
                stream=Broken()) if len(calls) == 1 else httpx.Response(200,
                    headers={'content-type':'audio/pcm'}, content=b'\x01\x02')
        with patch.dict(os.environ,ENV), patch('voice_service.providers.httpx.AsyncClient',
                side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler))):
            service = StreamingPCMService(); service._sample_rate = 24000
            first = [f async for f in service.run_tts('第一句话', 'first')]
            self.assertEqual(len(calls), 1)
            self.assertTrue(any(isinstance(f, TTSAudioRawFrame) for f in first))
            self.assertTrue(any(isinstance(f, ErrorFrame) and not f.fatal for f in first))
            self.assertIsInstance(first[-1], TTSStoppedFrame)
            second = [f async for f in service.run_tts('第二句话', 'second')]
            self.assertFalse(any(isinstance(f, ErrorFrame) for f in second))
            await service.cleanup()

    async def test_partial_sample_and_http_failure_are_explicit_errors(self):
        from voice_service.providers import StreamingPCMService
        from pipecat.frames.frames import ErrorFrame
        real_client = httpx.AsyncClient
        for status, payload in ((200,b'\x01'),(503,b'')):
            def handler(request):
                return httpx.Response(status,headers={'content-type':'audio/pcm'},content=payload)
            with patch.dict(os.environ,ENV), patch('voice_service.providers.httpx.AsyncClient',side_effect=lambda **kwargs:real_client(transport=httpx.MockTransport(handler))):
                service=StreamingPCMService()
                service._sample_rate=24000
                frames=[frame async for frame in service.run_tts('你好','turn-1')]
                self.assertTrue(any(isinstance(f,ErrorFrame) for f in frames))
                self.assertTrue(all(not f.fatal for f in frames if isinstance(f,ErrorFrame)))
                await service.cleanup()

    async def test_independent_qwen_worker_streams_pcm_and_checks_authorization(self):
        from voice_service.qwen_tts import create_tts_app
        import tempfile
        from pathlib import Path
        import numpy as np
        from types import SimpleNamespace
        class Model:
            sample_rate=24000
            config=SimpleNamespace(tts_model_type='custom_voice')
            def get_supported_speakers(self):return ['Vivian']
            def generate(self,**kwargs):
                assert kwargs['voice']=='Vivian'
                assert 'ref_audio' not in kwargs and 'ref_text' not in kwargs
                yield SimpleNamespace(audio=np.array([0.0,0.5,-0.5]))
        with tempfile.TemporaryDirectory() as directory:
            reference=Path(directory)/'reference.wav'
            reference.write_bytes(b'synthetic')
            env={'QWEN_TTS_TOKEN':SECRET,'QWEN_TTS_MODEL_PATH':directory,'QWEN_TTS_MODE':'preset','QWEN_TTS_SPEAKER':'Vivian'}
            with patch.dict(os.environ,env):
                app=create_tts_app(load_model=lambda path:Model())
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://localhost') as client:
                        body={'input':'你好','response_format':'pcm'}
                        self.assertEqual((await client.post('/v1/audio/speech',json=body)).status_code,401)
                        result=await client.post('/v1/audio/speech',json=body,headers={'Authorization':'Bearer '+SECRET})
                        self.assertEqual(result.status_code,200)
                        self.assertEqual(len(result.content),6)
                        self.assertEqual(result.headers['content-type'],'audio/pcm')

    async def test_clone_migration_uses_new_reference_only_for_explicit_profiles(self):
        from voice_service.qwen_tts import create_tts_app
        import tempfile
        from pathlib import Path
        import numpy as np
        from types import SimpleNamespace
        calls=[]
        class Model:
            sample_rate=24000
            def generate(self,**kwargs):
                calls.append(kwargs)
                yield SimpleNamespace(audio=np.array([0.0,0.5,-0.5]))
        with tempfile.TemporaryDirectory() as directory:
            reference=Path(directory)/'reference.wav'
            reference.write_bytes(b'synthetic')
            env={'QWEN_TTS_TOKEN':SECRET,'QWEN_TTS_MODEL_PATH':directory,'QWEN_TTS_MODE':'clone',
                 'QWEN_TTS_REFERENCE_AUDIO':str(reference),'QWEN_TTS_REFERENCE_TEXT':'新参考',
                 'QWEN_TTS_REFERENCE_PROFILES':'elf-1, whale-1'}
            with patch.dict(os.environ,env), patch('voice_service.qwen_tts.character_voice',return_value={'ref_audio':'other.wav','ref_text':'独立角色'}) as resolve:
                app=create_tts_app(load_model=lambda path:Model())
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://localhost') as client:
                        for profile in ('default','elf-1','whale-1','elf-2'):
                            result=await client.post('/v1/audio/speech',json={'input':'你好','response_format':'pcm','voice':profile},headers={'Authorization':'Bearer '+SECRET})
                            self.assertEqual(result.status_code,200)
                self.assertEqual([call['ref_audio'] for call in calls],[str(reference)]*3+['other.wav'])
                self.assertEqual([call['ref_text'] for call in calls],['新参考']*3+['独立角色'])
                resolve.assert_called_once_with('elf-2')

    async def test_mac_asr_keeps_audio_in_memory_and_validates_format(self):
        from voice_service.qwen_asr import create_asr_app
        import io,tempfile
        import numpy as np
        import soundfile as sf
        from types import SimpleNamespace
        class Model:
            def generate(self,**kwargs):
                self_audio=kwargs['audio']
                if len(self_audio)!=1600: raise ValueError()
                return SimpleNamespace(text='你好')
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'QWEN_ASR_TOKEN':SECRET,'QWEN_ASR_MODEL_PATH':directory}):
            app=create_asr_app(load_model=lambda path:Model())
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://localhost') as client:
                    audio=io.BytesIO();sf.write(audio,np.zeros(1600),16000,format='WAV',subtype='PCM_16')
                    headers={'Authorization':'Bearer '+SECRET}
                    result=await client.post('/v1/audio/transcribe',content=audio.getvalue(),headers=headers)
                    self.assertEqual(result.json()['text'],'你好')
                    self.assertEqual((await client.post('/v1/audio/transcribe',content=b'not-wav',headers=headers)).status_code,400)
                    self.assertEqual((await client.post('/v1/audio/transcribe',content=audio.getvalue())).status_code,401)

    async def test_agent_requires_terminal_event_and_uses_trusted_identity(self):
        from voice_service.agent import ask_agent
        real_client = httpx.AsyncClient
        def handler(request):
            self.assertEqual(request.headers['X-AI-User'],'7')
            return httpx.Response(200,text='data: {"type":"chunk","text":"完成"}\n\ndata: {"type":"done"}\n\n')
        with patch('voice_service.agent.httpx.AsyncClient',side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handler))):
            value = await ask_agent([{'role':'user','content':'分析'}],{'tenant':'0','user':'7','device':'10'},url='http://localhost',token=SECRET)
            self.assertEqual(value,'完成')
        def incomplete(request):
            return httpx.Response(200,text='data: {"type":"chunk","text":"不完整"}\n\n')
        with patch('voice_service.agent.httpx.AsyncClient',side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(incomplete))):
            with self.assertRaises(RuntimeError):
                await ask_agent([{'role':'user','content':'分析'}],{'tenant':'0','user':'7','device':'10'},url='http://localhost',token=SECRET)

    async def test_pipeline_constructs_with_optional_agent_and_real_vad(self):
        from voice_service.pipeline import build_pipeline
        class Connection:
            def event_handler(self,*args): return lambda fn: fn
            def send_app_message(self,message): pass
        for agent_token in ('', SECRET):
            with patch.dict(os.environ,{**ENV,'AGENT_INTERNAL_TOKEN':agent_token}):
                worker=build_pipeline(Connection(),{'tenant':'0','user':'7','device':'10'})
                self.assertIsNone(worker._idle_timeout_secs)
                await worker.cleanup()

    @unittest.skipUnless(os.environ.get('VOICE_TEST_NETWORK') == '1', 'Requires local UDP sockets')
    async def test_real_webrtc_handshake_and_disconnect(self):
        from aiortc import RTCPeerConnection, RTCConfiguration, RTCSessionDescription, AudioStreamTrack
        from voice_service.server import create_app
        import time
        client_peer=RTCPeerConnection(RTCConfiguration(iceServers=[]))
        connected=asyncio.Event()
        @client_peer.on('connectionstatechange')
        async def changed():
            if client_peer.connectionState=='connected': connected.set()
        client_peer.addTrack(AudioStreamTrack())
        client_peer.createDataChannel('chat')
        with patch.dict(os.environ,{**ENV,'AGENT_INTERNAL_TOKEN':''}):
            app=create_app()
            async with app.router.lifespan_context(app):
                try:
                    await client_peer.setLocalDescription(await client_peer.createOffer())
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://voice.test') as client:
                        result=await client.post('/offer',json={'type':'offer','sdp':client_peer.localDescription.sdp},
                                                 headers={'Authorization':'Bearer '+ticket(exp=int(time.time())+60)})
                        self.assertEqual(result.status_code,200,result.text)
                        answer=result.json()
                        await client_peer.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'],type=answer['type']))
                        await asyncio.wait_for(connected.wait(),5)
                        self.assertEqual(client_peer.connectionState,'connected')
                finally:
                    await client_peer.close()

    async def test_server_rejects_bad_ticket_without_starting_audio(self):
        from voice_service.server import create_app
        with patch.dict(os.environ,ENV):
            app = create_app()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://voice.test') as client:
                self.assertEqual((await client.get('/health')).status_code,200)
                response=await client.post('/offer',json={'type':'offer','sdp':'bad'})
                self.assertEqual(response.status_code,401)
                self.assertEqual(response.headers['cache-control'],'no-store')
                self.assertNotIn('Access-Control-Allow-Origin',response.headers)


if __name__ == '__main__': unittest.main()
