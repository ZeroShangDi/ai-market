"""检验真实音频适配器对 PortAudio 回调的使用，不操作实际设备。"""
import asyncio
from array import array
import unittest
from unittest.mock import patch

import sounddevice as sd

from voice._audio import LocalAudio
from voice.main import VoiceError


class AudioTests(unittest.IsolatedAsyncioTestCase):
    async def test_pcm_volume_padding_and_drain_completion(self):
        played = []
        lifecycle = []
        class Stream:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
            def start(self):
                output = bytearray(8)
                try:
                    self.kwargs["callback"](output, 4, None, None)
                except sd.CallbackStop:
                    played.append(output)
                    self.kwargs["finished_callback"]()
            def abort(self):
                lifecycle.append("abort")
            def close(self):
                lifecycle.append("close")
        started = []
        with patch("sounddevice.RawOutputStream", Stream):
            await LocalAudio().play(array("h", [1000, -1000]).tobytes(), 24000, .5, lambda: started.append(True))
        self.assertEqual(array("h", played[0]).tolist(), [500, -500, 0, 0])
        self.assertEqual(started, [True])
        self.assertEqual(lifecycle, ["abort", "close"])

    async def test_cancel_aborts_and_closes_native_stream(self):
        lifecycle = []
        opened = asyncio.Event()
        class Stream:
            def __init__(self, **kwargs):
                pass
            def start(self):
                lifecycle.append("start")
                opened.set()
            def abort(self):
                lifecycle.append("abort")
            def close(self):
                lifecycle.append("close")
        with patch("sounddevice.RawOutputStream", Stream):
            task = asyncio.create_task(LocalAudio().play(b"\1\0" * 100, 24000, 1, lambda: None))
            await asyncio.wait_for(opened.wait(), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertEqual(lifecycle, ["start", "abort", "close"])

    async def test_output_device_error_is_sanitized(self):
        with patch("sounddevice.RawOutputStream", side_effect=RuntimeError("private device path")):
            with self.assertRaisesRegex(VoiceError, "PLAYBACK_FAILED") as error:
                await LocalAudio().play(b"\0\0", 24000, 1, lambda: None)
        self.assertNotIn("private", str(error.exception))

    async def test_closed_capture_discards_queued_frames(self):
        streams = []
        class Stream:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                streams.append(self)
            def start(self):
                self.kwargs["callback"](b"\0" * 640, 320, None, None)
            def abort(self):
                pass
            def close(self):
                pass
        received = []
        with patch("sounddevice.RawInputStream", Stream):
            capture = LocalAudio().open_capture(received.append, lambda: None)
            capture.close()
            await asyncio.sleep(0)
            streams[0].kwargs["callback"](b"\0" * 640, 320, None, None)
            await asyncio.sleep(0)
        self.assertEqual(received, [])

    async def test_stream_plays_before_source_finishes_and_cancel_closes_source(self):
        opened, release, closed_source = asyncio.Event(), asyncio.Event(), asyncio.Event()
        device = []
        async def source():
            try:
                yield b"\1\0" * 2
                await release.wait()
                yield b"\2\0" * 2
            finally:
                closed_source.set()
        class Stream:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
            def start(self):
                out = bytearray(4)
                self.kwargs["callback"](out, 2, None, None)
                device.append(bytes(out))
                opened.set()
            def abort(self):
                device.append("aborted")
            def close(self):
                device.append("closed")
        started = []
        with patch("sounddevice.RawOutputStream", Stream):
            task = asyncio.create_task(LocalAudio().play_stream(source(), 24000, 1, lambda: started.append(True)))
            await asyncio.wait_for(opened.wait(), 1)
            await asyncio.sleep(0)
            self.assertFalse(release.is_set())
            self.assertEqual(device[0], b"\1\0" * 2)
            self.assertEqual(started, [True])
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertTrue(closed_source.is_set())
        self.assertEqual(device[-2:], ["aborted", "closed"])

    async def test_stream_backpressure_bounds_source_reads(self):
        produced = []
        opened = asyncio.Event()
        async def source():
            for i in range(10000):
                produced.append(i)
                yield b"\1\0" * 480
        class Stream:
            def __init__(self, **kwargs): pass
            def start(self): opened.set()
            def abort(self): pass
            def close(self): pass
        with patch("sounddevice.RawOutputStream", Stream):
            task = asyncio.create_task(LocalAudio().play_stream(source(), 24000, 1, lambda: None))
            await asyncio.wait_for(opened.wait(), 1)
            await asyncio.sleep(0)
            self.assertLessEqual(len(produced), 9)  # 160 ms 缓冲 + 当前等待写入的 20 ms。
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

    async def test_source_failure_aborts_output_without_success(self):
        opened = asyncio.Event()
        closed = []
        async def source():
            yield b"\1\0" * 2
            await opened.wait()
            raise VoiceError("INVALID_AUDIO")
        class Stream:
            def __init__(self, **kwargs): pass
            def start(self): opened.set()
            def abort(self): closed.append("abort")
            def close(self): closed.append("close")
        with patch("sounddevice.RawOutputStream", Stream):
            with self.assertRaisesRegex(VoiceError, "INVALID_AUDIO"):
                await LocalAudio().play_stream(source(), 24000, 1, lambda: None)
        self.assertEqual(closed, ["abort", "close"])
