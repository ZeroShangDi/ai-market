"""真实 HTTP 识别 / 合成适配；不读取环境变量、不记录正文。"""
from __future__ import annotations

import io
import json
import wave

from ._contracts import ProviderConfig, VoiceConfig, VoiceError


class HttpSpeechProvider:
    """通过 httpx 发起可取消请求，每次调用独立关闭连接。"""

    def __init__(self, config: ProviderConfig):
        self.config = config

    async def _request(self, url, key, max_bytes, **kwargs):
        """有界读取响应；超时、取消和错误均关闭连接，不暴露原始错误。"""
        import httpx
        headers = {"Authorization": "Bearer " + key} if key else {}
        headers.update(kwargs.pop("headers", {}))
        try:
            # 禁止重定向和环境代理，避免认证头意外流向另一个服务。
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds, follow_redirects=False, trust_env=False) as client:
                async with client.stream("POST", url, headers=headers, **kwargs) as response:
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").split(";")[0].strip()
                    result = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(result) + len(chunk) > max_bytes:
                            raise VoiceError("CAPACITY")
                        result.extend(chunk)
                    return bytes(result), content_type
        except VoiceError:
            raise
        except httpx.TimeoutException:
            raise VoiceError("TIMEOUT") from None
        except (httpx.HTTPError, ValueError):
            raise VoiceError("PROVIDER_FAILED") from None

    async def synthesize(self, text: str, config: VoiceConfig) -> bytes:
        """将文字合成为真实 PCM；拒绝空音频、错误格式和不完整采样。"""
        pcm, mime = await self._request(
            self.config.tts_url, self.config.tts_key, self.config.max_audio_bytes,
            json={"model": self.config.tts_model, "voice": config.voice_id,
                  "input": text, "response_format": "pcm", "speed": config.rate},
        )
        if mime not in ("audio/pcm", "audio/raw", "application/octet-stream") or not pcm or len(pcm) % 2:
            raise VoiceError("INVALID_AUDIO")
        return pcm

    async def transcribe(self, pcm: bytes, language: str) -> str:
        """把 16 kHz 单声道 PCM 封装成内存 WAV，返回最终识别文本。"""
        if not self.config.asr_url:
            raise VoiceError("ASR_UNAVAILABLE")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(pcm)
        audio = buffer.getvalue()
        if self.config.asr_protocol == "qwen-wav":
            args = {"content": audio, "headers": {"Content-Type": "audio/wav"}}
        else:
            args = {"files": {"file": ("speech.wav", audio, "audio/wav")},
                    "data": {"model": self.config.asr_model, "language": language}}
        body, _ = await self._request(self.config.asr_url, self.config.asr_key, 65536, **args)
        try:
            text = json.loads(body)["text"]
            if not isinstance(text, str) or len(text) > 16000:
                raise ValueError()
            return text.strip()
        except (ValueError, KeyError, TypeError):
            raise VoiceError("PROVIDER_FAILED") from None
