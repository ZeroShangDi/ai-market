import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from voice_service.work_bridge import WorkAnnouncements, WorkNoticeEndFrame, proposal
from pipecat.frames.frames import UserStartedSpeakingFrame, UserStoppedSpeakingFrame, BotStartedSpeakingFrame, BotStoppedSpeakingFrame, TTSSpeakFrame

class WorkBridge(unittest.IsolatedAsyncioTestCase):
    async def test_notice_waits_for_chat_idle_and_acknowledges_after_playback(self):
        sent=[];history=[]
        node=WorkAnnouncements(SimpleNamespace(send_app_message=sent.append),SimpleNamespace(add_message=history.append))
        node.push_frame=AsyncMock()
        node.observe(UserStartedSpeakingFrame())
        node.receive({'type':'task_notice','id':'work:4','text':'任务完成。报告已生成。'})
        node.loop=asyncio.create_task(node.run_notices())
        await asyncio.sleep(.35);node.push_frame.assert_not_called()
        node.observe(UserStoppedSpeakingFrame());node.observe(BotStartedSpeakingFrame());node.observe(BotStoppedSpeakingFrame());node.quiet_since=time.monotonic()-3
        await asyncio.sleep(.35)
        self.assertIsInstance(node.push_frame.call_args_list[0].args[0],TTSSpeakFrame)
        self.assertFalse(any(e['type']=='task_notice_ack' for e in sent))
        node.observe(BotStoppedSpeakingFrame())
        self.assertFalse(any(e['type']=='task_notice_ack' for e in sent))
        node.observe(WorkNoticeEndFrame(notice_id='work:4'))
        self.assertEqual(sent[-1],{'type':'task_notice_ack','id':'work:4'})
        node.receive({'type':'task_notice','id':'work:4','text':'重复'})
        self.assertFalse(node.pending)
        await node.cleanup()

    async def test_interruption_does_not_acknowledge_unheard_notice(self):
        sent=[]
        node=WorkAnnouncements(SimpleNamespace(send_app_message=sent.append),SimpleNamespace(add_message=lambda x:None))
        node.speaking_notice='work:1'
        node.observe(UserStartedSpeakingFrame());node.observe(BotStoppedSpeakingFrame());node.observe(WorkNoticeEndFrame(notice_id='work:1'))
        self.assertEqual(sent,[])
        self.assertTrue(node.busy, 'old bot stop during barge-in must not make the microphone turn idle')
        # No Work client/cancellation endpoint exists in the audio notification processor.
        await node.cleanup()

    def test_proposal_is_only_a_bounded_confirmation_request(self):
        p=proposal('整理报告');self.assertEqual(p['type'],'task_proposal');self.assertEqual(len(p['id']),36)
        for value in ('',None,'a'*6001):
            with self.assertRaises(ValueError): proposal(value)
