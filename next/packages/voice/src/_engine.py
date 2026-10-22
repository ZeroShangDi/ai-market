"""语音会话与播报队列；只处理声音与文字传输，不生成回复。"""
from __future__ import annotations

import asyncio
from collections import deque
from copy import deepcopy
from dataclasses import asdict, dataclass, field, replace
from typing import Callable
from uuid import uuid4

from ._audio import Segmenter
from ._contracts import Limits, VoiceConfig, VoiceError, valid_id


@dataclass
class _Speech:
    id: str
    session_id: str
    config: VoiceConfig
    chunks: list = field(default_factory=list)
    chars: int = 0
    final: bool = False
    terminal: str = ""
    started: bool = False
    changed: asyncio.Event = field(default_factory=asyncio.Event)


class Voice:
    """单事件循环、单身份的语音实例；由 main.create_voice 创建。

    生命周期方法为协程，应 await 完成后再切换设备或身份。
    事件回调必须为同步函数；异步业务由宿主另行安排任务。
    """

    def __init__(self, provider, audio, limits: Limits):
        self._provider, self._audio, self._limits = provider, audio, limits
        self._config = VoiceConfig(voice_id=provider.config.voices[0].id)
        self._session_id = None
        self._muted = False
        self._capture = None
        self._listeners = set()
        self._queue = deque()
        self._records = {}
        self._pump_task = None
        self._recognition_task = None
        self._recognition_queue = asyncio.Queue(maxsize=2)
        self._segmenter = Segmenter()
        self._epoch = 0
        self._playing = None
        self._background = set()
        self._lifecycle = asyncio.Lock()

    def _snapshot(self):
        return {"type": "state", "session_id": self._session_id,
                "session": "active" if self._session_id else "idle",
                "capture": "muted" if self._session_id and self._muted else "listening" if self._capture else "off",
                "playback": "playing" if self._playing else "buffering" if self._queue else "idle", "muted": self._muted}

    @staticmethod
    def _deliver(listener, event):
        try:
            listener(deepcopy(event))
        except Exception:
            pass  # UI 回调故障不能中断设备清理或其他订阅。

    def _emit(self, event):
        for listener in tuple(self._listeners):
            # 延迟事件分发，避免宿主重入破坏当前队列变更。
            asyncio.get_running_loop().call_soon(self._deliver_if_subscribed, listener, deepcopy(event))

    def _deliver_if_subscribed(self, listener, event):
        if listener in self._listeners:
            self._deliver(listener, event)

    def _state(self):
        self._emit(self._snapshot())

    def _error(self, code, speech_id=None, session_id=None):
        self._emit({"type": "error", "session_id": session_id or self._session_id,
                    "speech_id": speech_id, "code": code,
                    "retryable": code in ("TIMEOUT", "CAPTURE_FAILED", "PLAYBACK_FAILED", "PROVIDER_FAILED")})

    def _playback(self, speech, phase, reason=None):
        self._emit({"type": "playback", "session_id": speech.session_id, "speech_id": speech.id,
                    "phase": phase, "reason": reason})

    def _spawn(self, coroutine):
        task = asyncio.create_task(coroutine)
        self._background.add(task)
        task.add_done_callback(self._background.discard)
        return task

    def configure(self, **options) -> VoiceConfig:
        """合并并校验配置，返回不可变完整快照。

        Args:
            **options: voice_id、rate、volume、language、auto_interrupt。
        Raises:
            VoiceError: 字段无效、音色不存在或会话中更改识别语言。
        """
        try:
            config = replace(self._config, **options)
        except TypeError:
            raise VoiceError("INVALID_INPUT") from None
        if config.voice_id not in {v.id for v in self._provider.config.voices}:
            raise VoiceError("VOICE_UNAVAILABLE")
        if self._session_id and config.language != self._config.language:
            raise VoiceError("INVALID_STATE")
        self._config = config
        return config

    def list_voices(self):
        """返回部署方声明的音色副本；不会伪装为已查询模型支持情况。"""
        return [asdict(v) for v in self._provider.config.voices]

    async def start(self, *, capture: bool = True) -> str:
        """建立会话，默认开启真实录音。

        Args:
            capture: False 为仅播报模式，不申请麦克风、不要求 ASR。
        Returns:
            当前会话 ID；重复启动复用现有会话。
        Raises:
            VoiceError: ASR 未配置、设备权限或录音建立失败。
        """
        if type(capture) is not bool:
            raise VoiceError("INVALID_INPUT")
        async with self._lifecycle:
            if self._session_id:
                return self._session_id
            if capture and not self._provider.config.asr_url:
                raise VoiceError("ASR_UNAVAILABLE")
            sid = uuid4().hex
            self._session_id = sid
            try:
                if capture:
                    epoch = self._epoch
                    self._capture = self._audio.open_capture(
                        lambda pcm: self._on_frame(sid, epoch, pcm),
                        lambda: self._capture_failed(sid, epoch),
                    )
                    self._recognition_task = asyncio.create_task(self._recognize(sid))
            except Exception:
                self._session_id = None
                self._error("CAPTURE_FAILED", session_id=sid)
                self._state()
                raise VoiceError("CAPTURE_FAILED") from None
            self._state()
            return sid

    async def stop(self):
        """取消并等待所有音频工作，释放麦克风和回执；可重复调用。

        配置和订阅保留。退出应用或切换身份还需取消订阅、丢弃实例。
        """
        async with self._lifecycle:
            sid = self._session_id
            self._session_id = None  # 先使所有迟到回调失效，再取消任务。
            self._epoch += 1
            if self._capture:
                try:
                    self._capture.close()
                except Exception:
                    self._error("CAPTURE_FAILED", session_id=sid)
                finally:
                    self._capture = None
            await self._interrupt("stop")
            tasks = [t for t in [self._recognition_task, *self._background] if t and t is not asyncio.current_task()]
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            self._recognition_task = None
            self._recognition_queue = asyncio.Queue(maxsize=2)
            self._segmenter.reset()
            self._records.clear()
            self._muted = False
            self._state()

    async def set_muted(self, muted: bool):
        """静音时关闭真实麦克风并取消待识别音频；恢复时重新打开设备。

        不影响播报；仅播报会话没有采集设备，调用会抛出 INVALID_STATE。
        """
        if type(muted) is not bool:
            raise VoiceError("INVALID_INPUT")
        async with self._lifecycle:
            if not self._session_id or (not self._capture and not self._muted):
                raise VoiceError("INVALID_STATE")
            if muted == self._muted:
                return
            self._epoch += 1
            self._muted = True
            self._segmenter.reset()
            if self._recognition_task:
                self._recognition_task.cancel()
                await asyncio.gather(self._recognition_task, return_exceptions=True)
                self._recognition_task = None
            self._recognition_queue = asyncio.Queue(maxsize=2)
            try:
                if self._capture:
                    self._capture.close()
                    self._capture = None
                if not muted:
                    sid = self._session_id
                    epoch = self._epoch
                    self._capture = self._audio.open_capture(lambda pcm: self._on_frame(sid, epoch, pcm), lambda: self._capture_failed(sid, epoch))
                    self._muted = False
                    self._recognition_task = asyncio.create_task(self._recognize(sid))
            except Exception:
                self._error("CAPTURE_FAILED")
                self._state()
                raise VoiceError("CAPTURE_FAILED") from None
            self._state()

    def speak(self, *, session_id: str, speech_id: str, seq: int, text: str, final: bool):
        """接收外部回复文字，后台实际调用 TTS 并播放 PCM。

        Returns:
            accepted/duplicate 回执；实际完成由 playback 事件通知。
        Raises:
            VoiceError: 旧会话、乱序、冲突、已取消播报或容量超限。
        """
        if (not valid_id(session_id) or not valid_id(speech_id) or type(seq) is not int or seq < 0
                or not isinstance(text, str) or type(final) is not bool or (not text and not final)):
            raise VoiceError("INVALID_INPUT")
        if not self._session_id or session_id != self._session_id:
            raise VoiceError("STALE_SESSION")
        speech = self._records.get(speech_id)
        if speech:
            if speech.terminal in ("interrupted", "failed"):
                raise VoiceError("SPEECH_CLOSED")
            if seq < len(speech.chunks):
                if speech.chunks[seq] != (text, final):
                    raise VoiceError("CONFLICT")
                return {"accepted": True, "duplicate": True}
            if speech.final or speech.terminal:
                raise VoiceError("SPEECH_CLOSED")
            if seq != len(speech.chunks):
                raise VoiceError("OUT_OF_ORDER")
        elif seq != 0:
            raise VoiceError("OUT_OF_ORDER")
        elif len(self._queue) >= self._limits.max_queued_speeches or len(self._records) >= self._limits.max_session_speeches:
            raise VoiceError("CAPACITY")
        if seq >= self._limits.max_chunks_per_speech or (speech.chars if speech else 0) + len(text) > self._limits.max_speech_characters:
            raise VoiceError("CAPACITY")
        if speech is None:
            speech = _Speech(speech_id, session_id, self._config)
            self._records[speech_id] = speech
            self._queue.append(speech)
        speech.chunks.append((text, final))
        speech.chars += len(text)
        speech.final = final
        speech.changed.set()
        if self._pump_task is None:
            self._pump_task = asyncio.create_task(self._pump(session_id))
        self._state()
        return {"accepted": True, "duplicate": False}

    async def interrupt(self):
        """停止合成和设备播放，返回被取消 ID；等待原生流清理后完成。"""
        return await self._interrupt("manual")

    async def _interrupt(self, reason):
        """先封闭回执再取消当前任务，避免取消期间迟到文本重新入队。"""
        cancelled = []
        for speech in self._queue:
            if not speech.terminal:
                speech.terminal = "interrupted"
                cancelled.append(speech.id)
                self._playback(speech, "interrupted", reason)
        self._queue.clear()
        self._playing = None
        task, self._pump_task = self._pump_task, None
        if task and task is not asyncio.current_task():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self._state()
        return cancelled

    def subscribe(self, listener: Callable):
        """同步发送状态快照，返回独立取消订阅函数；回调异常被隔离。"""
        if not callable(listener) or asyncio.iscoroutinefunction(listener):
            raise VoiceError("INVALID_INPUT")
        def observer(event):
            listener(event)
        self._listeners.add(observer)
        self._deliver(observer, self._snapshot())
        return lambda: self._listeners.discard(observer)

    async def _pump(self, sid):
        """严格按播报及文本块顺序串行合成 / 播放，不因旧回调恢复取消内容。"""
        try:
            while self._session_id == sid and self._queue:
                speech = self._queue[0]
                index = 0
                try:
                    while not speech.terminal:
                        if index == len(speech.chunks):
                            if speech.final:
                                break
                            # 检查和 clear 之间没有 await，避免流追加信号丢失。
                            speech.changed.clear()
                            await asyncio.wait_for(speech.changed.wait(), self._limits.stream_idle_timeout_seconds)
                            continue
                        text, _ = speech.chunks[index]
                        index += 1
                        if text:
                            await asyncio.wait_for(self._render(speech, text), self._limits.operation_timeout_seconds)
                    if not speech.terminal:
                        speech.terminal = "completed"
                        self._playback(speech, "completed")
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    if not speech.terminal:
                        code = "TIMEOUT" if isinstance(exc, asyncio.TimeoutError) else exc.code if isinstance(exc, VoiceError) else "PLAYBACK_FAILED"
                        speech.terminal = "failed"
                        self._error(code, speech.id, sid)
                        self._playback(speech, "failed", code)
                finally:
                    if self._playing == speech.id:
                        self._playing = None
                    if self._queue and self._queue[0] is speech:
                        self._queue.popleft()
                    self._state()
        finally:
            if self._pump_task is asyncio.current_task():
                self._pump_task = None

    async def _render(self, speech, text):
        """完成一块的真实合成与播放；发声前再次核验会话和取消状态。"""
        pcm = await self._provider.synthesize(text, speech.config)
        if speech.terminal or self._session_id != speech.session_id:
            return
        def started():
            if speech.terminal or self._session_id != speech.session_id:
                return
            self._playing = speech.id
            if not speech.started:
                speech.started = True
                self._playback(speech, "started")
            self._state()
        await self._audio.play(pcm, self._provider.config.sample_rate, speech.config.volume, started)
        if self._playing == speech.id:
            self._playing = None
            self._state()

    def _on_frame(self, sid, epoch, pcm):
        """分段与说话检测即时执行，识别交给有界队列独立处理。"""
        if self._session_id != sid or self._epoch != epoch or self._muted:
            return
        started, utterance = self._segmenter.feed(pcm)
        if started and self._config.auto_interrupt:
            self._spawn(self._interrupt("speech"))
        if utterance:
            try:
                self._recognition_queue.put_nowait((self._epoch, uuid4().hex, utterance))
            except asyncio.QueueFull:
                self._error("CAPACITY")

    def _capture_failed(self, sid, epoch):
        if self._session_id == sid and self._epoch == epoch:
            self._error("CAPTURE_FAILED")
            self._spawn(self.stop())

    async def _recognize(self, sid):
        """与采集独立的单消费者；识别慢时最多积压两句，不阻塞说话检测。"""
        while self._session_id == sid:
            epoch, utterance_id, pcm = await self._recognition_queue.get()
            try:
                text = await asyncio.wait_for(self._provider.transcribe(pcm, self._config.language), self._limits.operation_timeout_seconds)
                # 静音 / 重新采集后 epoch 改变，不能把旧识别投递到新一轮。
                if text and epoch == self._epoch and self._session_id == sid and not self._muted:
                    self._emit({"type": "transcript", "session_id": sid, "utterance_id": utterance_id, "text": text, "final": True})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                code = "TIMEOUT" if isinstance(exc, asyncio.TimeoutError) else exc.code if isinstance(exc, VoiceError) else "PROVIDER_FAILED"
                self._error(code, session_id=sid)
