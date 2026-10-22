"""PortAudio 真实设备适配与有界语句分段，不依赖应用框架。"""
from __future__ import annotations

import asyncio
from array import array
from collections import deque
import math
import sys

from ._contracts import VoiceError


class Segmenter:
    """对 20 ms PCM 帧做能量分段，保留 200 ms 前沿，最长单句 15 秒。

    这是基本能量检测，不等同于神经 VAD；外放回声可能触发打断。
    默认要求连续 60 ms 超过阈值，连续 500 ms 安静结束一句。
    """

    def __init__(self, threshold: float = 600):
        self.threshold = threshold
        self.reset()

    def reset(self):
        self.pre = deque(maxlen=10)
        self.frames = []
        self.loud = self.silent = 0
        self.active = False

    def feed(self, pcm: bytes):
        """返回 (是否刚开始说话, 已结束语句 PCM 或 None)。"""
        samples = array("h", pcm)
        if sys.byteorder != "little":
            samples.byteswap()
        rms = math.sqrt(sum(x * x for x in samples) / max(1, len(samples)))
        loud = rms >= self.threshold
        started = False
        if not self.active:
            self.pre.append(pcm)
            self.loud = self.loud + 1 if loud else 0
            if self.loud >= 3:
                self.active = started = True
                self.frames = list(self.pre)
        else:
            self.frames.append(pcm)
        if self.active:
            self.silent = 0 if loud else self.silent + 1
            if self.silent >= 25 or len(self.frames) >= 750:
                result = b"".join(self.frames)
                self.reset()
                return started, result
        return started, None


class LocalAudio:
    """使用 sounddevice 的原生流录音与播放；构造时不访问麦克风。"""

    def __init__(self, input_device=None, output_device=None):
        self.input_device = input_device
        self.output_device = output_device

    def open_capture(self, on_frame, on_error):
        """打开 16 kHz 单声道麦克风，返回同步 close 句柄。

        音频线程只复制字节；事件循环负责识别和状态处理。
        有界 mailbox 防止事件循环阻塞时无限排队音频回调。
        """
        import sounddevice as sd
        import threading
        loop = asyncio.get_running_loop()
        frames = deque(maxlen=50)
        lock = threading.Lock()
        scheduled = False
        closed = False
        overflow = False

        def drain():
            nonlocal scheduled, overflow
            with lock:
                batch = list(frames)
                frames.clear()
                failed = overflow
                scheduled = overflow = False
            if closed:
                return
            if failed:
                on_error()
                return
            for frame in batch:
                on_frame(frame)

        def callback(data, count, time, status):
            nonlocal scheduled, overflow
            with lock:
                if closed:
                    return
                overflow = overflow or bool(status) or len(frames) >= frames.maxlen
                frames.append(bytes(data))
                if not scheduled:
                    scheduled = True
                    loop.call_soon_threadsafe(drain)

        stream = None
        try:
            stream = sd.RawInputStream(samplerate=16000, channels=1, dtype="int16", blocksize=320,
                                       device=self.input_device, callback=callback)
            stream.start()
        except Exception:
            if stream is not None:
                stream.close()
            raise VoiceError("CAPTURE_FAILED") from None

        class Capture:
            def close(self):
                nonlocal closed
                if not closed:
                    with lock:
                        closed = True
                        frames.clear()
                    try:
                        stream.abort()
                    finally:
                        stream.close()

        return Capture()

    async def play(self, pcm: bytes, sample_rate: int, volume: float, on_started):
        """将实际 PCM 写入扬声器；正常返回表示设备队列已播放完。

        取消协程立即 abort 原生流，不使用不可取消的阻塞 write 线程。
        音量在本地缩放；提供者无需支持音量参数。
        """
        import sounddevice as sd
        if not pcm or len(pcm) % 2:
            raise VoiceError("INVALID_AUDIO")
        if volume != 1:
            samples = array("h", pcm)
            if sys.byteorder != "little":
                samples.byteswap()
            samples = array("h", (int(x * volume) for x in samples))
            if sys.byteorder != "little":
                samples.byteswap()
            pcm = samples.tobytes()
        loop = asyncio.get_running_loop()
        finished = loop.create_future()
        offset = 0
        stream = None

        def resolve(error=None):
            if not finished.done():
                if error:
                    finished.set_exception(VoiceError(error))
                else:
                    finished.set_result(None)

        def callback(out, frames, time, status):
            nonlocal offset
            if status:
                loop.call_soon_threadsafe(resolve, "PLAYBACK_FAILED")
                raise sd.CallbackAbort
            size = min(frames * 2, len(pcm) - offset)
            out[:] = pcm[offset:offset + size] + b"\0" * (frames * 2 - size)
            if offset == 0:
                loop.call_soon_threadsafe(on_started)
            offset += size
            if offset >= len(pcm):
                # CallbackStop 会先排空已提交帧，再触发 finished_callback。
                raise sd.CallbackStop

        try:
            stream = sd.RawOutputStream(samplerate=sample_rate, channels=1, dtype="int16",
                                        device=self.output_device, callback=callback,
                                        finished_callback=lambda: loop.call_soon_threadsafe(resolve))
            stream.start()
            await finished
        except asyncio.CancelledError:
            raise
        except VoiceError:
            raise
        except Exception:
            raise VoiceError("PLAYBACK_FAILED") from None
        finally:
            if stream is not None:
                try:
                    stream.abort()
                finally:
                    stream.close()
