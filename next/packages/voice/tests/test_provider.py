"""真实 httpx 请求编码测试，传输层替身不访问模型服务。"""
import asyncio
import json
from dataclasses import replace
import unittest
from unittest.mock import patch

import httpx

from voice.main import ProviderConfig, VoiceConfig, VoiceError
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
