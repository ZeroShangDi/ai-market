import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
import httpx
from voice_service.history import VoiceHistory


class History(unittest.IsolatedAsyncioTestCase):
    async def test_order_retry_identity_and_single_conversation(self):
        sent, requests = [], []
        connection = SimpleNamespace(send_app_message=sent.append)
        bridge = SimpleNamespace(request=AsyncMock(return_value={'id': '42'}))
        real = httpx.AsyncClient
        def handler(request):
            requests.append(request)
            self.assertEqual(request.headers['X-AI-User'], '7')
            return httpx.Response(503 if len(requests) == 1 else 200, json={'data': {}})
        with patch.dict(os.environ, {'AI_INTERNAL_TOKEN': 'x'*32}), patch('voice_service.history.httpx.AsyncClient',
                side_effect=lambda **kwargs: real(transport=httpx.MockTransport(handler))):
            history = VoiceHistory(connection, {'tenant':'0','user':'7','device':'10','host_plugin_bridge':True}, bridge)
            history.append('user', '问题'); history.append('assistant', '回答')
            await asyncio.wait_for(history.queue.join(), 3)
            await history.close()
        bridge.request.assert_awaited_once()
        self.assertEqual(len(requests), 3)
        self.assertEqual(requests[0].content, requests[1].content)
        self.assertEqual(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key'])
        self.assertNotEqual(requests[1].headers['Idempotency-Key'], requests[2].headers['Idempotency-Key'])
        self.assertEqual(sent, [])

    async def test_tts_completion_does_not_duplicate_scheduled_sentence(self):
        from voice_service.pipeline import VoiceStates
        from pipecat.frames.frames import AggregatedTextFrame, TTSTextFrame
        from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
        sent = []
        history = SimpleNamespace(append=Mock())
        states = VoiceStates(SimpleNamespace(send_app_message=sent.append), history=history)
        states.push_frame = AsyncMock()
        with patch.object(FrameProcessor, 'process_frame', new=AsyncMock()):
            for cls in (AggregatedTextFrame, TTSTextFrame):
                frame = cls('同一句话', aggregated_by='sentence'); frame.will_be_spoken = True
                await states.process_frame(frame, FrameDirection.DOWNSTREAM)
        history.append.assert_called_once_with('assistant', '同一句话')
        self.assertEqual(len(sent), 1)
        await states.cleanup()

    async def test_browser_without_authorized_host_does_not_write(self):
        with patch.dict(os.environ, {'AI_INTERNAL_TOKEN': 'x'*32}):
            bridge = SimpleNamespace(request=AsyncMock())
            history = VoiceHistory(None, {}, bridge)
            history.append('user', '不持久化')
            self.assertIsNone(history.task)
            bridge.request.assert_not_called()
