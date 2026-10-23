"""语音包统一公开入口；核心方法使用 Python docstring（对应 JSDoc 职责）。"""
from ._audio import LocalAudio
from ._contracts import AudioTerminal, Limits, ProviderConfig, VoiceConfig, VoiceError, VoiceInfo
from ._engine import Voice
from ._provider import HttpSpeechProvider

__all__ = ["create_voice", "Voice", "ProviderConfig", "VoiceConfig", "VoiceInfo", "Limits", "VoiceError", "AudioTerminal"]


def create_voice(provider: ProviderConfig, *, limits: Limits = None, input_device=None, output_device=None,
                 audio_terminal: AudioTerminal = None) -> Voice:
    """创建可连接真实 ASR/TTS 和本机音频设备的语音实例。

    Args:
        provider: 服务地址、模型、凭据和已部署音色；由宿主显式提供。
        limits: 队列和超时限制；省略时采用 Limits 默认值。
        input_device: PortAudio 输入设备 ID / 名称，None 使用系统默认。
        output_device: PortAudio 输出设备 ID / 名称，None 使用系统默认。
        audio_terminal: 可选终端适配器；由终端先消回声，再投递 PCM。
            提供时不能同时指定本机设备参数。
    Returns:
        尚未启动的 Voice 实例；不自动录音或调用回复模型。
    Raises:
        VoiceError: 配置不是声明的数据类型。
    """
    if not isinstance(provider, ProviderConfig) or (limits is not None and not isinstance(limits, Limits)):
        raise VoiceError("INVALID_INPUT")
    if audio_terminal is not None:
        if (input_device is not None or output_device is not None
                or type(getattr(audio_terminal, "echo_cancellation", None)) is not bool
                or not callable(getattr(audio_terminal, "open_capture", None))
                or not callable(getattr(audio_terminal, "play_stream", None))):
            raise VoiceError("INVALID_INPUT")
    terminal = audio_terminal if audio_terminal is not None else LocalAudio(input_device, output_device)
    return Voice(HttpSpeechProvider(provider), terminal, limits or Limits())
