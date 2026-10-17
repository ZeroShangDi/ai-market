"""Pipecat owns audio turns, interruptions, generation cancellation and aggregation."""
import os
import httpx

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import BotStartedSpeakingFrame, BotStoppedSpeakingFrame, UserStartedSpeakingFrame, ErrorFrame, TranscriptionFrame, AggregatedTextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker, PipelineParams
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy

from .agent import ask_agent
from .providers import create_stt, StreamingPCMService, required

SYSTEM = """你是统子哥的语音对话助手。用自然简短的中文交流，通常一到三句，不使用 Markdown。
日常对话直接回答。需要搜索最新信息、核实事实或深入分析时调用 ask_agent，收到结果后再简明回答。
ask_agent 当前只支持查询、搜索和分析，不支持创建文件或执行业务操作；这些任务请引导用户进入 Work。
不要声称执行了未执行的操作。没有结果时不要编造。用户插话后以最新问题为准。
"""


class VoiceTranscripts(FrameProcessor):
    def __init__(self, connection):
        super().__init__()
        self.connection = connection

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if direction == FrameDirection.DOWNSTREAM and isinstance(frame, TranscriptionFrame) and frame.text.strip():
            self.connection.send_app_message({"type": "transcript", "role": "user", "text": frame.text[:6000]})
        await self.push_frame(frame, direction)


class VoiceStates(FrameProcessor):
    def __init__(self, connection):
        super().__init__()
        self.connection = connection

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, ErrorFrame):
            self.connection.send_app_message({"type": "voice", "state": "error", "message": "语音服务暂时不可用，请结束后重试"})
        elif direction == FrameDirection.DOWNSTREAM:
            if isinstance(frame, AggregatedTextFrame) and frame.will_be_spoken and frame.text.strip():
                # Show the sentence scheduled by TTS output, rather than raw speculative LLM deltas.
                self.connection.send_app_message({"type": "transcript", "role": "assistant", "text": frame.text[:6000]})
            elif isinstance(frame, UserStartedSpeakingFrame):
                self.connection.send_app_message({"type": "voice", "state": "listening", "event": "user_started"})
            elif isinstance(frame, BotStartedSpeakingFrame):
                self.connection.send_app_message({"type": "voice", "state": "speaking", "event": "bot_started"})
            elif isinstance(frame, BotStoppedSpeakingFrame):
                self.connection.send_app_message({"type": "voice", "state": "listening", "event": "bot_stopped"})
        await self.push_frame(frame, direction)


def build_pipeline(connection, identity):
    transport = SmallWebRTCTransport(connection, TransportParams(audio_in_enabled=True, audio_out_enabled=True))
    stt, tts = create_stt(), StreamingPCMService()
    llm = OpenAILLMService(api_key=required("VOICE_LLM_API_KEY"), base_url=required("VOICE_LLM_URL"),
                           settings=OpenAILLMService.Settings(model=required("VOICE_LLM_MODEL"), max_tokens=600))
    tool = FunctionSchema(name="ask_agent", description="搜索最新信息、核实事实或深入分析；只读，不执行业务操作。",
                          properties={"question": {"type": "string", "description": "包含必要上下文的完整问题"}}, required=["question"])
    agent_enabled = bool(os.environ.get("AGENT_INTERNAL_TOKEN"))
    context = LLMContext(messages=[{"role": "system", "content": SYSTEM}],
                         tools=[tool] if agent_enabled else [])

    async def delegate(params: FunctionCallParams):
        question = params.arguments.get("question", "")
        if not isinstance(question, str) or not question.strip() or len(question) > 6000:
            await params.result_callback({"error": "问题格式不正确"})
            return
        connection.send_app_message({"type": "voice", "state": "thinking"})
        # Supply only text turns. No audio, provider keys or credentials cross this boundary.
        turns = [{"role": m["role"], "content": m["content"]} for m in context.get_messages()
                 if m.get("role") in {"user", "assistant"} and isinstance(m.get("content"), str)][-12:]
        turns.append({"role": "user", "content": question})
        try:
            answer = await ask_agent(turns, identity, url=os.environ.get("AGENT_SERVICE_URL", "http://127.0.0.1:48082"),
                                     token=required("AGENT_INTERNAL_TOKEN"))
            await params.result_callback({"answer": answer})
        except (RuntimeError, ValueError, httpx.HTTPError):
            await params.result_callback({"error": "复杂问题暂时未处理完成，请稍后重试"})

    if agent_enabled:
        llm.register_function("ask_agent", delegate, cancel_on_interruption=True, timeout_secs=175)
    aggregators = LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(params=VADParams(start_secs=0.15, stop_secs=0.3)),
        user_turn_strategies=UserTurnStrategies(stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)])))
    worker = PipelineWorker(Pipeline([transport.input(), stt, VoiceTranscripts(connection), aggregators.user(), llm, tts,
                                      transport.output(), VoiceStates(connection), aggregators.assistant()]),
                            enable_rtvi=False, params=PipelineParams(audio_in_sample_rate=16000, audio_out_sample_rate=24000))

    @transport.event_handler("on_client_disconnected")
    async def disconnected(_transport, _client):
        await worker.cancel()

    return worker
