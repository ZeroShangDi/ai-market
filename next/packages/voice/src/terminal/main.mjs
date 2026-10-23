/**
 * 打开浏览器/WebView 麦克风并要求终端回声消除。
 * @param {{signal?: AbortSignal}} [options] 关闭或页面卸载时可取消。
 * @returns {Promise<{stream: MediaStream, echoCancellation: true, close: () => void}>}
 * 返回真实消回声音轨，由宿主连接自己的音频输入适配器。
 * @throws {Error} 不支持、未实际开启或权限拒绝；失败会停止已创建音轨。
 */
export async function openMicrophone({ signal } = {}) {
  const devices = globalThis.navigator?.mediaDevices;
  if (!devices?.getSupportedConstraints?.().echoCancellation) {
    throw new Error('ECHO_CANCELLATION_UNAVAILABLE');
  }
  if (signal?.aborted) throw new Error('CANCELLED');
  // getUserMedia 的权限弹窗不能由 AbortSignal 关闭；迟到结果立即释放。
  const stream = await devices.getUserMedia({
    audio: { echoCancellation: { exact: true }, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', close);
    stream.getTracks().forEach(track => track.stop());
  };
  try {
    if (signal?.aborted) throw new Error('CANCELLED');
    const tracks = stream.getAudioTracks();
    // 不能仅凭请求参数就宣称 AEC 生效，设置缺失也明确报不可用。
    if (!tracks.length || tracks.some(track => track.getSettings().echoCancellation !== true)) {
      throw new Error('ECHO_CANCELLATION_UNAVAILABLE');
    }
    signal?.addEventListener('abort', close, { once: true });
    return { stream, echoCancellation: true, close };
  } catch (error) {
    close();
    throw error;
  }
}
