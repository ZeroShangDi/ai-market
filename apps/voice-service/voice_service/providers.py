"""Provider details stay inside the optional voice capability."""
import os
import re
from collections.abc import AsyncGenerator

import httpx
from pipecat.frames.frames import ErrorFrame, Frame, TTSAudioRawFrame, TTSStartedFrame, TTSStoppedFrame, TranscriptionFrame
from pipecat.services.tts_service import TTSService
from pipecat.services.settings import TTSSettings, STTSettings
from pipecat.services.stt_service import SegmentedSTTService
from pipecat.utils.time import time_now_iso8601
from pipecat.services.openai.stt import OpenAISTTService, OpenAIRealtimeSTTService
from pipecat.transcriptions.language import Language


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing {name}")
    return value


def create_stt():
    mode = os.environ.get("VOICE_STT_PROTOCOL", "openai-http")
    options = dict(api_key=required("VOICE_STT_API_KEY"), base_url=required("VOICE_STT_URL"))
    if mode == "qwen-mlx-http":
        return MlxASRService()
    if mode == "openai-realtime":
        return OpenAIRealtimeSTTService(**options, settings=OpenAIRealtimeSTTService.Settings(
            model=required("VOICE_STT_MODEL"), language=Language.ZH))
    if mode != "openai-http":
        raise RuntimeError("Unsupported VOICE_STT_PROTOCOL")
    # HTTP providers receive VAD-delimited utterances; this is not streaming recognition.
    return OpenAISTTService(**options, settings=OpenAISTTService.Settings(
        model=required("VOICE_STT_MODEL"), language=Language.ZH))


class MlxASRService(SegmentedSTTService):
    def __init__(self):
        self.url=required('VOICE_STT_URL').rstrip('/')+'/audio/transcribe'
        self.key=required('VOICE_STT_API_KEY')
        super().__init__(sample_rate=16000,settings=STTSettings(model=required('VOICE_STT_MODEL'),language=Language.ZH))

    async def run_stt(self,audio:bytes):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(45,connect=3),follow_redirects=False) as client:
                response=await client.post(self.url,content=audio,headers={'Authorization':'Bearer '+self.key,'Content-Type':'audio/wav'})
                response.raise_for_status()
                text=response.json()['text']
                if not isinstance(text,str) or len(text)>6000:
                    raise ValueError()
                if text.strip():
                    yield TranscriptionFrame(text.strip(),self._user_id,time_now_iso8601(),finalized=True)
        except (httpx.HTTPError,ValueError,KeyError):
            yield ErrorFrame('语音识别失败，请结束后重试',fatal=True)


def speech_segments(text: str):
    for sentence in re.findall(r'[^。！？!?；;]+[。！？!?；;]?|[。！？!?；;]', text):
        sentence = sentence.strip()
        if not any(char.isalnum() for char in sentence):
            continue
        while len(sentence) > 120:
            head = sentence[:120]
            boundary = max(head.rfind(mark) for mark in '，,、：:')
            cut = boundary + 1 if boundary >= 40 else 120
            if any(char.isalnum() for char in sentence[:cut]):
                yield sentence[:cut]
            sentence = sentence[cut:]
        if any(char.isalnum() for char in sentence):
            yield sentence


class StreamingPCMService(TTSService):
    """OpenAI-compatible speech endpoint, mono signed 16-bit little-endian PCM.

    Qwen model hosting is independent; voice cloning is configured on that server.
    Sentence aggregation and interruption cancellation belong to Pipecat.
    """
    def __init__(self, voice: str | None = None):
        self.url = required("VOICE_TTS_URL").rstrip("/") + "/audio/speech"
        self.key = required("VOICE_TTS_API_KEY")
        self.model = required("VOICE_TTS_MODEL")
        self.voice = voice or os.environ.get("VOICE_TTS_VOICE", "default")
        super().__init__(sample_rate=int(os.environ.get("VOICE_TTS_SAMPLE_RATE", "24000")),
                         settings=TTSSettings(model=self.model, voice=self.voice, language=Language.ZH))

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        yield TTSStartedFrame(context_id=context_id)
        received = False
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=5), follow_redirects=False) as client:
                for segment in speech_segments(text):
                    received = False
                    async with client.stream("POST", self.url, headers={"Authorization": f"Bearer {self.key}"},
                                             json={"model": self.model, "voice": self.voice,
                                                   "input": segment, "response_format": "pcm", "stream": True}) as response:
                        response.raise_for_status()
                        if response.headers.get("content-type", "").split(";")[0] not in {
                            "audio/pcm", "audio/raw", "application/octet-stream"}:
                            raise ValueError("Expected raw PCM")
                        pending = b""
                        async for chunk in response.aiter_bytes():
                            pending += chunk
                            size = len(pending) // 2 * 2
                            if size:
                                received = True
                                yield TTSAudioRawFrame(pending[:size], self.sample_rate, 1, context_id=context_id)
                                pending = pending[size:]
                        if pending or not received:
                            raise ValueError("Incomplete PCM")
        except (httpx.HTTPError, ValueError):
            yield ErrorFrame("语音合成失败，请结束后重试", fatal=True)
        finally:
            yield TTSStoppedFrame(context_id=context_id)
