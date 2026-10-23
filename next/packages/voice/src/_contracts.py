"""配置、公开数据与稳定错误；不携带业务身份或回复模型。"""
from __future__ import annotations

from dataclasses import dataclass, field
import math
import re
from urllib.parse import urlsplit
from typing import AsyncIterator, Callable, Protocol


class CaptureHandle(Protocol):
    """终端采集句柄；关闭必须释放设备且阻止旧帧继续投递。"""

    def close(self) -> None: ...


class AudioTerminal(Protocol):
    """可信宿主注入的音频终端；输入是终端完成回声处理后的 16 kHz PCM。

    不负责网络地址、鉴权或专网配置。echo_cancellation 必须反映真实能力。
    """

    echo_cancellation: bool

    def open_capture(self, on_frame: Callable[[bytes], None], on_error: Callable[[], None]) -> CaptureHandle:
        """回调提供 20 ms、单声道、s16le 音频帧；在所属事件循环投递。"""
        ...

    async def play_stream(self, chunks: AsyncIterator[bytes], sample_rate: int,
                          volume: float, on_started: Callable[[], None]) -> None:
        """有界缓冲播放；排空后返回，取消时立即停止设备并关闭输入流。"""
        ...


class VoiceError(Exception):
    """公开错误，只暴露稳定错误码，不携带提供者原始正文。"""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def valid_id(value: object) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value))


@dataclass(frozen=True)
class VoiceInfo:
    id: str
    name: str
    languages: tuple[str, ...] = ("zh",)


@dataclass(frozen=True)
class VoiceConfig:
    voice_id: str = "default"
    rate: float = 1.0
    volume: float = 1.0
    language: str = "zh"
    auto_interrupt: bool = True

    def __post_init__(self):
        if (not valid_id(self.voice_id) or not isinstance(self.language, str)
                or not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", self.language)
                or type(self.auto_interrupt) is not bool):
            raise VoiceError("INVALID_INPUT")
        for value, low, high in ((self.rate, .25, 4), (self.volume, 0, 1)):
            if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                raise VoiceError("INVALID_INPUT")


@dataclass(frozen=True)
class ProviderConfig:
    """宿主显式注入服务端连接信息；密钥不会出现在 repr 或事件中。

    Args:
        tts_url: 完整合成地址，返回单声道 signed 16-bit little-endian PCM。
        asr_url: 完整识别地址；未设置时可用 start(capture=False) 仅播报。
        asr_protocol: openai 为 multipart，qwen-wav 为 WAV 请求正文。
        voices: 部署方提供的可用音色清单，无通用音色查询 HTTP 协议。
    """

    tts_url: str
    tts_model: str
    tts_key: str = field(default="", repr=False)
    asr_url: str = ""
    asr_model: str = ""
    asr_key: str = field(default="", repr=False)
    asr_protocol: str = "openai"
    sample_rate: int = 24000
    timeout_seconds: float = 30
    max_audio_bytes: int = 16 * 1024 * 1024
    voices: tuple[VoiceInfo, ...] = (VoiceInfo("default", "默认"),)

    def __post_init__(self):
        for url in (self.tts_url, self.asr_url):
            if not url:
                continue
            parsed = urlsplit(url)
            if parsed.username or parsed.password or parsed.fragment or not parsed.hostname:
                raise VoiceError("INVALID_INPUT")
            if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")):
                raise VoiceError("INVALID_INPUT")
        if (not self.tts_url or not self.tts_model or self.asr_protocol not in ("openai", "qwen-wav")
                or type(self.sample_rate) is not int or self.sample_rate not in (16000, 22050, 24000, 44100, 48000)
                or type(self.timeout_seconds) not in (int, float) or not math.isfinite(self.timeout_seconds)
                or self.timeout_seconds <= 0 or type(self.max_audio_bytes) is not int or self.max_audio_bytes < 2):
            raise VoiceError("INVALID_INPUT")
        if not self.voices or len(self.voices) > 1000 or any(not isinstance(v, VoiceInfo) or not valid_id(v.id) for v in self.voices):
            raise VoiceError("INVALID_INPUT")
        if len({v.id for v in self.voices}) != len(self.voices):
            raise VoiceError("INVALID_INPUT")


@dataclass(frozen=True)
class Limits:
    max_queued_speeches: int = 8
    max_session_speeches: int = 256
    max_speech_characters: int = 16000
    max_chunks_per_speech: int = 1024
    operation_timeout_seconds: float = 45
    stream_idle_timeout_seconds: float = 15

    def __post_init__(self):
        for name in ("max_queued_speeches", "max_session_speeches", "max_speech_characters", "max_chunks_per_speech"):
            value = getattr(self, name)
            if type(value) is not int or value < 1:
                raise VoiceError("INVALID_INPUT")
        for value in (self.operation_timeout_seconds, self.stream_idle_timeout_seconds):
            if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
                raise VoiceError("INVALID_INPUT")
