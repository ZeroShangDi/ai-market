/* All capture, playback and connection resources belong to this optional module. */
const state = document.querySelector('#state');
const start = document.querySelector('#start'), stop = document.querySelector('#stop');
const mute = document.querySelector('#mute'), speaker = document.querySelector('#speaker');
const desktop = new URLSearchParams(location.search).get('desktop') === '1' && !!window.PortableVoice;
let ticket = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
let revision = 0, peer, stream, timeout, request, heartbeat, taskChannel;
window.portableHost = payload => {
  let value; try { value=JSON.parse(payload); } catch { return; }
  if (['task_notice','task_notice_cancel'].includes(value.type) && taskChannel?.readyState === 'open') taskChannel.send(JSON.stringify(value));
};
function release(message = '对话已结束') {
  revision++; taskChannel = undefined;
  clearTimeout(timeout); clearInterval(heartbeat);
  request?.abort(); request = undefined;
  stream?.getTracks().forEach(track => track.stop()); stream = undefined;
  const old = peer; peer = undefined; old?.close();
  speaker.pause(); speaker.srcObject = null;
  state.textContent = message;
  const bubble = document.querySelector('#transcript');
  bubble.textContent = ''; bubble.hidden = true;
  start.hidden = !ticket; start.disabled = false;
  mute.hidden = stop.hidden = true;
  window.PortableVoice?.state?.('closed');
}
start.onclick = async () => {
  if (!ticket || peer) return;
  const current = ++revision;
  start.disabled = true; stop.hidden = false;
  state.textContent = '正在连接…';
  timeout = setTimeout(() => release('连接超时，请关闭后重新打开语音'), 25000);
  try {
    if (!window.isSecureContext) throw new Error('语音需要安全连接，请配置 HTTPS');
    const capture = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if (current !== revision) { capture.getTracks().forEach(track => track.stop()); return; }
    stream = capture;
    const pc = new RTCPeerConnection(); peer = pc;
    const channel = pc.createDataChannel('chat'); taskChannel = channel;
    channel.onopen = () => {
      if (current !== revision) return;
      heartbeat = setInterval(() => { if (channel.readyState === 'open') channel.send('ping'); }, 1000);
    };
    channel.onmessage = event => {
      if (current !== revision) return;
      let value; try { value = JSON.parse(event.data); } catch { return; }
      if (['task_proposal','task_notice_ack'].includes(value.type)) { window.PortableVoice?.task?.(JSON.stringify(value)); return; }
      if (value.type === 'transcript' && ['user','assistant'].includes(value.role) && typeof value.text === 'string' && value.text.length <= 6000) {
        const bubble = document.querySelector('#transcript');
        bubble.hidden = false;
        bubble.textContent = (value.role === 'user' ? '你：' : '她：') + value.text;
        window.PortableVoice?.transcript(value.role, value.text);
        return;
      }
      if (value.type !== 'voice') return;
      if (value.state === 'error') { release(value.message || '语音服务暂时不可用'); return; }
      window.PortableVoice?.activity?.(value.state);
      if (!stream?.getAudioTracks()[0]?.enabled) return;
      const labels = {listening:'我在听',thinking:'正在想…',working:'正在查询…',speaking:'正在说…'};
      if (labels[value.state]) state.textContent = labels[value.state];
    };
    pc.ontrack = async event => {
      if (current !== revision) return;
      speaker.srcObject = event.streams[0] || new MediaStream([event.track]);
      try { await speaker.play(); } catch { release('无法播放语音，请关闭后重新打开'); }
    };
    pc.onconnectionstatechange = () => {
      if (current !== revision) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(timeout); start.hidden = true; mute.hidden = false;
        state.textContent = '我在听';
        window.PortableVoice?.state?.('connected');
      } else if (['failed','disconnected','closed'].includes(pc.connectionState)) release('连接已断开，请关闭后重新打开语音');
    };
    capture.getTracks().forEach(track => { track.onended = () => { if (current === revision) release('麦克风已停止'); }; pc.addTrack(track,capture); });
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('网络连接准备超时')), 8000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(deadline); resolve(); } });
    });
    if (current !== revision) return;
    request = new AbortController();
    const credential = ticket; ticket = ''; // One-use ticket; never silently replay a session.
    const response = await fetch('offer', {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${credential}`},
      body:JSON.stringify({sdp:pc.localDescription.sdp,type:'offer',host_task_bridge:!!window.PortableVoice?.task}),signal:request.signal});
    if (!response.ok) throw new Error(response.status === 401 ? '会话已过期，请关闭后重新打开语音' : '语音服务未就绪，请稍后重试');
    const answer = await response.json();
    if (current !== revision) return;
    await pc.setRemoteDescription({sdp:answer.sdp,type:answer.type});
  } catch (error) { if (current === revision) release(error.message || '无法开启语音，请检查麦克风权限'); }
};
stop.onclick = () => release();
mute.onclick = () => {
  const tracks = stream?.getAudioTracks() || [];
  const enabled = !tracks[0]?.enabled;
  tracks.forEach(track => { track.enabled = enabled; });
  mute.textContent = enabled ? '静音' : '取消静音';
  state.textContent = enabled ? '我在听' : '已静音';
};
window.addEventListener('pagehide', () => release());
document.addEventListener('visibilitychange', () => { if (document.hidden && !desktop) release(); });
if (!ticket) { start.disabled = true; state.textContent = '请从宠物入口打开语音'; }

if (desktop && ticket) start.click();
