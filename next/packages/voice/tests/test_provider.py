"""真实 httpx 请求编码测试，传输层替身不访问模型服务。"""
import asyncio
import json
from dataclasses import replace
import unittest
from unittest.mock import patch

import httpx

from voice.main import ProviderConfig, VoiceConfig, VoiceError, create_voice
from voice._provider import HttpSpeechProvider


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def provider(self, handler, **options):
        config = ProviderConfig("http://127.0.0.1/speech", "tts", tts_key="secret", **options)
        client = httpx.AsyncClient
        self.patch = patch("httpx.AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        return HttpSpeechProvider(config)

    async def test_speech_sends_model_voice_speed_and_returns_pcm(self):
        def handle(request):
            body = json.loads(request.content)
            self.assertEqual(body["input"], "你好")
            self.assertEqual(body["speed"], 1.2)
            self.assertEqual(request.headers["authorization"], "Bearer secret")
            return httpx.Response(200, content=b"\1\0" * 20, headers={"content-type": "audio/pcm"})
        provider = self.provider(handle)
        self.assertEqual(len(await provider.synthesize("你好", VoiceConfig(rate=1.2))), 40)

    async def test_rejects_wrong_format_and_odd_pcm(self):
        for mime, body in (("text/html", b"err"), ("audio/pcm", b"x"), ("audio/pcm", b"")):
            if hasattr(self, "patch"):
                self.patch.stop()
            provider = self.provider(lambda request: httpx.Response(200, content=body, headers={"content-type": mime}))
            with self.assertRaisesRegex(VoiceError, "INVALID_AUDIO"):
                await provider.synthesize("hi", VoiceConfig())

    async def test_bounded_response(self):
        provider = self.provider(lambda request: httpx.Response(200, content=b"123456", headers={"content-type": "audio/pcm"}), max_audio_bytes=4)
        with self.assertRaisesRegex(VoiceError, "CAPACITY"):
            await provider.synthesize("hi", VoiceConfig())

    async def test_asr_openai_multipart(self):
        def handle(request):
            self.assertIn("multipart/form-data", request.headers["content-type"])
            self.assertIn(b"RIFF", request.content)
            self.assertIn(b'asr-model', request.content)
            return httpx.Response(200, json={"text": "你好"})
        provider = self.provider(handle, asr_url="http://127.0.0.1/asr", asr_model="asr-model")
        self.assertEqual(await provider.transcribe(b"\0" * 640, "zh"), "你好")

    async def test_asr_qwen_raw_wav(self):
        def handle(request):
            self.assertEqual(request.headers["content-type"], "audio/wav")
            self.assertTrue(request.content.startswith(b"RIFF"))
            return httpx.Response(200, json={"text": " 好 "})
        provider = self.provider(handle, asr_url="http://127.0.0.1/asr", asr_protocol="qwen-wav")
        self.assertEqual(await provider.transcribe(b"\0" * 640, "zh"), "好")

    async def test_redirect_and_provider_body_are_not_exposed(self):
        provider = self.provider(lambda request: httpx.Response(302, headers={"location": "https://other.example"}, text="SECRET"))
        with self.assertRaisesRegex(VoiceError, "PROVIDER_FAILED") as error:
            await provider.synthesize("hi", VoiceConfig())
        self.assertNotIn("SECRET", str(error.exception))

    async def test_cancel_releases_request(self):
        entered = asyncio.Event()
        cancelled = asyncio.Event()
        async def handle(request):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        provider = self.provider(handle)
        task = asyncio.create_task(provider.synthesize("hi", VoiceConfig()))
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(cancelled.is_set())

    def test_credentials_hidden_and_insecure_remote_rejected(self):
        config = ProviderConfig("https://voice.example/speech", "tts", tts_key="SECRET")
        self.assertNotIn("SECRET", repr(config))
        with self.assertRaisesRegex(VoiceError, "INVALID_INPUT"):
            replace(config, tts_url="http://voice.example/speech")

    async def test_pcm_is_yielded_before_response_ends_and_close_releases_response(self):
        release, closed = asyncio.Event(), asyncio.Event()
        class Body(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"\1"
                yield b"\0\2\0"  # 前一个采样跨网络块，不能丢掉或错位。
                await release.wait()
                yield b"\3\0"
            async def aclose(self):
                closed.set()
        provider = self.provider(lambda request: httpx.Response(200, stream=Body(), headers={"content-type": "audio/pcm"}))
        stream = provider.synthesize_stream("hi", VoiceConfig())
        first = await asyncio.wait_for(stream.__anext__(), 1)
        self.assertEqual(first, b"\1\0\2\0")
        self.assertFalse(release.is_set())
        await stream.aclose()
        self.assertTrue(closed.is_set())

    async def test_late_truncated_pcm_fails_after_initial_audio(self):
        class Body(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"\1\0"
                yield b"\2"
        provider = self.provider(lambda request: httpx.Response(200, stream=Body(), headers={"content-type": "audio/pcm"}))
        stream = provider.synthesize_stream("hi", VoiceConfig())
        self.assertEqual(await stream.__anext__(), b"\1\0")
        with self.assertRaisesRegex(VoiceError, "INVALID_AUDIO"):
            await stream.__anext__()

    async def test_engine_streams_first_audio_then_interrupt_closes_http(self):
        playing, released = asyncio.Event(), asyncio.Event()
        class Body(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"\1\0" * 20
                await asyncio.Event().wait()
            async def aclose(self): released.set()
        class Terminal:
            echo_cancellation = True
            def open_capture(self, on_frame, on_error):
                raise AssertionError("playback-only mode")
            async def play_stream(self, chunks, rate, volume, started):
                async for pcm in chunks:
                    started()
                    playing.set()
        provider = self.provider(lambda request: httpx.Response(200, stream=Body(), headers={"content-type": "audio/pcm"}))
        voice = create_voice(provider.config, audio_terminal=Terminal())
        events = []
        voice.subscribe(events.append)
        sid = await voice.start(capture=False)
        try:
            voice.speak(session_id=sid, generation=0, speech_id="a", text="你好", seq=0, final=True)
            await asyncio.wait_for(playing.wait(), 1)
            await voice.interrupt()
            await asyncio.sleep(0)
            self.assertTrue(released.is_set())
            self.assertFalse(any(e.get("phase") == "completed" for e in events))
            self.assertTrue(any(e["type"] == "generation_cancelled" for e in events))
        finally:
            await voice.stop()
