"""控制契约测试；替身不作为真实模型和麦克风验收。"""
import asyncio
from array import array
from dataclasses import replace
import unittest

from voice.main import Limits, ProviderConfig, VoiceConfig, VoiceError, VoiceInfo, create_voice
from voice._audio import Segmenter
from voice._engine import Voice


class Provider:
    config = ProviderConfig("http://127.0.0.1/tts", "test", asr_url="http://127.0.0.1/asr",
                            voices=(VoiceInfo("default", "默认"), VoiceInfo("other", "其他")))

    def __init__(self):
        self.texts = []
        self.hang = False
        self.fail = False
        self.cancelled = False

    async def synthesize(self, text, config):
        self.texts.append((text, config.voice_id))
        if self.fail:
            raise ValueError("SECRET")
        try:
            if self.hang:
                await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        return b"\1\0" * 100

    async def transcribe(self, pcm, language):
        return "识别结果"


class Audio:
    def __init__(self):
        self.frames = None
        self.closed = 0
        self.played = []
        self.hang = False
        self.cancelled = False

    def open_capture(self, on_frame, on_error):
        self.frames = on_frame
        self.on_error = on_error
        owner = self
        class Handle:
            def close(self):
                owner.closed += 1
        return Handle()

    async def play(self, pcm, rate, volume, started):
        self.played.append((pcm, volume))
        started()
        try:
            if self.hang:
                await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled = True
            raise


class VoiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.provider, self.audio = Provider(), Audio()
        self.voice = Voice(self.provider, self.audio, Limits(operation_timeout_seconds=.1, stream_idle_timeout_seconds=.05))
        self.events = []
        self.voice.subscribe(self.events.append)
        self.sid = await self.voice.start(capture=False)

    async def asyncTearDown(self):
        await self.voice.stop()

    def say(self, speech="a", text="你好", seq=0, final=True, sid=None):
        return self.voice.speak(session_id=sid or self.sid, generation=self.voice._generation,
                                speech_id=speech, text=text, seq=seq, final=final)

    async def settle(self):
        await asyncio.sleep(.01)

    async def test_real_render_path_calls_synthesis_and_audio(self):
        self.say()
        await self.settle()
        self.assertEqual(self.provider.texts, [("你好", "default")])
        self.assertEqual(len(self.audio.played), 1)
        self.assertTrue(any(e.get("phase") == "completed" for e in self.events))

    async def test_duplicate_conflict_and_order(self):
        self.say(final=False)
        self.assertTrue(self.say(final=False)["duplicate"])
        with self.assertRaisesRegex(VoiceError, "CONFLICT"):
            self.say(text="不同", final=False)
        with self.assertRaisesRegex(VoiceError, "OUT_OF_ORDER"):
            self.say(seq=2)
        self.say(text="", seq=1)
        await self.settle()
        self.assertEqual(len(self.audio.played), 1)
        self.assertTrue(self.say(text="", seq=1)["duplicate"])

    async def test_config_snapshot_and_local_volume(self):
        self.voice.configure(volume=.5)
        self.say(final=False)
        self.voice.configure(voice_id="other", volume=.2)
        self.say(text="续句", seq=1)
        self.say(speech="b")
        await self.settle()
        self.assertEqual([x[1] for x in self.provider.texts], ["default", "default", "other"])
        self.assertEqual([x[1] for x in self.audio.played], [.5, .5, .2])

    async def test_completion_waits_for_playback(self):
        self.audio.hang = True
        self.say()
        await self.settle()
        self.assertFalse(any(e.get("phase") == "completed" for e in self.events))
        self.assertTrue(any(e.get("phase") == "started" for e in self.events))

    async def test_waiting_for_next_text_reports_buffering(self):
        self.say(final=False)
        await self.settle()
        states = [e for e in self.events if e["type"] == "state"]
        self.assertEqual(states[-1]["playback"], "buffering")

    async def test_interrupt_cancels_device_and_queue(self):
        self.audio.hang = True
        self.say()
        self.say(speech="b")
        await self.settle()
        self.assertEqual(await self.voice.interrupt(), ["a", "b"])
        self.assertTrue(self.audio.cancelled)
        with self.assertRaisesRegex(VoiceError, "SPEECH_CLOSED"):
            self.say()
        self.audio.hang = False
        self.say(speech="c")
        await self.settle()
        self.assertTrue(any(e.get("speech_id") == "c" and e.get("phase") == "completed" for e in self.events))

    async def test_interrupt_cancels_synthesis(self):
        self.provider.hang = True
        self.say()
        await self.settle()
        await self.voice.interrupt()
        self.assertTrue(self.provider.cancelled)
        self.assertEqual(self.audio.played, [])

    async def test_stop_restart_rejects_old_session(self):
        await self.voice.stop()
        new = await self.voice.start(capture=False)
        self.assertNotEqual(new, self.sid)
        with self.assertRaisesRegex(VoiceError, "STALE_SESSION"):
            self.say()

    async def test_start_is_idempotent(self):
        ids = await asyncio.gather(self.voice.start(), self.voice.start())
        self.assertEqual(ids, [self.sid, self.sid])

    async def test_failure_sanitized_and_next_speech_runs(self):
        self.provider.fail = True
        self.say()
        await self.settle()
        self.assertNotIn("SECRET", str(self.events))
        self.assertTrue(any(e.get("phase") == "failed" for e in self.events))
        self.provider.fail = False
        self.say(speech="b")
        await self.settle()
        self.assertTrue(any(e.get("speech_id") == "b" and e.get("phase") == "completed" for e in self.events))

    async def test_incomplete_stream_timeout_unblocks_next(self):
        self.say(final=False)
        self.say(speech="b")
        await asyncio.sleep(.09)
        self.assertTrue(any(e.get("speech_id") == "a" and e.get("reason") == "TIMEOUT" for e in self.events))
        self.assertTrue(any(e.get("speech_id") == "b" and e.get("phase") == "completed" for e in self.events))

    async def test_operation_timeout_aborts_device(self):
        self.audio.hang = True
        self.say()
        await asyncio.sleep(.13)
        self.assertTrue(self.audio.cancelled)
        self.assertTrue(any(e.get("reason") == "TIMEOUT" for e in self.events))

    async def test_capacity_is_checked_before_acceptance(self):
        self.voice._limits = Limits(max_session_speeches=1, max_speech_characters=3)
        with self.assertRaisesRegex(VoiceError, "CAPACITY"):
            self.say(text="1234")
        self.say(text="123")
        await self.settle()
        with self.assertRaisesRegex(VoiceError, "CAPACITY"):
            self.say(speech="b")

    async def test_observer_isolation_and_unsubscribe(self):
        values = []
        unsub = self.voice.subscribe(values.append)
        unsub()
        self.voice.subscribe(lambda e: (_ for _ in ()).throw(ValueError()))
        self.say()
        await self.settle()
        self.assertEqual(len(values), 1)
        self.assertTrue(any(e.get("phase") == "completed" for e in self.events))

    async def test_config_validation(self):
        for kwargs in ({"volume": float("nan")}, {"rate": 0}, {"token": "secret"}):
            with self.assertRaises(VoiceError):
                self.voice.configure(**kwargs)
        with self.assertRaisesRegex(VoiceError, "VOICE_UNAVAILABLE"):
            self.voice.configure(voice_id="absent")
        with self.assertRaisesRegex(VoiceError, "INVALID_STATE"):
            self.voice.configure(language="en")

    async def test_capture_segmentation_and_asr(self):
        await self.voice.stop()
        await self.voice.start()
        self.emit_utterance()
        await self.settle()
        self.assertTrue(any(e.get("text") == "识别结果" for e in self.events))

    def emit_utterance(self):
        for _ in range(5):
            self.audio.frames(array("h", [2000] * 320).tobytes())
        for _ in range(25):
            self.audio.frames(b"\0" * 640)

    async def test_mute_closes_capture_and_resume_reopens(self):
        await self.voice.stop()
        await self.voice.start()
        await self.voice.set_muted(True)
        self.assertEqual(self.audio.closed, 1)
        self.emit_utterance()
        await self.settle()
        self.assertFalse(any(e.get("type") == "transcript" for e in self.events))
        await self.voice.set_muted(False)
        self.emit_utterance()
        await self.settle()
        self.assertTrue(any(e.get("type") == "transcript" for e in self.events))

    async def test_auto_interrupt_on_voice_start(self):
        await self.voice.stop()
        self.sid = await self.voice.start()
        self.audio.hang = True
        self.say()
        await self.settle()
        self.emit_utterance()
        await self.settle()
        self.assertTrue(self.audio.cancelled)
        self.assertTrue(any(e.get("reason") == "speech" for e in self.events))

    async def test_missing_asr_allows_playback_only(self):
        provider = replace(self.provider.config, asr_url="")
        voice = create_voice(provider)
        with self.assertRaisesRegex(VoiceError, "ASR_UNAVAILABLE"):
            await voice.start()
        await voice.start(capture=False)
        await voice.stop()

    async def test_old_capture_after_unmute_cannot_interrupt_new_playback(self):
        await self.voice.stop()
        self.sid = await self.voice.start()
        old_frames, old_error = self.audio.frames, self.audio.on_error
        await self.voice.set_muted(True)
        await self.voice.set_muted(False)
        self.audio.hang = True
        self.say()
        await self.settle()
        for _ in range(5):
            old_frames(array("h", [2000] * 320).tobytes())
        old_error()
        await self.settle()
        self.assertFalse(self.audio.cancelled)
        self.assertFalse(any(e.get("reason") == "speech" for e in self.events))

    async def test_cancel_notifies_even_before_first_generated_text_and_rejects_late_text(self):
        old = self.voice._generation
        self.assertEqual(await self.voice.interrupt(), [])
        await self.settle()
        cancel = [e for e in self.events if e["type"] == "generation_cancelled"][-1]
        self.assertEqual(cancel["generation"], old)
        self.assertEqual(cancel["next_generation"], old + 1)
        with self.assertRaisesRegex(VoiceError, "STALE_GENERATION"):
            self.voice.speak(session_id=self.sid, generation=old, speech_id="late", text="旧回复", seq=0, final=True)
        self.say(speech="fresh")
        await self.settle()
        self.assertEqual(self.provider.texts, [("你好", "default")])

    async def test_speech_start_invalidates_before_cancel_listener_can_submit_new_reply(self):
        await self.voice.stop()
        self.sid = await self.voice.start()
        def listener(event):
            if event["type"] == "generation_cancelled" and event["reason"] == "speech":
                self.voice.speak(session_id=self.sid, generation=event["next_generation"],
                                 speech_id="new", text="新回复", seq=0, final=True)
        self.voice.subscribe(listener)
        for _ in range(3):
            self.audio.frames(array("h", [2000] * 320).tobytes())
        await self.settle()
        self.assertTrue(any(e.get("speech_id") == "new" and e.get("phase") == "completed" for e in self.events))

    async def test_transcript_retains_generation_at_capture_and_local_aec_is_not_claimed(self):
        await self.voice.stop()
        self.sid = await self.voice.start()
        self.emit_utterance()
        await self.settle()
        result = [e for e in self.events if e["type"] == "transcript"][-1]
        self.assertEqual(result["generation"], self.voice._generation)
        states = [e for e in self.events if e["type"] == "state"]
        self.assertFalse(states[-1]["echo_cancellation"])


class SegmentTests(unittest.TestCase):
    def test_silence_does_not_trigger(self):
        segmenter = Segmenter()
        for _ in range(100):
            self.assertEqual(segmenter.feed(b"\0" * 640), (False, None))

    def test_short_noise_does_not_trigger(self):
        segmenter = Segmenter()
        for _ in range(2):
            self.assertEqual(segmenter.feed(array("h", [2000] * 320).tobytes()), (False, None))
        self.assertEqual(segmenter.feed(b"\0" * 640), (False, None))


if __name__ == "__main__":
    unittest.main()
